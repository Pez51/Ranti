import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { requireRole } from '../src/middlewares/auth.middleware.js';

const validSource = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://ranti:local@127.0.0.1:5432/ranti',
  JWT_SECRET: 'local-test-secret-with-at-least-32-characters',
  FRONTEND_URL: 'http://localhost:5173',
};

function response() {
  const res = { statusCode: 200, body: undefined };
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('configuración del servidor', () => {
  it('parsea y congela una configuración válida de desarrollo', () => {
    const config = loadEnv(validSource);

    expect(config).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: validSource.DATABASE_URL,
      JWT_SECRET: validSource.JWT_SECRET,
      FRONTEND_URL: 'http://localhost:5173',
      PAYMENT_PROVIDER: 'simulated',
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('rechaza una configuración sin DATABASE_URL', () => {
    const { DATABASE_URL, ...source } = validSource;

    expect(() => loadEnv(source)).toThrow(/configuraci[oó]n.*DATABASE_URL/i);
  });

  it('rechaza JWT_SECRET de menos de 32 caracteres fuera de pruebas', () => {
    expect(() => loadEnv({ ...validSource, NODE_ENV: 'production', JWT_SECRET: 'short' }))
      .toThrow(/configuraci[oó]n.*JWT_SECRET/i);
  });

  it('rechaza PAYMENT_PROVIDER desconocido', () => {
    expect(() => loadEnv({ ...validSource, PAYMENT_PROVIDER: 'unknown' }))
      .toThrow(/configuraci[oó]n.*PAYMENT_PROVIDER/i);
  });
});

describe('requireRole', () => {
  it('permite continuar a un administrador', () => {
    const res = response();
    const next = vi.fn();

    requireRole('Administrador')({ user: { role: 'Administrador' } }, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('devuelve 403 a Egresado sin revelar los roles permitidos', () => {
    const res = response();
    const next = vi.fn();

    requireRole('Administrador')({ user: { role: 'Egresado' } }, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(JSON.stringify(res.body)).not.toContain('Administrador');
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 401 si falta el usuario autenticado', () => {
    const res = response();
    const next = vi.fn();

    requireRole('Administrador')({}, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
