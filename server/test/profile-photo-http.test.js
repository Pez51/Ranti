import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/config/database.js', () => ({ default: { query } }));

import { env } from '../src/config/env.js';
import userRoutes from '../src/routes/user.routes.js';
import { photoStorage } from '../src/modules/users/photo-storage.js';

const user = { id: randomUUID(), email: 'foto@ucsm.edu.pe', role: 'Egresado',
  status: 'Activa', verification_status: 'Verificado', avatar_url: null };
const token = jwt.sign({ id: user.id }, env.JWT_SECRET);
const app = express();
app.use('/api/users', userRoutes);
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));

query.mockImplementation(async (sql, args) => {
  if (sql.includes('UPDATE users SET avatar_url')) {
    user.avatar_url = args[1];
    return { rows: [user] };
  }
  if (sql.includes('FROM users')) return { rows: [user] };
  return { rows: [] };
});

afterEach(async () => {
  const id = user.avatar_url?.split('/').at(-1);
  if (id) await photoStorage.remove(id);
  user.avatar_url = null;
  query.mockClear();
});

it('requires authentication before accepting a profile photo', async () => {
  const response = await request(app).put('/api/users/me/photo').set('Content-Type', 'image/png')
    .send(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(response.status).toBe(401);
  expect(user.avatar_url).toBeNull();
});

it('uploads and serves a verified user photo without an external URL', async () => {
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const uploaded = await request(app).put('/api/users/me/photo')
    .set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png').send(bytes);
  expect(uploaded.status).toBe(200);
  expect(uploaded.body.avatar_url).toMatch(/^\/api\/users\/photos\//);
  const served = await request(app).get(uploaded.body.avatar_url);
  expect(served.status).toBe(200);
  expect(served.headers['content-type']).toMatch(/^image\/png/);
  expect(served.body).toEqual(bytes);
});

it('rejects a file whose bytes disagree with its declared image type', async () => {
  const response = await request(app).put('/api/users/me/photo')
    .set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/jpeg')
    .send(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(response.status).toBe(400);
  expect(user.avatar_url).toBeNull();
});

it('still rejects direct uploads over 2 MB even if a caller bypasses client compression', async () => {
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 1);
  bytes.set([0xff, 0xd8, 0xff]);
  const response = await request(app).put('/api/users/me/photo')
    .set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/jpeg').send(bytes);
  expect(response.status).toBe(413);
  expect(user.avatar_url).toBeNull();
});
