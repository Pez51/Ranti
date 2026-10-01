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
    await db.query('DELETE FROM users WHERE id=$1', [deletedRequester]);
    await expect(service.requestOperation(db, deletedRequester, saleTerms(pub))).rejects.toMatchObject({ status: 403 });
    await expect(service.listParticipantOperations(db, deletedRequester)).rejects.toMatchObject({ status: 403 });
    expect((await request(app).post('/api/operations').set(auth(deletedRequester)).send(saleTerms(pub))).status).toBe(401);
    expect((await db.query('SELECT id FROM operations WHERE publication_id=$1', [pub.id])).rows).toEqual([]);
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
});
