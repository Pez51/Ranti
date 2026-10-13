import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)('profile save persistence on disposable PostgreSQL', () => {
  let database, app;

  beforeAll(async () => {
    database = await createDisposableDatabase();
    await (await import('../src/db/migrate.js')).runMigrations(database.db);
    vi.resetModules();
    vi.doMock('../src/config/database.js', () => ({ default: database.db }));
    app = (await import('../src/app.js')).default;
  });

  afterAll(async () => {
    vi.doUnmock('../src/config/database.js');
    if (database) await database.close();
  });

  it.each(['Estudiante', 'Egresado'])('keeps %s profile changes after an independent GET', async role => {
    const id = randomUUID();
    const domain = role === 'Estudiante' ? 'estudiante.ucsm.edu.pe' : 'ucsm.edu.pe';
    await database.db.query(`INSERT INTO users (id, email, password_hash, role, status, verification_status)
      VALUES ($1, $2, 'unused-test-hash', $3, 'Activa', 'Verificado')`, [id, `${id}@${domain}`, role]);
    const token = jwt.sign({ id }, process.env.JWT_SECRET);
    const patch = { display_name: 'Perfil de prueba', contact_number: '987654321',
      faculty: 'Ciencias e Ingenierías Físicas y Formales', career: 'Ingeniería de Sistemas' };

    const saved = await request(app).patch('/api/users/me').auth(token, { type: 'bearer' }).send(patch);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject(patch);

    const reloaded = await request(app).get('/api/users/me').auth(token, { type: 'bearer' });
    expect(reloaded.status).toBe(200);
    expect(reloaded.body).toMatchObject({ ...patch, role });
    const row = (await database.db.query('SELECT display_name, contact_number, faculty, career FROM users WHERE id = $1', [id])).rows[0];
    expect(row).toEqual(patch);

    const rejected = await request(app).patch('/api/users/me').auth(token, { type: 'bearer' })
      .send({ ...patch, career: 'Carrera inexistente' });
    expect(rejected.status).toBe(400);
    expect((await request(app).get('/api/users/me').auth(token, { type: 'bearer' })).body).toMatchObject(patch);
  });
});
