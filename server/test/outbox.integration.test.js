import { randomUUID } from 'node:crypto';
import { createDisposableDatabase } from './helpers/disposable-database.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)('Outbox with disposable PostgreSQL', () => {
  let db, database;
  let enqueueOutboxEvent, claimOutboxBatch, completeOutboxEvent, failOutboxEvent, processOutboxBatch, createInAppNotification;
  const event = (overrides = {}) => ({ aggregateType: 'operation', aggregateId: randomUUID(),
    eventType: 'operation.created', payload: { status: 'Pendiente' }, deduplicationKey: randomUUID(), ...overrides });
  const read = async id => (await db.query('SELECT * FROM outbox_events WHERE id = $1', [id])).rows[0];

  beforeAll(async () => {
    database = await createDisposableDatabase();
    db = database.db;
    const { runMigrations } = await import('../src/db/migrate.js');
    ({ enqueueOutboxEvent, claimOutboxBatch, completeOutboxEvent, failOutboxEvent } = await import('../src/modules/outbox/outbox.repository.js'));
    ({ processOutboxBatch } = await import('../src/modules/outbox/outbox.worker.js'));
    ({ createInAppNotification } = await import('../src/controllers/notification.controller.js'));
    await runMigrations(db);
  });
  beforeEach(async () => { await db.query('TRUNCATE outbox_events'); });
  afterAll(async () => { if (database) await database.close(); });

  it('deduplicates concurrent enqueue and preserves the original payload', async () => {
    const input = event();
    const firstWriters = await Promise.all(Array.from({ length: 4 }, () => enqueueOutboxEvent(db, input)));
    const first = firstWriters[0];
    expect(firstWriters.every(row => row.id === first.id)).toBe(true);
    const duplicates = await Promise.all(Array.from({ length: 4 }, () => enqueueOutboxEvent(db,
      { ...input, payload: { changed: true } })));
    expect(duplicates.every(row => row.id === first.id && row.payload.status === 'Pendiente')).toBe(true);
    expect((await db.query('SELECT count(*)::int AS count FROM outbox_events')).rows[0].count).toBe(1);
  });

  it('enqueues atomically with business data using a transaction client', async () => {
    const client = await db.connect();
    const input = event();
    try {
      await client.query('BEGIN');
      await enqueueOutboxEvent(client, input);
      expect((await db.query('SELECT id FROM outbox_events')).rows).toEqual([]);
      await client.query('ROLLBACK');
    } finally { client.release(); }
    expect((await db.query('SELECT id FROM outbox_events')).rows).toEqual([]);
  });

  it('rejects sensitive payload without storing anything', async () => {
    await expect(enqueueOutboxEvent(db, event({ payload: { nested: [{ ToKeN: 'private' }] } })))
      .rejects.toMatchObject({ code: 'AUDIT_SENSITIVE_DATA' });
    expect((await db.query('SELECT id FROM outbox_events')).rows).toEqual([]);
  });

  it('gives competing workers disjoint live leases and respects batch size', async () => {
    await Promise.all(Array.from({ length: 6 }, () => enqueueOutboxEvent(db, event())));
    const [a, b] = await Promise.all(['a', 'b'].map(workerId => claimOutboxBatch(db, { workerId, limit: 3 })));
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    expect(new Set([...a, ...b].map(row => row.id)).size).toBe(6);
    expect(await claimOutboxBatch(db, { workerId: 'c' })).toEqual([]);
  });

  it('skips locked rows without blocking a competing transaction client', async () => {
    const row = await enqueueOutboxEvent(db, event());
    const locker = await db.connect();
    const worker = await db.connect();
    try {
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM outbox_events WHERE id = $1 FOR UPDATE', [row.id]);
      await worker.query("SET statement_timeout = '1s'");
      expect(await claimOutboxBatch(worker, { workerId: 'b' })).toEqual([]);
    } finally {
      await locker.query('ROLLBACK');
      await worker.query('RESET statement_timeout');
      locker.release(); worker.release();
    }
  });

  it('reclaims expired leases and refuses completion or failure by the stale worker', async () => {
    const row = await enqueueOutboxEvent(db, event());
    await claimOutboxBatch(db, { workerId: 'old' });
    await db.query("UPDATE outbox_events SET locked_at = now() - interval '61 seconds' WHERE id = $1", [row.id]);
    expect((await claimOutboxBatch(db, { workerId: 'new' })).map(item => item.id)).toEqual([row.id]);
    expect(await completeOutboxEvent(db, { id: row.id, workerId: 'old' })).toBeNull();
    expect(await failOutboxEvent(db, { id: row.id, workerId: 'old', error: new Error('failed'), retryAt: new Date() })).toBeNull();
    expect(await read(row.id)).toMatchObject({ status: 'processing', locked_by: 'new', attempts: 0 });
  });

  it('does not claim future events', async () => {
    await enqueueOutboxEvent(db, event({ availableAt: new Date('2099-01-01T00:00:00Z') }));
    expect(await claimOutboxBatch(db, { workerId: 'w' })).toEqual([]);
  });

  it('runs handlers after claim commit and processes each stored event once', async () => {
    const row = await enqueueOutboxEvent(db, event());
    let deliveries = 0;
    const handlers = { 'operation.created': async (payload, received) => {
      expect(payload).toEqual({ status: 'Pendiente' });
      expect(received.id).toBe(row.id);
      // A second connection sees the committed lease; NOWAIT proves its lock is released.
      const observer = await db.connect();
      try {
        await observer.query('BEGIN');
        const { rows } = await observer.query('SELECT status FROM outbox_events WHERE id = $1 FOR UPDATE NOWAIT', [row.id]);
        expect(rows[0].status).toBe('processing');
        await observer.query('ROLLBACK');
      } finally { observer.release(); }
      deliveries++;
    } };
    expect(await processOutboxBatch({ db, handlers, workerId: 'w' })).toEqual({ processed: 1, failed: 0 });
    expect(await processOutboxBatch({ db, handlers, workerId: 'w' })).toEqual({ processed: 0, failed: 0 });
    expect(deliveries).toBe(1);
    expect(await read(row.id)).toMatchObject({ status: 'processed', locked_at: null, locked_by: null, attempts: 0 });
    expect((await read(row.id)).processed_at).toBeInstanceOf(Date);
    expect(await completeOutboxEvent(db, { id: row.id, workerId: 'w' })).toBeNull();
  });

  it.each(['throw', 'unknown'])('records %s failures and defers retry', async mode => {
    const row = await enqueueOutboxEvent(db, event());
    const handlers = mode === 'unknown' ? {} : { 'operation.created': async () => { throw new Error('token=secret\nSELECT users'); } };
    expect(await processOutboxBatch({ db, handlers, workerId: 'w', now: () => new Date('2090-01-01T00:00:00Z') }))
      .toEqual({ processed: 0, failed: 1 });
    const stored = await read(row.id);
    expect(stored).toMatchObject({ status: 'pending', attempts: 1, locked_at: null, locked_by: null });
    expect(stored.available_at.toISOString()).toBe('2090-01-01T00:01:00.000Z');
    expect(stored.last_error.length).toBeLessThanOrEqual(500);
    expect(stored.last_error).not.toMatch(/secret|SELECT|token|\n/);
    expect(await claimOutboxBatch(db, { workerId: 'w2' })).toEqual([]);
  });

  it('does not count a stale handler as successfully persisted', async () => {
    const row = await enqueueOutboxEvent(db, event());
    const handlers = { 'operation.created': async () => {
      await db.query("UPDATE outbox_events SET locked_at = now() - interval '61 seconds' WHERE id = $1", [row.id]);
      await claimOutboxBatch(db, { workerId: 'replacement' });
    } };
    expect(await processOutboxBatch({ db, handlers, workerId: 'old' })).toEqual({ processed: 0, failed: 0 });
    expect(await read(row.id)).toMatchObject({ status: 'processing', locked_by: 'replacement' });
  });

  it('dispatches notification creation through the supplied client', async () => {
    const user = (await db.query("INSERT INTO users (email, password_hash, role) VALUES ($1, 'test', 'Estudiante') RETURNING id",
      [`outbox-${randomUUID()}@estudiante.ucsm.edu.pe`])).rows[0];
    const payload = { userId: user.id, type: 'Sistema', title: 'Aviso', message: 'Evento disponible' };
    await enqueueOutboxEvent(db, event({ eventType: 'notification.create', payload }));
    const client = await db.connect();
    try {
      expect(await processOutboxBatch({ db: client, workerId: 'notification',
        handlers: { 'notification.create': data => createInAppNotification(client, data) } }))
        .toEqual({ processed: 1, failed: 0 });
    } finally { client.release(); }
    expect((await db.query('SELECT title, message, reference_id FROM notifications WHERE user_id = $1', [user.id])).rows)
      .toEqual([{ title: 'Aviso', message: 'Evento disponible', reference_id: null }]);
  });
});
