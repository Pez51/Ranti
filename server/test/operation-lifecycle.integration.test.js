import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('pending operation requests on disposable PostgreSQL', () => {
  let db, cluster, databaseName, app, service, requester, owner, stranger;
  const auth = id => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });
  const saleTerms = pub => ({ publication_id: pub.id, requested_price: '25.00',
    requested_guarantee_amount: '0.00', requested_contract_version: Number(pub.contract_version) });
  async function user(status = 'Activa', verification = 'Verificado') {
    return (await db.query(`INSERT INTO users (email,password_hash,role,status,verification_status,display_name)
      VALUES ($1,'hash','Estudiante',$2,$3,'Persona') RETURNING id`,
    [`${randomUUID()}@ucsm.edu.pe`, status, verification])).rows[0].id;
  }
  async function publication(modality = 'Venta', publicationOwner = owner, status = 'Activa') {
    return (await db.query(`INSERT INTO publications (owner_id,title,description,category,condition,modality,
      price,guarantee_amount,available_from,available_until,status)
      VALUES ($1,'Microscopio','Detalle privado','Ciencias','Usado',$2,$3,0,$4,$5,$6)
      RETURNING id,contract_version`, [publicationOwner, modality, modality === 'Préstamo' ? 0 : 25,
      modality === 'Venta' ? null : '2026-12-01T00:00:00Z',
      modality === 'Venta' ? null : '2027-01-01T00:00:00Z', status])).rows[0];
  }
  const effects = async id => ({ audit: (await db.query('SELECT * FROM audit_logs WHERE entity_id=$1', [id])).rows,
    outbox: (await db.query('SELECT * FROM outbox_events WHERE aggregate_id=$1', [id])).rows });
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test') throw Error('Disposable DB required');
    cluster = new pg.Pool({ connectionString: url.href });
    databaseName = `operation_${randomUUID().replaceAll('-', '')}`;
    await cluster.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`; db = new pg.Pool({ connectionString: url.href });
    await (await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules(); vi.doMock('../src/config/database.js', () => ({ default: db }));
    app = (await import('../src/app.js')).default;
    service = await import('../src/modules/operations/operation.service.js');
    requester = await user(); owner = await user(); stranger = await user();
  });
  afterAll(async () => {
    vi.doUnmock('../src/config/database.js'); if (db) await db.end();
    if (databaseName) await cluster.query(`DROP DATABASE "${databaseName}"`);
    if (cluster) await cluster.end();
  });
  it('creates a pending sale with requested terms, safe projection, audit, and no reservation', async () => {
    const pub = await publication();
    const publicDetail = await request(app).get(`/api/publications/${pub.id}`);
    expect(publicDetail.body.contract_version).toBe(1);
    const response = await request(app).post('/api/operations').set(auth(requester)).send(saleTerms(pub));
    expect(response.status).toBe(201);
    expect(Object.keys(response.body)).toEqual(['operation']);
    expect(response.body.operation).toMatchObject({ status: 'Pendiente', requested_price: '25.00',
      requested_guarantee_amount: '0.00', requested_contract_version: 1, contract_snapshot: null,
      publication: { id: pub.id, title: 'Microscopio', contract_version: 1 },
      counterpart: { id: owner, display_name: 'Persona' }, allowed_actions: ['cancel'] });
    expect(new Date(response.body.operation.request_expires_at).getTime() - Date.now()).toBeGreaterThan(47 * 3600000);
    const id = response.body.operation.id;
    const stored = (await db.query('SELECT * FROM operations WHERE id=$1', [id])).rows[0];
    expect(stored).toMatchObject({ status: 'Pendiente', otp_code: null, contract_snapshot: null });
    expect((await db.query('SELECT * FROM reservations WHERE operation_id=$1', [id])).rows).toEqual([]);
    expect((await effects(id)).audit.map(row => row.action)).toEqual(['operation.requested']);
    expect((await effects(id)).outbox.map(row => row.event_type)).toEqual(['operation.requested']);
    expect(JSON.stringify(response.body)).not.toMatch(/email|password_hash|otp_code|evidence|worker/i);
  });
  it.each(['Alquiler', 'Préstamo'])('accepts valid %s request without reserving it', async modality => {
    const pub = await publication(modality);
    const response = await request(app).post('/api/operations').set(auth(requester)).send({ publication_id: pub.id,
      requested_price: modality === 'Préstamo' ? '0.00' : '25.00', requested_guarantee_amount: '0.00',
      requested_contract_version: 1, start_date: '2026-12-02', end_date: '2026-12-03' });
    expect(response.status).toBe(201); expect(response.body.operation.status).toBe('Pendiente');
    expect((await db.query('SELECT * FROM reservations WHERE operation_id=$1', [response.body.operation.id])).rows).toEqual([]);
  });
  it('rejects rental intervals outside the current availability window', async () => {
    const pub = await publication('Alquiler');
    const terms = { publication_id: pub.id, requested_price: '25.00', requested_guarantee_amount: '0.00',
      requested_contract_version: 1 };
    for (const dates of [
      { start_date: '2026-11-30', end_date: '2026-12-03' },
      { start_date: '2026-12-30', end_date: '2027-01-02' },
      { start_date: '2026-12-03', end_date: '2026-12-02' },
    ]) expect((await request(app).post('/api/operations').set(auth(requester)).send({ ...terms, ...dates })).status).toBe(422);
    expect((await db.query('SELECT id FROM operations WHERE publication_id=$1', [pub.id])).rows).toEqual([]);
  });
  it('lists only current participant rows with exact filters, pagination and detail privacy', async () => {
    const pub = await publication(); const outsiderPub = await publication('Venta', stranger);
    const first = await request(app).post('/api/operations').set(auth(requester)).send(saleTerms(pub));
    const second = await request(app).post('/api/operations').set(auth(requester)).send(saleTerms(pub));
    const unrelated = await request(app).post('/api/operations').set(auth(owner)).send(saleTerms(outsiderPub));
    expect([first.status, second.status, unrelated.status]).toEqual([201, 201, 201]);
    const mine = await request(app).get('/api/operations/mine?side=requested&status=Pendiente&limit=1&offset=0').set(auth(requester));
    expect(mine.status).toBe(200); expect(mine.body).toMatchObject({ limit: 1, offset: 0 });
    expect(mine.body.items).toHaveLength(1);
    const ordered = (await db.query(`SELECT id FROM operations WHERE demandante_id=$1 AND status='Pendiente'
      ORDER BY updated_at DESC,id DESC`, [requester])).rows.map(row => row.id);
    expect(mine.body.items[0].id).toBe(ordered[0]);
    const next = await request(app).get('/api/operations/mine?side=requested&status=Pendiente&limit=1&offset=1').set(auth(requester));
    expect(next.body.items).toHaveLength(1); expect(next.body.items[0].id).toBe(ordered[1]);
    const received = await request(app).get('/api/operations/mine?side=received').set(auth(owner));
    expect(received.body.items.map(item => item.id)).toEqual(expect.arrayContaining([first.body.operation.id, second.body.operation.id]));
    expect(received.body.items.map(item => item.id)).not.toContain(unrelated.body.operation.id);
    expect(received.body.items[0].allowed_actions).toEqual(['accept', 'reject']);
    expect((await request(app).get(`/api/operations/${first.body.operation.id}`).set(auth(stranger))).status).toBe(404);
    expect((await request(app).get(`/api/operations/${first.body.operation.id}`).set(auth(owner))).body.operation.counterpart.id).toBe(requester);
    for (const query of ['limit=0', 'limit=101', 'offset=-1', 'offset=10001', 'side=other', 'status=unknown'])
      expect((await request(app).get(`/api/operations/mine?${query}`).set(auth(requester))).status).toBe(400);
  });
  it('rejects stale terms, self requests, unavailable publications and unavailable accounts without effects', async () => {
    const pub = await publication();
    for (const input of [
      { ...saleTerms(pub), requested_price: '24.00' },
      { ...saleTerms(pub), requested_contract_version: 2 },
      { ...saleTerms(pub), start_date: '2026-12-02' },
    ]) expect((await request(app).post('/api/operations').set(auth(requester)).send(input)).status).toBeGreaterThanOrEqual(400);
    expect((await request(app).post('/api/operations').set(auth(owner)).send(saleTerms(pub))).status).toBeGreaterThanOrEqual(400);
    expect((await request(app).post('/api/operations').set(auth(requester)).send({ ...saleTerms(pub), publication_id: randomUUID() })).status).toBe(404);
    const paused = await publication('Venta', owner, 'Pausada');
    expect((await request(app).post('/api/operations').set(auth(requester)).send(saleTerms(paused))).status).toBeGreaterThanOrEqual(400);
    const suspended = await user('Suspendida');
    expect((await request(app).post('/api/operations').set(auth(suspended)).send(saleTerms(pub))).status).toBe(403);
    const unverified = await user('Activa', 'No verificado');
    expect((await request(app).post('/api/operations').set(auth(unverified)).send(saleTerms(pub))).status).toBe(403);
    expect((await db.query('SELECT * FROM operations WHERE publication_id=$1', [pub.id])).rows).toEqual([]);
    expect((await db.query(`SELECT a.* FROM audit_logs a JOIN operations o ON o.id=a.entity_id
      WHERE a.action='operation.requested' AND o.publication_id=$1`, [pub.id])).rows).toEqual([]);
    expect((await db.query("SELECT * FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows).toEqual([]);
  });
  it('rolls back the operation and audit when outbox insert fails', async () => {
    const pub = await publication(); const constraint = `request_${randomUUID().replaceAll('-', '')}`;
    const before = (await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE action='operation.requested'")).rows[0].count;
    await db.query(`ALTER TABLE outbox_events ADD CONSTRAINT ${constraint} CHECK (aggregate_type <> 'operation') NOT VALID`);
    try {
      await expect(service.requestOperation(db, requester, saleTerms(pub))).rejects.toMatchObject({
        status: 500, code: 'INTERNAL_ERROR', cause: { code: '23514', constraint },
      });
      const response = await request(app).post('/api/operations').set(auth(requester)).send(saleTerms(pub));
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain(constraint);
      expect((await db.query('SELECT * FROM operations WHERE publication_id=$1', [pub.id])).rows).toEqual([]);
      expect((await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE action='operation.requested'")).rows[0].count).toBe(before);
      expect((await db.query("SELECT * FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows).toEqual([]);
    } finally { await db.query(`ALTER TABLE outbox_events DROP CONSTRAINT ${constraint}`); }
  });
  it('uses current database state for both participants and participant reads', async () => {
    const pub = await publication();
    await db.query("UPDATE users SET verification_status='No verificado' WHERE id=$1", [owner]);
    await expect(service.requestOperation(db, requester, saleTerms(pub))).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE users SET verification_status='Verificado' WHERE id=$1", [owner]);
    const created = await service.requestOperation(db, requester, saleTerms(pub));
    await db.query("UPDATE users SET status='Suspendida' WHERE id=$1", [requester]);
    await expect(service.listParticipantOperations(db, requester, { side: 'requested' })).rejects.toMatchObject({ status: 403 });
    await expect(service.getParticipantOperation(db, requester, created.id)).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE users SET status='Activa' WHERE id=$1", [requester]);
    await expect(service.getParticipantOperation(db, stranger, created.id)).rejects.toMatchObject({ status: 404 });
  });
  it('denies a deleted requester before any request effect or open transaction', async () => {
    const pub = await publication(); const deletedRequester = await user();
    const beforeAudit = (await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE action='operation.requested'")).rows[0].count;
    const beforeOutbox = (await db.query("SELECT COUNT(*)::int AS count FROM outbox_events WHERE event_type='operation.requested'")).rows[0].count;
    await db.query('DELETE FROM users WHERE id=$1', [deletedRequester]);
    await expect(service.requestOperation(db, deletedRequester, saleTerms(pub))).rejects.toMatchObject({ status: 403 });
    await expect(service.listParticipantOperations(db, deletedRequester)).rejects.toMatchObject({ status: 403 });
    expect((await request(app).post('/api/operations').set(auth(deletedRequester)).send(saleTerms(pub))).status).toBe(401);
    expect((await db.query('SELECT id FROM operations WHERE publication_id=$1', [pub.id])).rows).toEqual([]);
    expect((await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE action='operation.requested'")).rows[0].count).toBe(beforeAudit);
    expect((await db.query("SELECT COUNT(*)::int AS count FROM outbox_events WHERE event_type='operation.requested'")).rows[0].count).toBe(beforeOutbox);
    expect((await db.query("SELECT * FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows).toEqual([]);
  });
  it('rejects a request when ownership changes after owner discovery but before the publication lock', async () => {
    const pub = await publication();
    const before = (await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE action='operation.requested'")).rows[0].count;
    const beforeOutbox = (await db.query("SELECT COUNT(*)::int AS count FROM outbox_events WHERE event_type='operation.requested'")).rows[0].count;
    const blocker = await db.connect(); await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [owner]);
    let pending;
    try {
      pending = service.requestOperation(db, requester, saleTerms(pub)).then(value => ({ value }), error => ({ error }));
      let waiting = false;
      for (let i = 0; i < 150 && !waiting; i++) {
        waiting = (await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%FROM users WHERE id=$1 FOR NO KEY UPDATE%'`)).rowCount > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await blocker.query('UPDATE publications SET owner_id=$2 WHERE id=$1', [pub.id, stranger]);
      await blocker.query('COMMIT');
      expect((await pending).error).toMatchObject({ status: 409, code: 'PUBLICATION_UNAVAILABLE' });
      expect((await db.query('SELECT owner_id FROM publications WHERE id=$1', [pub.id])).rows[0].owner_id).toBe(stranger);
      expect((await db.query('SELECT id FROM operations WHERE publication_id=$1', [pub.id])).rows).toEqual([]);
      expect((await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE action='operation.requested'")).rows[0].count).toBe(before);
      expect((await db.query("SELECT COUNT(*)::int AS count FROM outbox_events WHERE event_type='operation.requested'")).rows[0].count).toBe(beforeOutbox);
      expect((await db.query("SELECT * FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows).toEqual([]);
    } finally {
      await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending;
    }
  });
  it('accepts once with an immutable snapshot and one reservation, then repeats without effects', async () => {
    const pub = await publication();
    const created = await service.requestOperation(db, requester, saleTerms(pub));
    const accepted = await request(app).post(`/api/operations/${created.id}/accept`).set(auth(owner)).send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.operation).toMatchObject({ status: 'Aceptada',
      contract_snapshot: { publication_id: pub.id, contract_version: 1, agreed_price: '25.00',
        demandante_id: requester, oferente_id: owner }, allowed_actions: [] });
    const stored = (await db.query('SELECT * FROM operations WHERE id=$1', [created.id])).rows[0];
    expect(stored).toMatchObject({ status: 'Aceptada', decided_by: owner, decision_reason: null });
    expect(stored.accepted_at).toEqual(stored.decided_at);
    expect((await db.query('SELECT status,start_date,end_date FROM reservations WHERE operation_id=$1', [created.id])).rows)
      .toEqual([{ status: 'Reservada/Bloqueada', start_date: null, end_date: null }]);
    const before = await effects(created.id);
    expect(before.audit.map(row => row.action)).toEqual(['operation.requested', 'operation.accepted']);
    expect(before.outbox.map(row => row.event_type)).toEqual(['operation.requested', 'operation.accepted']);
    expect((await request(app).post(`/api/operations/${created.id}/accept`).set(auth(owner)).send({})).status).toBe(200);
    expect((await request(app).post(`/api/operations/${created.id}/reject`).set(auth(owner)).send({ reason: 'No' })).status).toBe(409);
    expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1', [created.id])).rowCount).toBe(1);
    expect((await effects(created.id)).audit).toHaveLength(before.audit.length);
    expect((await effects(created.id)).outbox).toHaveLength(before.outbox.length);
    expect(JSON.stringify(accepted.body)).not.toMatch(/email|password_hash|otp_code|evidence|worker/i);
    const requesterView = await request(app).get(`/api/operations/${created.id}`).set(auth(requester));
    expect(requesterView.status).toBe(200);
    expect(requesterView.body.operation).toMatchObject({ status: 'Aceptada', allowed_actions: ['cancel'],
      counterpart: { id: owner }, contract_snapshot: { publication_id: pub.id, agreed_price: '25.00' } });
  });
  it('rejects with a normalized reason, no reservation, and idempotent retries', async () => {
    const pub = await publication(); const created = await service.requestOperation(db, requester, saleTerms(pub));
    expect((await request(app).post(`/api/operations/${created.id}/reject`).set(auth(owner)).send({ reason: '  ' })).status).toBe(400);
    const rejected = await request(app).post(`/api/operations/${created.id}/reject`).set(auth(owner)).send({ reason: '  No disponible  ' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.operation).toMatchObject({ status: 'Rechazada', decision_reason: 'No disponible', contract_snapshot: null });
    expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1', [created.id])).rowCount).toBe(0);
    const before = await effects(created.id);
    expect(before.audit.map(row => row.action)).toEqual(['operation.requested', 'operation.rejected']);
    expect(JSON.stringify(before.audit[1])).not.toContain('No disponible');
    expect(JSON.stringify(before.outbox[1])).not.toContain('No disponible');
    expect((await request(app).post(`/api/operations/${created.id}/reject`).set(auth(owner)).send({ reason: 'Otra razón' })).status).toBe(200);
    expect((await request(app).post(`/api/operations/${created.id}/accept`).set(auth(owner)).send({})).status).toBe(409);
    expect((await effects(created.id)).audit).toHaveLength(before.audit.length);
  });
  it('allows only the current verified owner to decide', async () => {
    const pub = await publication(); const created = await service.requestOperation(db, requester, saleTerms(pub));
    for (const actor of [requester, stranger])
      expect((await request(app).post(`/api/operations/${created.id}/accept`).set(auth(actor)).send({})).status).toBe(403);
    const admin = (await db.query(`INSERT INTO users (email,password_hash,role,status,verification_status,display_name)
      VALUES ($1,'hash','Administrador','Activa','Verificado','Admin') RETURNING id`, [`${randomUUID()}@ucsm.edu.pe`])).rows[0].id;
    expect((await request(app).post(`/api/operations/${created.id}/reject`).set(auth(admin)).send({ reason: 'No' })).status).toBe(403);
    await db.query("UPDATE users SET verification_status='No verificado' WHERE id=$1", [owner]);
    await expect(service.decideOperation(db, owner, created.id, { decision: 'accept' })).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE users SET verification_status='Verificado' WHERE id=$1", [owner]);
    expect((await db.query('SELECT status FROM operations WHERE id=$1', [created.id])).rows[0].status).toBe('Pendiente');
    expect((await effects(created.id)).audit).toHaveLength(1);
  });
  it('persists one system expiry when a decision discovers the deadline', async () => {
    const pub = await publication(); const created = await service.requestOperation(db, requester, saleTerms(pub));
    await db.query("UPDATE operations SET request_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [created.id]);
    expect((await request(app).post(`/api/operations/${created.id}/accept`).set(auth(owner)).send({})).status).toBe(409);
    expect((await db.query('SELECT status,decided_by,decision_reason FROM operations WHERE id=$1', [created.id])).rows[0])
      .toEqual({ status: 'Expirada', decided_by: null, decision_reason: 'request_expired' });
    expect((await request(app).post(`/api/operations/${created.id}/reject`).set(auth(owner)).send({ reason: 'No' })).status).toBe(409);
    expect((await effects(created.id)).audit.map(row => row.action)).toEqual(['operation.requested', 'operation.expired']);
    expect((await effects(created.id)).outbox.map(row => row.event_type)).toEqual(['operation.requested', 'operation.expired']);
  });
  it('persists unavailable and changed publication rejections before returning conflict', async () => {
    for (const change of ['Pausada', 'Retirada', 'contract_changed']) {
      const cause = change === 'contract_changed' ? change : 'publication_unavailable';
      const pub = await publication(); const created = await service.requestOperation(db, requester, saleTerms(pub));
      if (cause === 'publication_unavailable') await db.query('UPDATE publications SET status=$2 WHERE id=$1', [pub.id, change]);
      else await db.query("UPDATE publications SET title='Microscopio nuevo' WHERE id=$1", [pub.id]);
      expect((await request(app).post(`/api/operations/${created.id}/accept`).set(auth(owner)).send({})).status).toBe(409);
      expect((await db.query('SELECT status,decision_reason,contract_snapshot FROM operations WHERE id=$1', [created.id])).rows[0])
        .toMatchObject({ status: 'Rechazada', decision_reason: cause, contract_snapshot: null });
      expect((await effects(created.id)).audit.map(row => row.action)).toEqual(['operation.requested', 'operation.rejected']);
      expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1', [created.id])).rowCount).toBe(0);
    }
  });
  it.each(['Venta', 'Alquiler'])('commits exactly one of 100 incompatible %s acceptances', async modality => {
    const pub = await publication(modality);
    const terms = modality === 'Venta' ? saleTerms(pub) : { ...saleTerms(pub), start_date: '2026-12-02', end_date: '2026-12-04' };
    const ids = await Promise.all(Array.from({ length: 100 }, async () =>
      (await service.requestOperation(db, requester, terms)).id));
    const outcomes = await Promise.all(ids.map(id => service.decideOperation(db, owner, id, { decision: 'accept' })
      .then(() => 'accepted', error => error.status)));
    expect(outcomes.filter(value => value === 'accepted')).toHaveLength(1);
    expect(outcomes.filter(value => value === 409)).toHaveLength(99);
    const rows = (await db.query('SELECT id,status,contract_snapshot FROM operations WHERE id=ANY($1::uuid[])', [ids])).rows;
    expect(rows.filter(row => row.status === 'Aceptada')).toHaveLength(1);
    expect(rows.filter(row => row.status === 'Pendiente' && row.contract_snapshot === null)).toHaveLength(99);
    expect((await db.query('SELECT id FROM reservations WHERE publication_id=$1', [pub.id])).rowCount).toBe(1);
    const losers = rows.filter(row => row.status === 'Pendiente');
    for (const loser of losers) {
      const event = await effects(loser.id);
      expect(event.audit.map(row => row.action)).toEqual(['operation.requested']);
      expect(event.outbox.map(row => row.event_type)).toEqual(['operation.requested']);
    }
  }, 120000);
  it('accepts adjacent half-open rental intervals', async () => {
    const pub = await publication('Alquiler');
    const a = await service.requestOperation(db, requester, { ...saleTerms(pub), start_date: '2026-12-02', end_date: '2026-12-03' });
    const b = await service.requestOperation(db, requester, { ...saleTerms(pub), start_date: '2026-12-03', end_date: '2026-12-04' });
    expect((await service.decideOperation(db, owner, a.id, { decision: 'accept' })).status).toBe('Aceptada');
    expect((await service.decideOperation(db, owner, b.id, { decision: 'accept' })).status).toBe('Aceptada');
    expect((await db.query('SELECT id FROM reservations WHERE publication_id=$1', [pub.id])).rowCount).toBe(2);
  });
  it('accepts compatible non-overlapping rental intervals', async () => {
    const pub = await publication('Alquiler');
    const a = await service.requestOperation(db, requester, { ...saleTerms(pub), start_date: '2026-12-02', end_date: '2026-12-03' });
    const b = await service.requestOperation(db, requester, { ...saleTerms(pub), start_date: '2026-12-05', end_date: '2026-12-06' });
    const outcomes = await Promise.all([a, b].map(row => service.decideOperation(db, owner, row.id, { decision: 'accept' })));
    expect(outcomes.map(row => row.status)).toEqual(['Aceptada', 'Aceptada']);
    expect((await db.query('SELECT id FROM reservations WHERE publication_id=$1', [pub.id])).rowCount).toBe(2);
  });
  it.each(['reservations', 'audit_logs', 'outbox_events'])('rolls acceptance back when %s insertion fails', async table => {
    const pub = await publication(); const created = await service.requestOperation(db, requester, saleTerms(pub));
    const constraint = `decision_${randomUUID().replaceAll('-', '')}`;
    const check = table === 'reservations' ? "status <> 'Reservada/Bloqueada'" :
      table === 'audit_logs' ? "action <> 'operation.accepted'" : "event_type <> 'operation.accepted'";
    await db.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (${check}) NOT VALID`);
    try {
      await expect(service.decideOperation(db, owner, created.id, { decision: 'accept' })).rejects.toMatchObject({
        status: 500, code: 'INTERNAL_ERROR', cause: { code: '23514', constraint },
      });
      expect((await db.query('SELECT status,contract_snapshot,accepted_at FROM operations WHERE id=$1', [created.id])).rows[0])
        .toMatchObject({ status: 'Pendiente', contract_snapshot: null, accepted_at: null });
      expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1', [created.id])).rowCount).toBe(0);
      expect((await effects(created.id)).audit.map(row => row.action)).toEqual(['operation.requested']);
      expect((await effects(created.id)).outbox.map(row => row.event_type)).toEqual(['operation.requested']);
      expect((await db.query("SELECT * FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows).toEqual([]);
    } finally { await db.query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`); }
  });
  it('observes a participant suspension committed while acceptance waits', async () => {
    const pub = await publication(); const created = await service.requestOperation(db, requester, saleTerms(pub));
    const lockedId = [owner, requester].sort()[0];
    const blocker = await db.connect(); await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [lockedId]);
    let pending;
    try {
      pending = service.decideOperation(db, owner, created.id, { decision: 'accept' }).then(value => ({ value }), error => ({ error }));
      let waiting = false;
      for (let i = 0; i < 150 && !waiting; i++) {
        waiting = (await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%FROM users WHERE id=$1 FOR NO KEY UPDATE%'`)).rowCount > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await blocker.query("UPDATE users SET status='Suspendida' WHERE id=$1", [lockedId]);
      await blocker.query('COMMIT');
      expect((await pending).error).toMatchObject({ status: 403 });
      expect((await db.query('SELECT status FROM operations WHERE id=$1', [created.id])).rows[0].status).toBe('Pendiente');
      expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1', [created.id])).rowCount).toBe(0);
    } finally {
      await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending;
      await db.query("UPDATE users SET status='Activa' WHERE id=$1", [lockedId]);
    }
  });
  it.each(['pause', 'contract'])('observes a %s change committed while acceptance waits for the publication', async change => {
    const pub = await publication(); const created = await service.requestOperation(db, requester, saleTerms(pub));
    const blocker = await db.connect(); await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE', [pub.id]);
    let pending;
    try {
      pending = service.decideOperation(db, owner, created.id, { decision: 'accept' }).then(value => ({ value }), error => ({ error }));
      let waiting = false;
      for (let i = 0; i < 150 && !waiting; i++) {
        waiting = (await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%FROM publications WHERE id=$1 FOR UPDATE%'`)).rowCount > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      if (change === 'pause') await blocker.query("UPDATE publications SET status='Pausada' WHERE id=$1", [pub.id]);
      else await blocker.query("UPDATE publications SET title='Microscopio revisado' WHERE id=$1", [pub.id]);
      await blocker.query('COMMIT');
      expect((await pending).error).toMatchObject({ status: 409 });
      expect((await db.query('SELECT status,decision_reason FROM operations WHERE id=$1', [created.id])).rows[0])
        .toMatchObject({ status: 'Rechazada', decision_reason: change === 'pause' ? 'publication_unavailable' : 'contract_changed' });
      expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1', [created.id])).rowCount).toBe(0);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending; }
  });
  it('does not expose database conflict internals in a decision response', async () => {
    const pub = await publication(); const first = await service.requestOperation(db, requester, saleTerms(pub));
    const second = await service.requestOperation(db, requester, saleTerms(pub));
    await service.decideOperation(db, owner, first.id, { decision: 'accept' });
    const response = await request(app).post(`/api/operations/${second.id}/accept`).set(auth(owner)).send({});
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).not.toMatch(/reservations_|constraint|23P01|23505|Microscopio|email/i);
    expect((await effects(second.id)).audit.map(row => row.action)).toEqual(['operation.requested']);
  });
  it.each([
    ['Venta', '23505', 'reservations_one_live_sale_per_publication'],
    ['Alquiler', '23P01', 'reservations_live_interval_exclusion'],
  ])('maps an owned %s reservation constraint to a sanitized conflict', async (modality, sqlState, index) => {
    const pub = await publication(modality);
    const terms = modality === 'Venta' ? saleTerms(pub) : { ...saleTerms(pub), start_date: '2026-12-02', end_date: '2026-12-03' };
    const created = await service.requestOperation(db, requester, terms);
    const functionName = `decision_error_${randomUUID().replaceAll('-', '')}`;
    const triggerName = `${functionName}_trigger`;
    await db.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'private conflict' USING ERRCODE='${sqlState}', CONSTRAINT='${index}'; END $$`);
    await db.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON reservations
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    try {
      const response = await request(app).post(`/api/operations/${created.id}/accept`).set(auth(owner)).send({});
      expect(response.status).toBe(409);
      expect(JSON.stringify(response.body)).not.toMatch(/private conflict|reservations_|23P01|23505/i);
      expect((await db.query('SELECT status,contract_snapshot FROM operations WHERE id=$1', [created.id])).rows[0])
        .toMatchObject({ status: 'Pendiente', contract_snapshot: null });
      expect((await effects(created.id)).audit.map(row => row.action)).toEqual(['operation.requested']);
    } finally {
      await db.query(`DROP TRIGGER ${triggerName} ON reservations`);
      await db.query(`DROP FUNCTION ${functionName}()`);
    }
  });
});
