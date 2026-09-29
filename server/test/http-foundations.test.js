import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('HTTP foundations', () => {
  it('adds a fresh server UUID to every health response', async () => {
    const first = await request(app).get('/health');
    const second = await request(app).get('/health');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers['x-request-id']).toMatch(uuidPattern);
    expect(second.headers['x-request-id']).toMatch(uuidPattern);
    expect(second.headers['x-request-id']).not.toBe(first.headers['x-request-id']);
    expect(first.body).toEqual({ status: 'OK', message: 'API Ranti funcionando correctamente' });
  });

  it('does not reflect a client supplied request ID', async () => {
    const suppliedId = randomUUID();
    const response = await request(app).get('/health').set('X-Request-Id', suppliedId);

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toMatch(uuidPattern);
    expect(response.headers['x-request-id']).not.toBe(suppliedId);
  });

  it('returns a normalized 404 for an unknown API route', async () => {
    const response = await request(app).get('/api/unknown-route');

    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toMatch(uuidPattern);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String),
        request_id: response.headers['x-request-id'],
      },
    });
  });

  it('returns INVALID_JSON without parser internals for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{ malformed');

    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toMatch(uuidPattern);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: expect.any(String),
        request_id: response.headers['x-request-id'],
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/SyntaxError|stack|body-parser|node_modules|Unexpected token/i);
  });

  it('keeps AppError public status, code and details', async () => {
    const { AppError } = await import('../src/shared/errors/app-error.js');
    const { requestContext } = await import('../src/middlewares/request-context.middleware.js');
    const { errorHandler } = await import('../src/middlewares/error.middleware.js');
    const testApp = express();
    testApp.use(requestContext);
    testApp.get('/failure', () => {
      throw new AppError({ status: 409, code: 'CONFLICT', message: 'Conflict', details: { field: 'name' } });
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/failure');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Conflict',
        details: { field: 'name' },
        request_id: response.headers['x-request-id'],
      },
    });
  });

  it('hides ordinary error details behind INTERNAL_ERROR', async () => {
    const { requestContext } = await import('../src/middlewares/request-context.middleware.js');
    const { errorHandler } = await import('../src/middlewares/error.middleware.js');
    const testApp = express();
    testApp.use(requestContext);
    testApp.get('/failure', () => {
      throw new Error('private database token');
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/failure');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: expect.any(String),
        request_id: response.headers['x-request-id'],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('private database token');
  });
});
