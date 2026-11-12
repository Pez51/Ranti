import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
const endpoint = '/api/privacy/requests';
const adminEndpoint = '/api/privacy/admin/requests';
const proof = Buffer.from('%PDF-1.7\n' + ' '.repeat(120_000) + '%%EOF');
const input = type => ({
  submissionId: randomUUID(), type, dataScope: 'Datos de contacto del perfil',
  description: 'Solicito revisar el tratamiento de estos datos.', identityConfirmed: true,
});

describe.skipIf(!enabled)('private ARCO case HTTP contract', () => {
  let database, db, app, owner, other, admin, pending;
  const auth = id => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });
  async function user(role, verified = true) {
    const { rows } = await db.query(`INSERT INTO users (email,password_hash,role,status,verification_status)
      VALUES ($1,'unused',$2,$3,$4) RETURNING id`, [`${randomUUID()}@ucsm.edu.pe`, role,
      verified ? 'Activa' : 'Pendiente de verificación', verified ? 'Verificado' : 'No verificado']);
    return rows[0].id;
  }
  beforeAll(async () => {
    database = await createDisposableDatabase(); db = database.db;
    await (await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules(); vi.doMock('../src/config/database.js', () => ({ default: db }));
    app = (await import('../src/app.js')).default;
    [owner, other, admin, pending] = await Promise.all([
      user('Estudiante'), user('Egresado'), user('Administrador'), user('Estudiante', false),
    ]);
  });
  afterAll(async () => { vi.doUnmock('../src/config/database.js'); if (database) await database.close(); });

  it.each(['Acceso', 'Rectificacion', 'Cancelacion', 'Oposicion'])('records %s and deduplicates the same submission', async type => {
    const payload = input(type);
    const first = await request(app).post(endpoint).set(auth(owner)).send(payload);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({ type, status: 'Presentada', revision: 1, dataScope: payload.dataScope });
    const retry = await request(app).post(endpoint).set(auth(owner)).send(payload);
    expect(retry.body.id).toBe(first.body.id);
    expect((await db.query('SELECT id FROM arco_requests WHERE id=$1', [first.body.id])).rowCount).toBe(1);
    expect((await db.query('SELECT id FROM audit_logs WHERE entity_id=$1', [first.body.id])).rowCount).toBe(1);
    expect((await request(app).post(endpoint).set(auth(owner)).send({ ...payload, type: 'Oposicion', description: 'Otra descripción' })).status).toBe(409);
  });

  it('requires identity and confines private evidence and the case to the owner or the admin queue', async () => {
    const payload = { ...input('Acceso'), attachment: { name: 'constancia.pdf', type: 'application/pdf', content: proof.toString('base64') } };
    expect((await request(app).post(endpoint).send(payload)).status).toBe(401);
    expect((await request(app).post(endpoint).set(auth(pending)).send(payload)).status).toBe(403);
    expect((await request(app).post(endpoint).set(auth(owner)).send({ ...payload, identityConfirmed: false })).status).toBe(400);
    const created = await request(app).post(endpoint).set(auth(owner)).send(payload);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id;
    const privateFile = `${endpoint}/${id}/evidence/${created.body.evidence[0].id}`;
    expect((await request(app).get(`${endpoint}/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).get(privateFile).set(auth(other))).status).toBe(404);
    expect((await request(app).get(endpoint).set(auth(other))).body.items).toEqual([]);
    expect((await request(app).get(adminEndpoint).set(auth(other))).status).toBe(403);
    const own = await request(app).get(privateFile).set(auth(owner));
    expect(own.status).toBe(200);
    expect(own.headers['cache-control']).toBe('private, no-store');
    expect(own.headers['content-disposition']).toContain('attachment');
    const evidence = await request(app).get(privateFile.replace(endpoint, adminEndpoint)).set(auth(admin));
    expect(evidence.status).toBe(200);
    const audit = (await db.query(`SELECT action, actor_id, new_values FROM audit_logs WHERE entity_id=$1 ORDER BY timestamp,id`, [id])).rows;
    expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'arco.evidence.downloaded', actor_id: admin })]));
    expect(JSON.stringify(audit)).not.toContain('constancia.pdf');
    expect(JSON.stringify(audit)).not.toContain(payload.description);
  });

  it('keeps the reason, correction and deadline on a single case and publishes a downloadable resolution', async () => {
    const created = (await request(app).post(endpoint).set(auth(owner)).send(input('Cancelacion'))).body;
    const adminCase = `${adminEndpoint}/${created.id}`;
    const ownCase = `${endpoint}/${created.id}`;
    const dueDate = '2030-05-20';
    expect((await request(app).get(adminCase).set(auth(admin))).status).toBe(200);
    expect((await request(app).post(`${adminCase}/decision`).set(auth(admin)).send({ revision: 1, status: 'Pendiente de subsanación', reason: 'Precisa los datos a cancelar.', dueDate })).status).toBe(200);
    const correction = { revision: 2, dataScope: 'Teléfono personal anterior', description: 'Solo solicito cancelar este número.' };
    expect((await request(app).post(`${ownCase}/corrections`).set(auth(other)).send(correction)).status).toBe(404);
    expect((await request(app).post(`${ownCase}/corrections`).set(auth(owner)).send(correction)).body.status).toBe('En revisión');
    const decision = { revision: 3, status: 'Parcialmente atendida', reason: 'Se atendió la solicitud parcialmente.', retentionReason: 'Se conserva el identificador de la operación para trazabilidad.', dueDate };
    expect((await request(app).post(`${adminCase}/decision`).set(auth(admin)).send({ ...decision, retentionReason: '' })).status).toBe(400);
    expect((await request(app).post(`${adminCase}/decision`).set(auth(admin)).send(decision)).status).toBe(200);
    expect((await request(app).post(`${adminCase}/decision`).set(auth(admin)).send({ ...decision, status: 'Rechazada' })).status).toBe(409);
    const result = await request(app).get(ownCase).set(auth(owner));
    expect(result.body).toMatchObject({ status: decision.status, reason: decision.reason, retentionReason: decision.retentionReason, dueDate });
    expect(result.body.history.map(event => event.status)).toEqual(['Presentada', 'Pendiente de subsanación', 'En revisión', 'Parcialmente atendida']);
    expect((await request(app).get(`${ownCase}/response`).set(auth(other))).status).toBe(404);
    expect((await request(app).get(`${ownCase}/response`).set(auth(owner))).text).toContain(decision.retentionReason);
  });
});
