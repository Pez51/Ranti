import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/config/database.js', () => ({ default: { query } }));
import { login } from '../src/controllers/auth.controller.js';
const app = express(); app.use(express.json()); app.post('/login', login);
const email = 'password-boundary@ucsm.edu.pe';
const hashes = new Map();
beforeAll(async () => {
  for (const password of ['a'.repeat(72), 'é'.repeat(36), 'short']) hashes.set(password, await bcrypt.hash(password, 4));
});
describe('login password byte boundary', () => {
  it.each(['a'.repeat(72), 'é'.repeat(36)])('accepts exact 72-byte password %s', async password => {
    query.mockResolvedValue({ rows: [{ id: 'test', email, password_hash: hashes.get(password), role: 'Egresado', status: 'Activa', verification_status: 'Verificado' }] });
    expect((await request(app).post('/login').send({ email, password })).status).toBe(200);
  });
  it.each(['é'.repeat(36) + 'a', 'é'.repeat(37), 'é'.repeat(40), 'a'.repeat(73), 'short'])(
    'rejects invalid password before reading credentials: %s', async password => {
      query.mockClear();
      query.mockResolvedValue({ rows: [{ id: 'test', email, password_hash: hashes.get(password === 'short' ? 'short' : 'é'.repeat(36)),
        role: 'Egresado', status: 'Activa', verification_status: 'Verificado' }] });
      const result = await request(app).post('/login').send({ email, password });
      expect(result.status).toBe(400); expect(result.body).not.toHaveProperty('token');
      expect(query).not.toHaveBeenCalled();
    });
});
