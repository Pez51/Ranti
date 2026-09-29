import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { enqueueOutboxEvent, claimOutboxBatch, failOutboxEvent } from '../src/modules/outbox/outbox.repository.js';
import { processOutboxBatch } from '../src/modules/outbox/outbox.worker.js';
import { createInAppNotification } from '../src/controllers/notification.controller.js';

const event = () => ({ aggregateType: 'operation', aggregateId: randomUUID(), eventType: 'operation.created',
  payload: { status: 'Pendiente' }, deduplicationKey: randomUUID() });

describe('outbox validation and persistence boundary', () => {
  it('passes JSON payload and explicit schedule as SQL parameters', async () => {
    const input = { ...event(), availableAt: new Date('2030-01-01T00:00:00Z') };
    const stored = { id: randomUUID() };
    const db = { query: vi.fn().mockResolvedValue({ rows: [stored] }) };
    expect(await enqueueOutboxEvent(db, input)).toEqual(stored);
    expect(db.query.mock.calls[0][1]).toEqual([input.aggregateType, input.aggregateId, input.eventType,
      input.payload, input.deduplicationKey, input.availableAt]);
  });

  it.each(['password', 'TOKEN', 'Otp', 'pan', 'CVV'])('rejects nested %s before persistence', async key => {
    const db = { query: vi.fn() };
    await expect(enqueueOutboxEvent(db, { ...event(), payload: { nested: [{ [key]: 'secret' }] } }))
      .rejects.toMatchObject({ code: 'AUDIT_SENSITIVE_DATA' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each([null, [], 'text', { invalid: undefined }])('rejects non-object or non-JSON payload %j', async payload => {
    const db = { query: vi.fn() };
    await expect(enqueueOutboxEvent(db, { ...event(), payload })).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each([{ workerId: '' }, { workerId: 'w', limit: 0 }, { workerId: 'w', leaseSeconds: -1 }])(
    'rejects unsafe claim options %j', async options => {
      const db = { query: vi.fn() };
      await expect(claimOutboxBatch(db, options)).rejects.toThrow();
      expect(db.query).not.toHaveBeenCalled();
    });

  it('never persists raw exception text, stack, SQL, or credentials', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ attempts: 1 }] }) };
    await failOutboxEvent(db, { id: randomUUID(), workerId: 'w', retryAt: new Date(),
      error: new Error('SELECT password FROM users; token=secret\nPAN 4111111111111111 ' + 'x'.repeat(800)) });
    const params = db.query.mock.calls[0][1];
    const storedError = params[2];
    expect(storedError.length).toBeLessThanOrEqual(500);
    expect(storedError).not.toMatch(/SELECT|password|token|secret|411111|\n|Error:/);
  });

  it('creates a notification through the supplied database and returns its stored row', async () => {
    const payload = { userId: randomUUID(), type: 'Sistema', title: 'Aviso', message: 'Listo' };
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 'stored' }] }) };
    expect(await createInAppNotification(db, payload)).toEqual({ id: 'stored' });
    expect(db.query.mock.calls[0][1]).toEqual([payload.userId, 'Sistema', 'Aviso', 'Listo', null]);
  });
});

describe('outbox worker retries', () => {
  it.each([[0, '2030-01-01T00:01:00.000Z'], [2, '2030-01-01T00:04:00.000Z'],
    [7, '2030-01-01T01:00:00.000Z'], [1000, '2030-01-01T01:00:00.000Z']])(
    'schedules the next retry after %i previous failures', async (attempts, expected) => {
      const row = { id: randomUUID(), event_type: 'known', payload: {}, attempts };
      const db = { query: vi.fn().mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ ...row, attempts: attempts + 1 }] }) };
      expect(await processOutboxBatch({ db, workerId: 'w', handlers: { known: async () => { throw new Error('private'); } },
        now: () => new Date('2030-01-01T00:00:00Z') })).toEqual({ processed: 0, failed: 1 });
      expect(db.query.mock.calls[1][1][3].toISOString()).toBe(expected);
    });

  it.each(['missing', 'toString', '__proto__'])('rejects unregistered exact handler %s', async eventType => {
    const row = { id: randomUUID(), event_type: eventType, payload: {}, attempts: 0 };
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [row] }) };
    expect(await processOutboxBatch({ db, workerId: 'w', handlers: {} })).toEqual({ processed: 0, failed: 1 });
    expect(db.query.mock.calls[1][1][2]).toBeTruthy();
  });
});
