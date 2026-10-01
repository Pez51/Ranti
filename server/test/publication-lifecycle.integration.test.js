import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('publication lifecycle on disposable PostgreSQL', () => {
  let db, cluster, databaseName, app, service, owner, other, admin;
  const auth = id => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });
  const valid = { title: 'Microscopio único', description: 'Equipo de laboratorio', category: 'Ciencias',
    condition: 'Usado', modality: 'Venta', price: '25.00', images: ['https://images.example.test/photo'] };
  const evidence = 'https://evidence.example.test/private-document';
  const create = (patch = {}) => service.createPublication(db, owner, { ...valid, ...patch });
  const submit = id => service.submitPublication(db, owner, id);
  const row = async id => (await db.query('SELECT * FROM publications WHERE id = $1', [id])).rows[0];
  const effects = async id => ({
    audit: (await db.query('SELECT * FROM audit_logs WHERE entity_id = $1', [id])).rows,
    outbox: (await db.query('SELECT * FROM outbox_events WHERE aggregate_id = $1', [id])).rows,
  });
  const review = (pub, decision = 'approve', extra = {}) => service.decidePublicationReview(db, admin, pub.id,
    { decision, reason: 'Revisión documentada', submittedAt: new Date(pub.submitted_at).toISOString(), ...extra });
  async function user(role = 'Egresado') {
    return (await db.query(`INSERT INTO users (email,password_hash,role,status,verification_status)
      VALUES ($1,'hash',$2,'Activa','Verificado') RETURNING id`, [`${randomUUID()}@ucsm.edu.pe`, role])).rows[0].id;
  }
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test') throw Error('Disposable DB required');
    cluster = new pg.Pool({ connectionString: url.href });
    databaseName = `publication_${randomUUID().replaceAll('-', '')}`;
    await cluster.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    db = new pg.Pool({ connectionString: url.href });
    await (await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules(); vi.doMock('../src/config/database.js', () => ({ default: db }));
    app = (await import('../src/app.js')).default;
    service = await import('../src/modules/publications/publication.service.js');
    owner = await user(); other = await user(); admin = await user('Administrador');
  });
  afterAll(async () => {
    vi.doUnmock('../src/config/database.js'); if (db) await db.end();
    if (databaseName) await cluster.query(`DROP DATABASE "${databaseName}"`);
    if (cluster) await cluster.end();
  });

  it('creates incomplete drafts, keeps them private and routes mine before :id', async () => {
    const res = await request(app).post('/api/publications').set(auth(owner)).send({ title: 'Draft' });
    expect(res.status).toBe(201); expect(res.body.publication.status).toBe('Borrador');
    const id = res.body.publication.id;
    expect((await request(app).get(`/api/publications/${id}`)).status).toBe(404);
    const mine = await request(app).get('/api/publications/mine').set(auth(owner));
    expect(mine.status).toBe(200); expect(mine.body.some(p => p.id === id)).toBe(true);
    expect((await request(app).post(`/api/publications/${id}/submit`).set(auth(owner))).status).toBe(422);
    expect((await effects(id)).audit).toHaveLength(1); expect((await effects(id)).outbox).toHaveLength(1);
  });
  it('submits basic risk, pauses visibility, reactivates and withdraws terminally with duplicate effects suppressed', async () => {
    const pub = await create(); const active = await submit(pub.id);
    expect(active).toMatchObject({ status: 'Activa', risk_level: 1, risk_policy_version: 'pilot-v1' });
    const before = await effects(pub.id);
    await submit(pub.id); expect(await effects(pub.id)).toEqual(before);
    expect((await request(app).get(`/api/publications/${pub.id}`)).status).toBe(200);
    await Promise.all([1, 2].map(() => service.pausePublication(db, owner, pub.id)));
    expect((await request(app).get(`/api/publications/${pub.id}`)).status).toBe(404);
    expect((await request(app).post('/api/operations').set(auth(other)).send({ publication_id: pub.id })).status).toBe(409);
    expect((await service.reactivatePublication(db, owner, pub.id)).status).toBe('Activa');
    await service.withdrawPublication(db, owner, pub.id);
    const terminal = await effects(pub.id); await service.withdrawPublication(db, owner, pub.id);
    expect(await effects(pub.id)).toEqual(terminal);
    for (const action of ['submitPublication', 'reactivatePublication', 'pausePublication'])
      await expect(service[action](db, owner, pub.id)).rejects.toMatchObject({ status: 409 });
    await expect(service.updatePublication(db, owner, pub.id, { title: 'Revive' })).rejects.toMatchObject({ status: 409 });
  });
  it('requires explicit modality selection for an incomplete draft even when the chosen value matches its sentinel', async () => {
    const { modality, ...incomplete } = valid;
    const pub = await service.createPublication(db, owner, incomplete);
    await expect(submit(pub.id)).rejects.toMatchObject({ status: 422 });
    await service.updatePublication(db, owner, pub.id, { modality });
    expect((await submit(pub.id)).status).toBe('Activa');
  });
  it('allows a complete legacy active publication to be paused and revalidated under the latest policy', async () => {
    const pub = await create(); await submit(pub.id);
    await db.query('UPDATE publications SET risk_policy_version=NULL WHERE id=$1', [pub.id]);
    await service.pausePublication(db, owner, pub.id);
    expect((await service.reactivatePublication(db, owner, pub.id))).toMatchObject({ status: 'Activa', risk_policy_version: 'pilot-v1' });
  });
  it('keeps incomplete values confined to drafts when an owner edits a paused publication', async () => {
    const pub = await create(); await submit(pub.id); await service.pausePublication(db, owner, pub.id);
    await expect(service.updatePublication(db, owner, pub.id, { title: '' })).rejects.toMatchObject({ status: 422 });
    expect((await row(pub.id)).title).toBe(valid.title);
  });
  it('requires DNS-valid HTTPS image hosts and rejects empty explicit ports', async () => {
    for (const url of [`https://${'a'.repeat(64)}.test/p`, `https://${Array(5).fill('a'.repeat(60)).join('.')}/p`, 'https://host:/p'])
      await expect(create({ images: [url] })).rejects.toMatchObject({ status: 400 });
  });
  it('authorizes all owner endpoints against the resource and rejects protected fields', async () => {
    const pub = await create();
    for (const action of ['submit', 'pause', 'reactivate', 'withdraw']) {
      expect((await request(app).post(`/api/publications/${pub.id}/${action}`).set(auth(other))).status).toBe(404);
      expect((await request(app).post(`/api/publications/${randomUUID()}/${action}`).set(auth(other))).status).toBe(404);
    }
    expect((await request(app).patch(`/api/publications/${pub.id}`).set(auth(other)).send({ title: 'Steal' })).status).toBe(404);
    expect((await request(app).patch(`/api/publications/${pub.id}`).set(auth(owner)).send({ status: 'Activa' })).status).toBe(400);
    expect((await request(app).get('/api/publications/mine')).status).toBe(401);
    expect((await request(app).get('/api/publications/mine').set(auth(other))).body.some(p => p.id === pub.id)).toBe(false);
    expect((await request(app).patch(`/api/publications/${pub.id}`).set(auth(owner)).send({ title: 'Edited' })).status).toBe(200);
    expect((await request(app).post(`/api/publications/${pub.id}/submit`).set(auth(owner))).status).toBe(200);
    for (const action of ['pause', 'reactivate', 'withdraw'])
      expect((await request(app).post(`/api/publications/${pub.id}/${action}`).set(auth(owner))).status).toBe(200);
  });
  it('requires evidence at level 3; protects owner mutations and current admin authorization', async () => {
    const pub = await create({ price: '1000' });
    await expect(submit(pub.id)).rejects.toMatchObject({ status: 422 });
    for (const id of [pub.id, randomUUID()])
      await expect(service.updatePublication(db, other, id, { title: 'Stolen' })).rejects.toMatchObject({ status: 404 });
    await service.updatePublication(db, owner, pub.id, { provenance_evidence_ref: evidence });
    const pending = await submit(pub.id); expect(pending.status).toBe('Pendiente de revisión');
    expect((await request(app).get('/api/admin/publications/reviews').set(auth(other))).status).toBe(403);
    const queue = await request(app).get('/api/admin/publications/reviews').set(auth(admin));
    expect(queue.status).toBe(200); expect(queue.body.items.some(p => p.id === pub.id && p.provenance_evidence_ref === evidence)).toBe(true);
    expect((await request(app).post(`/api/admin/publications/${pub.id}/review`).set(auth(admin))
      .send({ decision: 'approve', reason: 'Valid', submittedAt: pending.submitted_at })).status).toBe(200);
    const publicRes = await request(app).get(`/api/publications/${pub.id}`);
    expect(publicRes.status).toBe(200); expect(JSON.stringify(publicRes.body)).not.toContain(evidence);
    expect(publicRes.body).not.toHaveProperty('email'); expect(publicRes.body).not.toHaveProperty('owner_id');
    expect(JSON.stringify(await effects(pub.id))).not.toContain(evidence);
    const suspended = await user(); await db.query("UPDATE users SET status='Suspendida' WHERE id=$1", [suspended]);
    await expect(service.createPublication(db, suspended, valid)).rejects.toMatchObject({ status: 403 });
  });
  it.each(['approve', 'reject'])('serializes duplicate %s reviews, rejects conflicting and stale decisions', async decision => {
    const pub = await create({ price: 500 }); const pending = await submit(pub.id);
    const before = await effects(pub.id);
    const results = await Promise.all([1, 2].map(() => review(pending, decision)));
    expect(results[0].status).toBe(decision === 'approve' ? 'Activa' : 'Borrador');
    expect((await effects(pub.id)).audit).toHaveLength(before.audit.length + 1);
    expect((await effects(pub.id)).outbox).toHaveLength(before.outbox.length + 1);
    await expect(review(pending, decision === 'approve' ? 'reject' : 'approve')).rejects.toMatchObject({ status: 409 });
    if (decision === 'reject') {
      await service.updatePublication(db, owner, pub.id, { title: 'Corregida' });
      const resubmitted = await submit(pub.id);
      await expect(review(pending, 'approve')).rejects.toMatchObject({ status: 409 });
      expect((await review(resubmitted)).status).toBe('Activa');
    }
  });
  it.each(['approve', 'reject'])('keeps %s HTTP review responses private and preserves queue audit and retry semantics', async decision => {
    const pub = await create({ price: 1000, provenance_evidence_ref: evidence }); const pending = await submit(pub.id);
    const second = await user('Administrador');
    const access = async () => (await db.query("SELECT * FROM audit_logs WHERE entity_id=$1 AND action='publication.evidence.viewed'", [pub.id])).rows;
    for (const reviewer of [admin, admin, second]) {
      const queue = await request(app).get('/api/admin/publications/reviews?limit=100').set(auth(reviewer));
      expect(queue.status).toBe(200);
      expect(queue.body.items.find(item => item.id === pub.id).provenance_evidence_ref).toBe(evidence);
    }
    expect((await access()).map(item => item.actor_id).sort()).toEqual([admin, admin, second].sort());
    const before = await effects(pub.id);
    for (const reviewer of [admin, admin, second]) {
      const response = await request(app).post(`/api/admin/publications/${pub.id}/review`).set(auth(reviewer))
        .send({ decision, reason: 'Reviewed', submittedAt: pending.submitted_at });
      expect(response.status).toBe(reviewer === admin ? 200 : 409);
      expect.soft(response.body).not.toHaveProperty('provenance_evidence_ref');
      expect.soft(JSON.stringify(response.body)).not.toContain(evidence);
    }
    const recorded = await effects(pub.id);
    expect(recorded.audit).toHaveLength(before.audit.length + 1);
    expect(recorded.outbox).toHaveLength(before.outbox.length + 1);
    expect(await access()).toHaveLength(3);
    expect(JSON.stringify(recorded)).not.toContain(evidence);
  });
  it('revalidates approval evidence and requires reason, then recalculates active edits and paused reactivation', async () => {
    const pub = await create(); await submit(pub.id);
    const pending = await service.updatePublication(db, owner, pub.id, { price: '1000', provenance_evidence_ref: evidence });
    expect(pending).toMatchObject({ status: 'Pendiente de revisión', risk_level: 3 });
    await expect(review(pending, 'approve', { reason: '' })).rejects.toMatchObject({ status: 400 });
    await db.query('UPDATE publications SET provenance_evidence_ref=NULL WHERE id=$1', [pub.id]);
    await expect(review(pending)).rejects.toMatchObject({ status: 422 });
    await db.query('UPDATE publications SET provenance_evidence_ref=$2 WHERE id=$1', [pub.id, evidence]);
    await review(pending); await service.pausePublication(db, owner, pub.id);
    await service.updatePublication(db, owner, pub.id, { price: '500', provenance_evidence_ref: null });
    expect((await service.reactivatePublication(db, owner, pub.id))).toMatchObject({ status: 'Pendiente de revisión', risk_level: 2 });
  });
  it.each([[], Array(5).fill('https://example.test/p'), ['http://example.test/p'], ['https://user:pass@example.test/p'],
    ['https://host:0/p'], ['https://host:65536/p'], ['https://bad_host/p'], ['https://example.test\\@evil.test/p']].map(images => [images]))(
    'rejects invalid submission images %j without publishing', async images => {
      // Empty drafts are valid; malformed supplied URLs are rejected at save time.
      if (images.length === 0) {
        const pub = await create({ images }); await expect(submit(pub.id)).rejects.toMatchObject({ status: 422 });
      } else await expect(create({ images })).rejects.toMatchObject({ status: 400 });
    });
  it('filters combined parameterized fields and excludes sales from availability searches', async () => {
    const marker = randomUUID();
    const rented = await create({ title: marker, modality: 'Alquiler', guarantee_amount: 100,
      available_from: '2026-10-01', available_until: '2026-10-10' }); await submit(rented.id);
    const sale = await create({ title: marker }); await submit(sale.id);
    const res = await request(app).get('/api/publications').query({ search: marker, category: 'Ciencias', condition: 'Usado',
      modality: 'Alquiler', minPrice: 20, maxPrice: 30, availableFrom: '2026-10-02', availableUntil: '2026-10-09' });
    expect(res.status).toBe(200); expect(res.body.map(p => p.id)).toEqual([rented.id]);
    expect((await request(app).get('/api/publications').query({ search: marker, availableFrom: '2026-10-02' })).body.map(p => p.id)).toEqual([rented.id]);
    expect((await request(app).get('/api/publications').query({ search: "' OR 1=1 --" })).body).toEqual([]);
    for (const query of [{ minPrice: 30, maxPrice: 20 }, { modality: 'unknown' }, { availableFrom: '2026-02-30' },
      { availableFrom: '2026-10-09', availableUntil: '2026-10-01' }, { minPrice: '1.001' }, { condition: '' }])
      expect((await request(app).get('/api/publications').query(query)).status).toBe(400);
  });
  async function operation(pub, status = 'Pendiente') {
    const pending = status === 'Pendiente';
    const cancelled = status === 'Cancelada';
    return (await db.query(`INSERT INTO operations
      (publication_id,demandante_id,oferente_id,modality,status,contract_snapshot,
       requested_price,requested_contract_version,request_expires_at,
       accepted_at,decided_at,decided_by,cancelled_at,cancelled_by,cancellation_reason)
      VALUES ($1,$2,$3,'Venta',$4,$5,25,1,now()+interval '48 hours',
        CASE WHEN $6 THEN NULL ELSE now() END,
        CASE WHEN $6 THEN NULL ELSE now() END,
        CASE WHEN $6 THEN NULL ELSE $3::uuid END,
        CASE WHEN $7 THEN now() ELSE NULL END,
        CASE WHEN $7 THEN $2::uuid ELSE NULL END,
        CASE WHEN $7 THEN 'requester_cancelled' ELSE NULL END) RETURNING id`,
    [pub.id, other, owner, status, pending || cancelled ? null : {}, pending || cancelled, cancelled])).rows[0].id;
  }
  async function waitingForOperationLock(pid) {
    return (await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND pid=$1 AND wait_event_type='Lock' AND query LIKE '%operations%FOR UPDATE%'`, [pid])).rowCount > 0;
  }
  it.each(['another database', 'another backend'])('ignores an unrelated operations lock wait in %s', async location => {
    const source = location === 'another database' ? cluster : db;
    const blocker = await source.connect(); const unrelated = await source.connect(); const participant = await db.connect();
    const key = parseInt(randomUUID().slice(0, 8), 16);
    let blocked;
    try {
      await blocker.query('SELECT pg_advisory_lock($1)', [key]);
      blocked = unrelated.query('SELECT pg_advisory_lock($1) /* operations FOR UPDATE */', [key]);
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting = (await source.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid=$1 AND wait_event_type='Lock'", [unrelated.processID])).rowCount > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      expect(await waitingForOperationLock(participant.processID)).toBe(false);
    } finally {
      await blocker.query('SELECT pg_advisory_unlock($1)', [key]);
      if (blocked) await blocked;
      await unrelated.query('SELECT pg_advisory_unlock($1)', [key]);
      blocker.release(); unrelated.release(); participant.release();
    }
  });
  it.each(['Aceptada', 'Pendiente de pago/garantía', 'Lista para entrega', 'Entregada/Activa', 'En cierre',
    'Pendiente de resolución económica', 'En incidencia'])('blocks contractual edits and lifecycle with operation %s', async status => {
    const pub = await create(); await submit(pub.id); await operation(pub, status);
    await expect(service.updatePublication(db, owner, pub.id, { title: 'Changed' })).rejects.toMatchObject({ status: 409 });
    for (const action of ['pausePublication', 'reactivatePublication', 'withdrawPublication'])
      await expect(service[action](db, owner, pub.id)).rejects.toMatchObject({ status: 409 });
  });
  it.each(['Pendiente', 'Cancelada', 'Cerrada'])('permits edits for non-blocking operation %s', async status => {
    const pub = await create(); await submit(pub.id); await operation(pub, status);
    expect((await service.updatePublication(db, owner, pub.id, { title: 'Changed' })).title).toBe('Changed');
  });
  it('waits for a locked pending operation and observes its committed transition before pausing', async () => {
    const pub = await create(); await submit(pub.id); const op = await operation(pub);
    const blocker = await db.connect(); await blocker.query('BEGIN');
    await blocker.query(`UPDATE operations SET status='Aceptada',contract_snapshot='{}',
      accepted_at=now(),decided_at=now(),decided_by=$2 WHERE id=$1`, [op, owner]);
    const participant = await db.connect();
    const participantDb = { connect: async () => ({ query: participant.query.bind(participant), release() {} }) };
    const paused = service.pausePublication(participantDb, owner, pub.id).then(value => ({ value }), error => ({ error }));
    try {
      // Observe an actual lock wait, not timing-dependent sleeps.
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting = await waitingForOperationLock(participant.processID);
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true); await blocker.query('COMMIT');
      expect((await paused).error).toMatchObject({ status: 409 }); expect((await row(pub.id)).status).toBe('Activa');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); await paused; participant.release(); }
  });
  it('rechecks a pause committed while an operation request is waiting on the publication', async () => {
    const pub = await create(); await submit(pub.id);
    const blocker = await db.connect(); await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE', [pub.id]);
    const pause = service.pausePublication(db, owner, pub.id);
    let reserve;
    try {
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting = (await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%AND owner_id=$2%FOR UPDATE%'`)).rowCount > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      reserve = request(app).post('/api/operations').set(auth(other)).send({ publication_id: pub.id }).then(result => result);
      let reserveWaiting = false;
      for (let i = 0; i < 100 && !reserveWaiting; i++) {
        reserveWaiting = (await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query = 'SELECT * FROM publications WHERE id = $1 FOR UPDATE'`)).rowCount > 0;
        if (!reserveWaiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(reserveWaiting).toBe(true); await blocker.query('COMMIT'); await pause;
      expect((await reserve).status).toBe(409);
      expect((await db.query('SELECT id FROM operations WHERE publication_id=$1', [pub.id])).rows).toHaveLength(0);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); await pause; if (reserve) await reserve; }
  });
  it('rejects an admin whose demotion commits before the locked authorization read', async () => {
    const pub = await create({ price: 500 }); const pending = await submit(pub.id);
    const reviewer = await user('Administrador'); const recorded = await effects(pub.id);
    const blocker = await db.connect(); await blocker.query('BEGIN');
    await blocker.query("UPDATE users SET role='Egresado' WHERE id=$1", [reviewer]);
    const decision = service.decidePublicationReview(db, reviewer, pub.id, {
      decision: 'approve', reason: 'Reviewed', submittedAt: pending.submitted_at.toISOString(),
    }).then(value => ({ value }), error => ({ error }));
    try {
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting = (await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%FROM users WHERE id=$1%UPDATE'`)).rowCount > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true); await blocker.query('COMMIT');
      expect((await decision).error).toMatchObject({ status: 403 });
      expect((await row(pub.id)).status).toBe('Pendiente de revisión'); expect(await effects(pub.id)).toEqual(recorded);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); await decision; }
  });
  it('does not deadlock an in-flight operation inserting owner foreign keys against a waiting owner mutation', async () => {
    const pub = await create(); await submit(pub.id);
    const reservation = await db.connect(); await reservation.query('BEGIN');
    await reservation.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE', [pub.id]);
    const pause = service.pausePublication(db, owner, pub.id).then(value => ({ value }), error => ({ error }));
    let insertion;
    try {
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting = (await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%AND owner_id=$2%FOR UPDATE%'`)).rowCount > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      insertion = await reservation.query(`INSERT INTO operations
        (publication_id,demandante_id,oferente_id,modality,status,contract_snapshot,
         requested_price,requested_contract_version,request_expires_at)
        VALUES ($1,$2,$3,'Venta','Pendiente',NULL,25,1,now()+interval '48 hours') RETURNING id`,
      [pub.id, other, owner])
        .then(result => ({ result }), error => ({ error }));
      await reservation.query('COMMIT');
      const outcome = await pause;
      expect(insertion.error).toBeUndefined(); expect(outcome.error).toBeUndefined();
      expect(outcome.value.status).toBe('Pausada');
    } finally { await reservation.query('ROLLBACK'); reservation.release(); await pause; }
  });
  it.each(['publication_images', 'audit_logs', 'outbox_events'])('rolls back edits and effects when %s fails', async table => {
    const pub = await create(); const before = await row(pub.id); const recorded = await effects(pub.id);
    const key = table === 'publication_images' ? 'publication_id' : table === 'audit_logs' ? 'entity_id' : 'aggregate_id';
    const constraint = `task4_${randomUUID().replaceAll('-', '')}`;
    await db.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (${key} <> '${pub.id}'::uuid) NOT VALID`);
    try {
      await expect(service.updatePublication(db, owner, pub.id, { title: 'Never persisted', images: ['https://images.example.test/new'] })).rejects.toMatchObject({ status: 500 });
      expect(await row(pub.id)).toEqual(before); expect(await effects(pub.id)).toEqual(recorded);
      expect((await db.query('SELECT image_url FROM publication_images WHERE publication_id=$1', [pub.id])).rows).toEqual([{ image_url: valid.images[0] }]);
    } finally { await db.query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`); }
  });
  async function unorderedImageIds(id, urls) {
    const prefix = randomUUID().slice(0, 24);
    // UUID order deliberately opposes insertion order; timestamps are shared
    // because all rows are inserted in the same transaction.
    for (let i = 0; i < urls.length; i++) await db.query(
      'UPDATE publication_images SET id=$3 WHERE publication_id=$1 AND image_url=$2',
      [id, urls[i], `${prefix}${String(10 - i).padStart(12, '0')}`]);
  }
  it.each([3, 4])('round-trips %i images in submitted order through owner, admin and public reads', async count => {
    const urls = Array.from({ length: count }, (_, i) => `https://images.example.test/ordered-${i}`);
    const pub = await create({ price: 1000, images: urls, provenance_evidence_ref: evidence });
    await unorderedImageIds(pub.id, urls);
    expect((await service.listOwnPublications(db, owner)).find(p => p.id === pub.id).images).toEqual(urls);
    const pending = await submit(pub.id); expect(pending.images).toEqual(urls);
    const queue = await service.listPendingPublicationReviews(db, admin, { limit: 100 });
    expect(queue.items.find(p => p.id === pub.id).images).toEqual(urls);
    await review(pending);
    expect((await service.getPublicPublication(db, pub.id)).images.map(image => image.image_url)).toEqual(urls);
  });
  it.each([500, 1000])('identical four-image PATCH preserves approval and effects at exposure %i', async price => {
    const urls = [0, 1, 2, 3].map(i => `https://images.example.test/noop-${i}`);
    const pub = await create({ price, images: urls, provenance_evidence_ref: evidence });
    await unorderedImageIds(pub.id, urls);
    await review(await submit(pub.id));
    const before = await row(pub.id); const recorded = await effects(pub.id);
    const imageRows = (await db.query('SELECT * FROM publication_images WHERE publication_id=$1 ORDER BY id', [pub.id])).rows;
    const patched = await service.updatePublication(db, owner, pub.id, { images: urls });
    expect(patched.status).toBe('Activa'); expect(patched.images).toEqual(urls);
    expect(await row(pub.id)).toEqual(before); expect(await effects(pub.id)).toEqual(recorded);
    expect((await db.query('SELECT * FROM publication_images WHERE publication_id=$1 ORDER BY id', [pub.id])).rows).toEqual(imageRows);
  });
  it('audits each returned provenance reference access and denies non-current administrators without disclosure', async () => {
    const withEvidence = await create({ price: 1000, provenance_evidence_ref: evidence }); await submit(withEvidence.id);
    const withoutEvidence = await create({ price: 500 }); await submit(withoutEvidence.id);
    const reviewer = await user('Administrador');
    const access = async () => (await db.query("SELECT * FROM audit_logs WHERE actor_id=$1 AND action='publication.evidence.viewed'", [reviewer])).rows;
    const queue = await service.listPendingPublicationReviews(db, reviewer, { limit: 100 });
    const expectedIds = queue.items.filter(p => p.provenance_evidence_ref).map(p => p.id).sort();
    const logged = await access();
    expect(logged.map(a => a.entity_id).sort()).toEqual(expectedIds);
    expect(logged.find(a => a.entity_id === withEvidence.id)).toMatchObject({ actor_id: reviewer,
      entity_type: 'publication', old_values: null, new_values: null,
      metadata: { source: 'admin-publication-review-queue' } });
    expect(logged.some(a => a.entity_id === withoutEvidence.id)).toBe(false);
    expect(JSON.stringify(logged)).not.toContain(evidence);
    expect((await effects(withEvidence.id)).outbox.filter(e => e.event_type === 'publication.evidence.viewed')).toEqual([]);
    await service.listPendingPublicationReviews(db, reviewer, { limit: 100 });
    expect(await access()).toHaveLength(expectedIds.length * 2);
    for (const column of ['role', 'status', 'verification_status']) {
      const value = column === 'role' ? 'Egresado' : column === 'status' ? 'Suspendida' : 'No verificado';
      await db.query(`UPDATE users SET ${column}=$2 WHERE id=$1`, [reviewer, value]);
      await expect(service.listPendingPublicationReviews(db, reviewer)).rejects.toMatchObject({ status: 403 });
      expect(await access()).toHaveLength(expectedIds.length * 2);
      await db.query("UPDATE users SET role='Administrador',status='Activa',verification_status='Verificado' WHERE id=$1", [reviewer]);
    }
  });
  it('returns no review data and rolls back all evidence-access audit rows if one audit insert fails', async () => {
    const first = await create({ price: 1000, provenance_evidence_ref: evidence }); await submit(first.id);
    const second = await create({ price: 1000, provenance_evidence_ref: 'https://evidence.example.test/second' }); await submit(second.id);
    const reviewer = await user('Administrador');
    const constraint = `evidence_${randomUUID().replaceAll('-', '')}`;
    await db.query(`ALTER TABLE audit_logs ADD CONSTRAINT ${constraint}
      CHECK (actor_id <> '${reviewer}'::uuid OR entity_id <> '${second.id}'::uuid) NOT VALID`);
    try {
      const response = await request(app).get('/api/admin/publications/reviews?limit=100').set(auth(reviewer));
      expect(response.status).toBe(500); expect(response.body).not.toHaveProperty('items');
      expect(JSON.stringify(response.body)).not.toContain('https://');
      expect((await db.query('SELECT id FROM audit_logs WHERE actor_id=$1', [reviewer])).rows).toEqual([]);
      expect((await row(first.id)).status).toBe('Pendiente de revisión');
      expect((await row(second.id)).status).toBe('Pendiente de revisión');
    } finally { await db.query(`ALTER TABLE audit_logs DROP CONSTRAINT ${constraint}`); }
  });
});
