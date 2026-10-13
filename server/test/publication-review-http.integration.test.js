import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('administrative publication review HTTP contract', () => {
  let database, db, app, admin, owner;
  const auth = id => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });
  async function user(role) {
    return (await db.query(`INSERT INTO users (email,password_hash,role,status,verification_status)
      VALUES ($1,'unused',$2,'Activa','Verificado') RETURNING id`, [`${randomUUID()}@ucsm.edu.pe`, role])).rows[0].id;
  }
  async function pending() {
    const publication = (await db.query(`INSERT INTO publications
      (owner_id,title,description,category,condition,modality,price,status,submitted_at)
      VALUES ($1,'Calculadora','Calculadora para cursos universitarios','Tecnología','Buen estado','Venta',600,
        'Pendiente de revisión',date_trunc('milliseconds',clock_timestamp())) RETURNING *`, [owner])).rows[0];
    await db.query(`INSERT INTO publication_images (publication_id,image_url,is_primary,position)
      VALUES ($1,'https://example.org/photo.png',true,0)`, [publication.id]);
    return publication;
  }
  beforeAll(async () => {
    database = await createDisposableDatabase(); db = database.db;
    await (await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules(); vi.doMock('../src/config/database.js', () => ({ default: db }));
    app = (await import('../src/app.js')).default;
    admin = await user('Administrador'); owner = await user('Egresado');
  });
  afterAll(async () => { vi.doUnmock('../src/config/database.js'); if (database) await database.close(); });

  it('returns the paginated empty queue and rejects non-administrators and invalid pagination', async () => {
    const response = await request(app).get('/api/admin/publications/reviews?limit=20&offset=0').set(auth(admin));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({ items: [], limit: 20, offset: 0 });
    expect((await request(app).get('/api/admin/publications/reviews').set(auth(owner))).status).toBe(403);
    expect((await request(app).get('/api/admin/publications/reviews?limit=0').set(auth(admin))).status).toBe(400);
  });

  it.each(['approve', 'reject'])('persists %s using the UI payload and makes exact retries idempotent', async decision => {
    const publication = await pending();
    const queue = await request(app).get('/api/admin/publications/reviews?limit=1&offset=0').set(auth(admin));
    expect(queue.status).toBe(200);
    expect(queue.body.items[0].id).toBe(publication.id);
    const payload = { decision, reason: 'Revisión completada', submittedAt: publication.submitted_at.toISOString() };
    const endpoint = `/api/admin/publications/${publication.id}/review`;
    const response = await request(app).post(endpoint).set(auth(admin)).send(payload);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ status: decision === 'approve' ? 'Activa' : 'Borrador', review_reason: payload.reason });
    expect(response.body).not.toHaveProperty('provenance_evidence_ref');
    expect((await request(app).post(endpoint).set(auth(admin)).send(payload)).status).toBe(200);
    const effects = await db.query('SELECT action FROM audit_logs WHERE entity_id=$1', [publication.id]);
    expect(effects.rows).toHaveLength(1);
    expect((await db.query('SELECT id FROM outbox_events WHERE aggregate_id=$1', [publication.id])).rowCount).toBe(1);
    const opposite = { ...payload, decision: decision === 'approve' ? 'reject' : 'approve' };
    expect((await request(app).post(endpoint).set(auth(admin)).send(opposite)).status).toBe(409);
    expect((await request(app).get('/api/admin/publications/reviews').set(auth(admin))).body.items).toEqual([]);
  });

  it('rejects missing reasons, legacy payloads and stale review cycles without changing the row', async () => {
    const publication = await pending();
    const endpoint = `/api/admin/publications/${publication.id}/review`;
    expect((await request(app).post(endpoint).set(auth(admin)).send({ approved: true })).status).toBe(400);
    const payload = { decision: 'approve', reason: 'Revisada', submittedAt: '2020-01-01T00:00:00.000Z' };
    expect((await request(app).post(endpoint).set(auth(admin)).send(payload)).status).toBe(409);
    expect((await db.query('SELECT status FROM publications WHERE id=$1', [publication.id])).rows[0].status).toBe('Pendiente de revisión');
  });
});
