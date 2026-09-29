import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('profile and role review on disposable PostgreSQL', () => {
  let db, app, getOwnProfile, updateOwnProfile, requestStudentRole, decideStudentRole;
  const token = id => jwt.sign({ id, role: 'Administrador' }, process.env.JWT_SECRET || 'ranti-test-jwt-secret-local-only');
  const auth = id => ({ Authorization: `Bearer ${token(id)}` });
  async function user(role = 'Egresado', status = 'Activa', verification = 'Verificado') {
    return (await db.query(`INSERT INTO users (email, password_hash, role, status, verification_status,
      reputation_score, operations_count) VALUES ($1, 'hash', $2, $3, $4, 3.75, 9) RETURNING *`,
    [`${randomUUID()}@ucsm.edu.pe`, role, status, verification])).rows[0];
  }
  const evidence_ref = 'https://evidence.example.test/opaque-key';
  async function effects(id) {
    return {
      audit: (await db.query("SELECT * FROM audit_logs WHERE entity_id = $1 AND action = 'identity.role-request.decided'", [id])).rows,
      outbox: (await db.query("SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'identity.role-request.decided'", [id])).rows,
    };
  }
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test')
      throw new Error('Profile integration tests require the disposable local database.');
    db = new pg.Pool({ connectionString: url.href });
    await (await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules(); vi.doMock('../src/config/database.js', () => ({ default: db }));
    ({ getOwnProfile, updateOwnProfile } = await import('../src/modules/users/profile.service.js'));
    ({ requestStudentRole, decideStudentRole } = await import('../src/modules/users/role-review.service.js'));
    app = (await import('../src/app.js')).default;
  });
  afterAll(async () => { vi.doUnmock('../src/config/database.js'); if (db) await db.end(); });

  it('persists self profile changes and null clearing while keeping metrics and protected fields unchanged', async () => {
    const owner = await user(); const other = await user();
    const change = await request(app).patch('/api/users/me').set(auth(owner.id))
      .send({ display_name: '  María  ', avatar_url: 'https://host:65535/avatar', faculty: '  Ingeniería  ' });
    expect(change.status).toBe(200);
    expect(change.body).toMatchObject({ display_name: 'María', avatar_url: 'https://host:65535/avatar',
      faculty: 'Ingeniería', academic_condition: 'Egresado', university: 'Universidad Católica de Santa María',
      operations_count: 9 });
    expect(change.body).not.toHaveProperty('password_hash');
    const row = (await db.query('SELECT * FROM users WHERE id = $1', [owner.id])).rows[0];
    expect(row).toMatchObject({ role: 'Egresado', reputation_score: '3.75', operations_count: 9,
      display_name: 'María', faculty: 'Ingeniería' });
    expect((await request(app).get('/api/users/me').set(auth(other.id))).body.display_name).toBeNull();
    const clear = await request(app).patch('/api/users/me').set(auth(owner.id))
      .send({ avatar_url: null, faculty: null });
    expect(clear.body).toMatchObject({ avatar_url: null, faculty: null, display_name: 'María' });
    expect((await request(app).patch('/api/users/me').set(auth(owner.id)).send({ role: 'Administrador' })).status).toBe(400);
  });

  it('keeps a private request trail, allows rejection and resubmission, and promotes only after approval', async () => {
    const owner = await user(); const other = await user(); const admin = await user('Administrador');
    const first = await request(app).post('/api/users/me/role-requests').set(auth(owner.id))
      .send({ evidence_ref, evidence_metadata: { kind: 'student-card' } });
    expect(first.status).toBe(201);
    expect((await request(app).post('/api/users/me/role-requests').set(auth(owner.id))
      .send({ evidence_ref })).status).toBe(409);
    expect((await request(app).get('/api/users/me/role-requests').set(auth(other.id))).body).toEqual([]);
    const mine = await request(app).get('/api/users/me/role-requests').set(auth(owner.id));
    expect(mine.body).toHaveLength(1); expect(mine.body[0].evidence_ref).toBe(evidence_ref);
    const pending = await request(app).get('/api/admin/role-requests?limit=10&offset=0').set(auth(admin.id));
    expect(pending.status).toBe(200);
    expect(pending.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.body.id,
      evidence_ref, user: expect.objectContaining({ id: owner.id }) })]));
    expect((await request(app).get('/api/admin/role-requests').set(auth(owner.id))).status).toBe(403);
    const reject = await request(app).post(`/api/admin/role-requests/${first.body.id}/decision`).set(auth(admin.id))
      .send({ decision: 'reject', reason: '  Insufficient evidence  ' });
    expect(reject.status).toBe(200);
    expect(reject.body).toMatchObject({ status: 'rejected', review_reason: 'Insufficient evidence' });
    expect((await db.query('SELECT role FROM users WHERE id = $1', [owner.id])).rows[0].role).toBe('Egresado');
    const second = await request(app).post('/api/users/me/role-requests').set(auth(owner.id))
      .send({ evidence_ref: 'https://host/new' });
    expect(second.status).toBe(201);
    const approve = await request(app).post(`/api/admin/role-requests/${second.body.id}/decision`).set(auth(admin.id))
      .send({ decision: 'approve', reason: 'Valid student record' });
    expect(approve.status).toBe(200); expect(approve.body.status).toBe('approved');
    expect((await db.query('SELECT role FROM users WHERE id = $1', [owner.id])).rows[0].role).toBe('Estudiante');
    expect((await request(app).get('/api/users/me').set(auth(owner.id))).body.academic_condition).toBe('Estudiante');
    expect((await request(app).post('/api/users/me/role-requests').set(auth(owner.id))
      .send({ evidence_ref })).status).toBe(403);
    const recorded = await effects(second.body.id);
    expect(recorded.audit).toHaveLength(1); expect(recorded.outbox).toHaveLength(1);
    expect(JSON.stringify(recorded)).not.toContain(evidence_ref);
    expect(JSON.stringify(recorded)).not.toContain('https://host/new');
  });

  it('denies missing, suspended and unverified accounts using current database state', async () => {
    const active = await user(); const admin = await user('Administrador');
    for (const [status, verification] of [['Suspendida', 'Verificado'], ['Activa', 'No verificado']]) {
      await db.query('UPDATE users SET status = $2, verification_status = $3 WHERE id = $1', [active.id, status, verification]);
      expect((await request(app).get('/api/users/me').set(auth(active.id))).status).toBe(403);
      expect((await request(app).post('/api/users/me/role-requests').set(auth(active.id))
        .send({ evidence_ref })).status).toBe(403);
      await db.query('UPDATE users SET status = $2, verification_status = $3 WHERE id = $1', [admin.id, status, verification]);
      expect((await request(app).get('/api/admin/role-requests').set(auth(admin.id))).status).toBe(403);
    }
    expect((await request(app).get('/api/users/me').set(auth(randomUUID()))).status).toBe(401);
  });

  it('rejects forged actor and request IDs in HTTP bodies without changing another account', async () => {
    const owner = await user(); const victim = await user(); const admin = await user('Administrador');
    const forged = await request(app).post('/api/users/me/role-requests').set(auth(owner.id))
      .send({ userId: victim.id, evidence_ref });
    expect(forged.status).toBe(400);
    expect((await db.query('SELECT id FROM role_requests WHERE user_id = $1', [victim.id])).rows).toEqual([]);
    const pending = await requestStudentRole(db, { userId: owner.id, evidence_ref });
    const decision = await request(app).post(`/api/admin/role-requests/${pending.id}/decision`).set(auth(owner.id))
      .send({ adminId: admin.id, requestId: randomUUID(), decision: 'approve', reason: 'Forge' });
    expect(decision.status).toBe(403);
    expect((await db.query('SELECT status FROM role_requests WHERE id = $1', [pending.id])).rows[0].status).toBe('pending');
  });

  it('serializes concurrent decisions and gives exact idempotent or conflict results', async () => {
    const owner = await user(); const first = await user('Administrador'); const second = await user('Administrador');
    const pending = await requestStudentRole(db, { userId: owner.id, evidence_ref });
    const input = adminId => ({ adminId, requestId: pending.id, decision: 'approve', reason: 'Verified record' });
    const results = await Promise.all([decideStudentRole(db, input(first.id)), decideStudentRole(db, input(second.id))]);
    expect(results[0]).toEqual(results[1]);
    expect((await effects(pending.id)).audit).toHaveLength(1);
    expect((await effects(pending.id)).outbox).toHaveLength(1);
    await expect(decideStudentRole(db, { ...input(second.id), decision: 'reject' }))
      .rejects.toMatchObject({ status: 409, code: 'ROLE_REQUEST_CONFLICT' });
  });

  it.each(['audit_logs', 'outbox_events'])('rolls back approval when %s insert fails', async table => {
    const owner = await user(); const admin = await user('Administrador');
    const pending = await requestStudentRole(db, { userId: owner.id, evidence_ref });
    const failingDb = { connect: async () => {
      const client = await db.connect();
      return { release: () => client.release(), query: (sql, args) => {
        if (sql.includes(`INSERT INTO ${table}`)) throw new Error('evidence=private token=secret');
        return client.query(sql, args);
      } };
    } };
    const input = { adminId: admin.id, requestId: pending.id, decision: 'approve', reason: 'Valid record' };
    const error = await decideStudentRole(failingDb, input).catch(error => error);
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    expect(String(error)).not.toMatch(/private|secret/);
    expect((await db.query('SELECT role FROM users WHERE id = $1', [owner.id])).rows[0].role).toBe('Egresado');
    expect((await db.query('SELECT status FROM role_requests WHERE id = $1', [pending.id])).rows[0].status).toBe('pending');
    expect(await effects(pending.id)).toEqual({ audit: [], outbox: [] });
    await decideStudentRole(db, input);
    expect((await effects(pending.id)).audit).toHaveLength(1);
  });
});
