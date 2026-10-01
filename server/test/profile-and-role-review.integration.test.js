import { randomUUID } from 'node:crypto';
import { createDisposableDatabase } from './helpers/disposable-database.js';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('profile and role review on disposable PostgreSQL', () => {
  let db, database, app, getOwnProfile, updateOwnProfile, requestStudentRole, decideStudentRole;
  const token = id => jwt.sign({ id, role: 'Administrador' }, process.env.JWT_SECRET || 'ranti-test-jwt-secret-local-only');
  const auth = id => ({ Authorization: `Bearer ${token(id)}` });
  async function user(role = 'Egresado', status = 'Activa', verification = 'Verificado', id = randomUUID()) {
    return (await db.query(`INSERT INTO users (id, email, password_hash, role, status, verification_status,
      reputation_score, operations_count) VALUES ($1, $2, 'hash', $3, $4, $5, 3.75, 9) RETURNING *`,
    [id, `${randomUUID()}@ucsm.edu.pe`, role, status, verification])).rows[0];
  }
  const evidence_ref = 'https://evidence.example.test/opaque-key';
  async function effects(id) {
    return {
      audit: (await db.query("SELECT * FROM audit_logs WHERE entity_id = $1 AND action = 'identity.role-request.decided'", [id])).rows,
      outbox: (await db.query("SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'identity.role-request.decided'", [id])).rows,
    };
  }
  beforeAll(async () => {
    database = await createDisposableDatabase();
    db = database.db;
    await (await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules(); vi.doMock('../src/config/database.js', () => ({ default: db }));
    ({ getOwnProfile, updateOwnProfile } = await import('../src/modules/users/profile.service.js'));
    ({ requestStudentRole, decideStudentRole } = await import('../src/modules/users/role-review.service.js'));
    app = (await import('../src/app.js')).default;
  });
  afterAll(async () => { vi.doUnmock('../src/config/database.js'); if (database) await database.close(); });

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
      .send({ evidence_ref, evidence_metadata: { documentType: 'student-card' } });
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
    expect(JSON.stringify(await effects(first.body.id))).not.toContain('student-card');
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

  it.each(['approve', 'reject'])('keeps %s HTTP decisions private for initial, same-admin and other-admin retries', async decision => {
    const owner = await user(); const first = await user('Administrador'); const second = await user('Administrador');
    const pending = await requestStudentRole(db, { userId: owner.id, evidence_ref, evidence_metadata: { note: 'private-marker' } });
    const access = async () => (await db.query("SELECT * FROM audit_logs WHERE entity_id=$1 AND action='identity.role-request.evidence-read'", [pending.id])).rows;
    for (const reviewer of [first, first, second]) {
      const queue = await request(app).get('/api/admin/role-requests?limit=100').set(auth(reviewer.id));
      expect(queue.status).toBe(200);
      expect(queue.body.items.find(item => item.id === pending.id)).toMatchObject({ evidence_ref, evidence_metadata: { note: 'private-marker' } });
    }
    const reads = await access();
    expect(reads.map(item => item.actor_id).sort()).toEqual([first.id, first.id, second.id].sort());
    expect(JSON.stringify(reads)).not.toMatch(/opaque-key|private-marker/);
    for (const reviewer of [first, first, second]) {
      const response = await request(app).post(`/api/admin/role-requests/${pending.id}/decision`).set(auth(reviewer.id))
        .send({ decision, reason: 'Reviewed' });
      expect(response.status).toBe(200);
      expect.soft(response.body).not.toHaveProperty('evidence_ref');
      expect.soft(response.body).not.toHaveProperty('evidence_metadata');
      expect.soft(JSON.stringify(response.body)).not.toMatch(/opaque-key|private-marker/);
    }
    expect(await access()).toHaveLength(3);
    const recorded = await effects(pending.id);
    expect(recorded.audit).toHaveLength(1); expect(recorded.outbox).toHaveLength(1);
    expect(JSON.stringify(recorded)).not.toMatch(/opaque-key|private-marker/);
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

  it('refuses a decision after administrator revocation commits while the owner row is locked', async () => {
    // Owner sorts first, so the decision waits there while revocation commits.
    // The only valid serial outcome is denial with the request still pending.
    const [ownerId, adminId] = [randomUUID(), randomUUID()].sort();
    const owner = await user('Egresado', 'Activa', 'Verificado', ownerId);
    const admin = await user('Administrador', 'Activa', 'Verificado', adminId);
    const pending = await requestStudentRole(db, { userId: owner.id, evidence_ref });
    const blocker = await db.connect();
    let notifyCandidate;
    const candidateRead = new Promise(resolve => { notifyCandidate = resolve; });
    const instrumentedDb = { connect: async () => {
      const client = await db.connect();
      return { release: () => client.release(), query: async (sql, args) => {
        const result = await client.query(sql, args);
        if (sql.includes('SELECT user_id FROM role_requests WHERE id = $1')) notifyCandidate();
        return result;
      } };
    } };
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [owner.id]);
      const decision = decideStudentRole(instrumentedDb, { adminId: admin.id, requestId: pending.id,
        decision: 'approve', reason: 'Record checked' }).catch(error => error);
      await candidateRead;
      await db.query("UPDATE users SET status = 'Suspendida' WHERE id = $1", [admin.id]);
      await blocker.query('COMMIT');
      const result = await decision;
      expect(result).toMatchObject({ status: 403, code: 'ACCOUNT_UNAVAILABLE' });
      expect((await db.query('SELECT role FROM users WHERE id = $1', [owner.id])).rows[0].role).toBe('Egresado');
      expect((await db.query('SELECT status FROM role_requests WHERE id = $1', [pending.id])).rows[0].status).toBe('pending');
      expect(await effects(pending.id)).toEqual({ audit: [], outbox: [] });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
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
