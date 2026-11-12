import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
const route = '/api/auth/graduates';
const pdf = Buffer.from('%PDF-1.7\n' + ' '.repeat(120_000) + '%%EOF');
const evidence = { name: 'constancia.pdf', content: pdf.toString('base64') };
const sample = () => ({ email: `${randomUUID()}@example.org`, password: 'egresado-seguro', name: 'Ana López', documentNumber: '12345678',
  faculty: 'Ciencias Jurídicas y Políticas', career: 'Derecho', acceptedTerms: true, declaredCorrect: true, evidence });
const bearer = token => ({ Authorization: `Bearer ${token}` });
const json = (pending, payload) => pending.set('Content-Type', 'application/vnd.ranti.accreditation+json').send(JSON.stringify(payload));

describe.skipIf(!enabled)('graduate accreditation HTTP contract', () => {
  let database, db, app, admin, regular;
  async function user(role) {
    const { rows } = await db.query(`INSERT INTO users(email,password_hash,role,status,verification_status)
      VALUES($1,'unused',$2,'Activa','Verificado') RETURNING id`, [`${randomUUID()}@ucsm.edu.pe`, role]);
    return jwt.sign({ id: rows[0].id }, process.env.JWT_SECRET);
  }
  beforeAll(async () => {
    database = await createDisposableDatabase(); db = database.db;
    await (await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules(); vi.doMock('../src/config/database.js', () => ({ default: db }));
    app = (await import('../src/app.js')).default;
    [admin, regular] = await Promise.all([user('Administrador'), user('Estudiante')]);
  });
  afterAll(async () => { vi.doUnmock('../src/config/database.js'); if (database) await database.close(); });

  it('enables the academic role only after a motivated decision and limits a pending session to accreditation', async () => {
    const payload = sample();
    expect((await json(request(app).post(`${route}/register`), { ...payload, declaredCorrect: false })).status).toBe(400);
    const registered = await json(request(app).post(`${route}/register`), payload);
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);
    expect(registered.body.application).toMatchObject({ status: 'En revisión', documentLast4: '5678' });
    expect(JSON.stringify(registered.body)).not.toContain(payload.documentNumber);
    const credentials = { email: payload.email, password: payload.password };
    const access = await request(app).post(`${route}/access`).send(credentials);
    expect(access.body).not.toHaveProperty('session');
    expect((await request(app).get('/api/auth/me').set(bearer(access.body.token))).status).toBe(401);
    const mine = await request(app).get(`${route}/me`).set(bearer(access.body.token));
    expect(mine.body.id).toBe(registered.body.application.id);
    expect((await db.query('SELECT academic_condition FROM users WHERE email=$1', [payload.email])).rows[0].academic_condition).toBeNull();
    const decision = `${route}/admin/requests/${mine.body.id}/decision`;
    expect((await request(app).post(decision).set(bearer(regular)).send({ decision: 'approve', reason: 'Verificado', revision: 1 })).status).toBe(403);
    expect((await request(app).post(decision).set(bearer(admin)).send({ decision: 'approve', reason: '', revision: 1 })).status).toBe(400);
    expect((await request(app).post(decision).set(bearer(admin)).send({ decision: 'approve', reason: 'Constancia cotejada', revision: 1 })).body.status).toBe('Verificado');
    const granted = await request(app).post(`${route}/access`).send(credentials);
    expect(granted.body.session.user).toMatchObject({ role: 'Egresado', status: 'Activa' });
    expect((await request(app).get('/api/auth/me').set(bearer(granted.body.session.token))).status).toBe(200);
  });

  it('confines proof, records observations and allows a corrected version of the same case', async () => {
    const owner = (await json(request(app).post(`${route}/register`), sample())).body;
    const other = (await json(request(app).post(`${route}/register`), sample())).body;
    const adminCase = `${route}/admin/requests/${owner.application.id}`;
    const file = `/evidence/${owner.application.evidence[0].id}`;
    expect((await request(app).get(`${route}/me${file}`).set(bearer(other.token))).status).toBe(404);
    expect((await request(app).get(`${adminCase}${file}`).set(bearer(admin))).status).toBe(200);
    const review = { decision: 'observe', reason: 'La constancia es ilegible', correction: 'Adjunta un PDF legible', revision: 1 };
    const observation = await request(app).post(`${adminCase}/decision`).set(bearer(admin)).send(review);
    expect(observation.body).toMatchObject({ status: 'Pendiente de subsanación', correction: review.correction });
    const correction = await json(request(app).post(`${route}/me/corrections`).set(bearer(owner.token)), {
      evidence: { ...evidence, name: 'constancia-corregida.pdf' }, revision: 2,
    });
    expect(correction.body).toMatchObject({ id: owner.application.id, revision: 3, status: 'En revisión' });
    expect(correction.body.evidence.map(file => file.name)).toEqual(['constancia.pdf', 'constancia-corregida.pdf']);
    expect((await request(app).post(`${adminCase}/decision`).set(bearer(admin)).send(review)).status).toBe(409);
    expect((await request(app).post(`${adminCase}/decision`).set(bearer(admin)).send({ decision: 'reject', reason: 'Vínculo no acreditado', revision: 3 })).body.status).toBe('Rechazado');
    const events = (await db.query('SELECT action FROM audit_logs WHERE entity_id=$1', [owner.application.id])).rows.map(row => row.action);
    expect(events).toContain('accreditation.evidence.downloaded');
    expect(events).toContain('accreditation.corrected');
  });
});
