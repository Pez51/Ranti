import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Solo se ejecuta contra el clúster desechable creado por tools/test-postgres.ps1.
const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('API con PostgreSQL temporal real', () => {
  let app;
  let pool;
  let owner;
  let buyer;
  const secret = 'ranti-test-jwt-secret-local-only';

  const token = (id, role = 'Estudiante') => jwt.sign({ id, role }, secret, { expiresIn: '1h' });
  const auth = (id) => ({ Authorization: `Bearer ${token(id)}` });

  async function user(status = 'Activa', verification = 'Verificado') {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role, status, verification_status)
       VALUES ($1, 'not-used-in-these-tests', 'Estudiante', $2, $3) RETURNING id`,
      [`${randomUUID()}@estudiante.ucsm.edu.pe`, status, verification],
    );
    return rows[0].id;
  }

  async function publication(status = 'Activa', modality = 'Alquiler') {
    const { rows } = await pool.query(
      `INSERT INTO publications (owner_id, title, description, category, condition, modality, price, guarantee_amount, status)
       VALUES ($1, 'Calculadora', 'Equipo de prueba', 'Sistemas', 'Usado', $2, 10, 20, $3) RETURNING id`,
      [owner, modality, status],
    );
    return rows[0].id;
  }

  async function operation(status = 'Lista para entrega') {
    const publicationId = await publication();
    const { rows } = await pool.query(
      `INSERT INTO operations (publication_id, demandante_id, oferente_id, modality, status, contract_snapshot, otp_code)
       VALUES ($1, $2, $3, 'Alquiler', $4, '{}', '123456') RETURNING id`,
      [publicationId, buyer, owner, status],
    );
    await pool.query(
      `INSERT INTO reservations (publication_id, operation_id, start_date, end_date)
       VALUES ($1, $2, '2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z')`,
      [publicationId, rows[0].id],
    );
    return rows[0].id;
  }

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test') {
      throw new Error('Las pruebas requieren la instancia desechable del script.');
    }
    process.env.DATABASE_URL = url.href;
    process.env.JWT_SECRET = secret;
    ({ default: app } = await import('../src/app.js'));
    ({ default: pool } = await import('../src/config/database.js'));
    const { runMigrations } = await import('../src/db/migrate.js');
    await runMigrations(pool);
    owner = await user();
    buyer = await user();
  });

  afterAll(async () => { if (pool) await pool.end(); });

  it('crea y consulta el catálogo con la migración incluida, sin correo público', async () => {
    const created = await request(app).post('/api/publications').set(auth(owner)).send({
      title: 'Microscopio', description: 'Equipo', category: 'Sistemas', condition: 'Usado',
      modality: 'Venta', price: 25, guarantee_amount: 0, images: ['https://example.test/equipo.jpg'],
    });
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/publications?faculty=Sistemas');
    expect(list.status).toBe(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.publication.id, category: 'Sistemas' })]));
    const detail = await request(app).get(`/api/publications/${created.body.publication.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).not.toHaveProperty('email');
    expect(detail.body.images).toHaveLength(1);
  });

  it.each([
    ['/api/auth/register', {}],
    ['/api/auth/register', { email: 'persona@estudiante.ucsm.edu.pe', password: 'corta' }],
    ['/api/auth/login', {}],
    ['/api/auth/login', { email: 'correo-invalido', password: 'clave-segura' }],
  ])('rechaza entrada inválida en POST %s', async (path, body) => {
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it('rechaza un identificador inválido en el detalle público', async () => {
    const res = await request(app).get('/api/publications/no-es-un-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/postgres|syntax|uuid/i);
  });

  it('rechaza una publicación incompleta antes de abrir una transacción', async () => {
    const res = await request(app).post('/api/publications').set(auth(owner)).send({ title: 'Sin datos' });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it('rechaza una publicación pausada en el detalle público', async () => {
    const id = await publication('Pausada');
    expect((await request(app).get(`/api/publications/${id}`)).status).toBe(404);
  });

  it('bloquea un token válido si la cuenta fue suspendida', async () => {
    const id = await user('Suspendida');
    expect((await request(app).get('/api/auth/me').set(auth(id))).status).toBe(403);
  });

  it('toma el rol vigente de la base de datos aunque el JWT tenga un rol anterior', async () => {
    const res = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${token(buyer, 'Administrador')}` });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('Estudiante');
  });

  it('rechaza al usuario que ya no existe aunque conserve un JWT firmado', async () => {
    expect((await request(app).get('/api/auth/me').set(auth(randomUUID()))).status).toBe(401);
  });

  it.each([
    ['Pendiente de verificación', 'No verificado'],
    ['Activa', 'No verificado'],
    ['Activa', 'Rechazado'],
  ])('impide publicar y reservar a una cuenta %s / %s', async (status, verification) => {
    const id = await user(status, verification);
    const pub = await publication();
    const create = await request(app).post('/api/publications').set(auth(id)).send({
      title: 'Equipo', description: 'Equipo', category: 'Sistemas', condition: 'Usado', modality: 'Venta', price: 10,
    });
    expect(create.status).toBe(403);
    const reserve = await request(app).post('/api/operations').set(auth(id)).send({
      publication_id: pub, start_date: '2026-10-01T10:00:00Z', end_date: '2026-10-02T10:00:00Z',
    });
    expect(reserve.status).toBe(403);
  });

  it('no entrega una operación pendiente de pago aunque el OTP sea correcto', async () => {
    const id = await operation('Pendiente de pago/garantía');
    const res = await request(app).post(`/api/operations/${id}/confirm`).set(auth(owner)).send({ otp_code: '123456' });
    expect(res.status).toBe(409);
    const { rows } = await pool.query('SELECT status FROM operations WHERE id = $1', [id]);
    expect(rows[0].status).toBe('Pendiente de pago/garantía');
  });

  it('confirma una sola entrega concurrente, consume el OTP y activa la reserva', async () => {
    const id = await operation();
    const responses = await Promise.all([1, 2].map(() => request(app)
      .post(`/api/operations/${id}/confirm`).set(auth(owner)).send({ otp_code: '123456' })));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const { rows } = await pool.query('SELECT status, otp_code FROM operations WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ status: 'Entregada/Activa', otp_code: null });
    const reservations = await pool.query('SELECT status FROM reservations WHERE operation_id = $1', [id]);
    expect(reservations.rows[0].status).toBe('Activa/En uso');
    const audit = await pool.query('SELECT new_values FROM audit_logs WHERE entity_id = $1', [id]);
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows)).not.toContain('123456');
  });

  it('rechaza OTP inválido y confirma solo el oferente', async () => {
    const id = await operation();
    expect((await request(app).post(`/api/operations/${id}/confirm`).set(auth(owner)).send({ otp_code: '000000' })).status).toBe(400);
    expect((await request(app).post(`/api/operations/${id}/confirm`).set(auth(buyer)).send({ otp_code: '123456' })).status).toBe(403);
  });

  it('revierte entrega, consumo del OTP y reserva si falla la auditoría', async () => {
    const id = await operation();
    // ID generado por PostgreSQL en esta instancia desechable; no hay entrada externa.
    await pool.query(`ALTER TABLE audit_logs ADD CONSTRAINT test_reject_audit CHECK (entity_id <> '${id}'::uuid)`);
    try {
      const res = await request(app).post(`/api/operations/${id}/confirm`).set(auth(owner)).send({ otp_code: '123456' });
      expect(res.status).toBe(500);
      const state = await pool.query('SELECT status, otp_code FROM operations WHERE id = $1', [id]);
      expect(state.rows[0]).toEqual({ status: 'Lista para entrega', otp_code: '123456' });
      const reservation = await pool.query('SELECT status FROM reservations WHERE operation_id = $1', [id]);
      expect(reservation.rows[0].status).toBe('Bloqueo Provisional');
    } finally {
      await pool.query('ALTER TABLE audit_logs DROP CONSTRAINT test_reject_audit');
    }
  });

  it('solo crea una reserva cuando dos solicitudes compiten por las mismas fechas', async () => {
    const pub = await publication();
    const responses = await Promise.all([1, 2].map(() => request(app).post('/api/operations').set(auth(buyer)).send({
      publication_id: pub, start_date: '2026-10-01T10:00:00Z', end_date: '2026-10-02T10:00:00Z',
    })));
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(responses.find((r) => r.status === 201).body).not.toHaveProperty('otp_code');
    const { rows } = await pool.query('SELECT id FROM reservations WHERE publication_id = $1', [pub]);
    expect(rows).toHaveLength(1);
  });

  it.each(['Pausada', 'Borrador', 'Retirada'])('no reserva una publicación %s', async (status) => {
    const pub = await publication(status);
    const res = await request(app).post('/api/operations').set(auth(buyer)).send({
      publication_id: pub, start_date: '2026-10-01', end_date: '2026-10-03',
    });
    expect(res.status).toBe(409);
    expect((await pool.query('SELECT id FROM operations WHERE publication_id = $1', [pub])).rows).toHaveLength(0);
  });

  it.each([
    {},
    { start_date: '2026-10-01' },
    { start_date: '2026-10-03', end_date: '2026-10-01' },
    { start_date: '2026-10-01', end_date: '2026-10-01' },
    { start_date: '2026-02-30', end_date: '2026-10-01' },
    { start_date: 'invalid', end_date: '2026-10-01' },
  ])('rechaza un intervalo de alquiler inválido: %j', async (dates) => {
    const pub = await publication();
    const res = await request(app).post('/api/operations').set(auth(buyer)).send({ publication_id: pub, ...dates });
    expect(res.status).toBe(400);
    expect((await pool.query('SELECT id FROM operations WHERE publication_id = $1', [pub])).rows).toHaveLength(0);
  });

  it('rechaza identificadores malformados y no filtra mensajes de PostgreSQL', async () => {
    const res = await request(app).post('/api/operations').set(auth(buyer)).send({ publication_id: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/uuid|syntax|postgres/i);
  });

  it('rechaza fechas de reserva en una venta', async () => {
    const pub = await publication('Activa', 'Venta');
    const res = await request(app).post('/api/operations').set(auth(buyer)).send({
      publication_id: pub, start_date: '2026-10-01', end_date: '2026-10-03',
    });
    expect(res.status).toBe(400);
  });

  it('no deja conexiones con transacciones abiertas después de los rechazos', async () => {
    const pub = await publication();
    expect((await request(app).post('/api/operations').set(auth(owner)).send({ publication_id: pub })).status).toBe(400);
    const { rows } = await pool.query(
      `SELECT pid FROM pg_stat_activity WHERE datname = current_database()
       AND pid <> pg_backend_pid() AND state = 'idle in transaction'`,
    );
    expect(rows).toHaveLength(0);
  });
});
