import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('Migraciones con PostgreSQL temporal real', () => {
  let admin;
  let db;
  let databaseName;
  let directory;
  let runMigrations;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test') {
      throw new Error('Las pruebas requieren la instancia desechable del script.');
    }
    process.env.DATABASE_URL = url.href;
    process.env.JWT_SECRET = 'migration-test-secret';
    admin = new pg.Pool({ connectionString: url.href });
    ({ runMigrations } = await import('../src/db/migrate.js'));
  });

  beforeEach(async () => {
    // Una base vacía independiente por caso, siempre dentro del clúster desechable.
    databaseName = `migration_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.pathname = `/${databaseName}`;
    db = new pg.Pool({ connectionString: url.href, max: 3 });
    directory = await mkdtemp(join(tmpdir(), 'ranti-migrations-'));
  });

  afterEach(async () => {
    if (db) await db.end();
    if (databaseName) await admin.query(`DROP DATABASE "${databaseName}"`);
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  afterAll(async () => { if (admin) await admin.end(); });

  async function noLeakedSession() {
    expect(db.waitingCount).toBe(0);
    expect(db.idleCount).toBe(db.totalCount);
    expect((await db.query(`SELECT 1 FROM pg_locks
      WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`)).rows).toEqual([]);
    expect((await db.query(`SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND state = 'idle in transaction'`)).rows).toEqual([]);
  }

  it('aplica 001 y 002 en una base vacía y omite ambas en la segunda ejecución', async () => {
    expect(await runMigrations(db)).toEqual({ applied: ['001_init.sql', '002_foundations.sql'], skipped: [] });
    expect(await runMigrations(db)).toEqual({ applied: [], skipped: ['001_init.sql', '002_foundations.sql'] });
    const { rows } = await db.query('SELECT name, checksum, applied_at FROM schema_migrations ORDER BY name');
    expect(rows.map((row) => row.name)).toEqual(['001_init.sql', '002_foundations.sql']);
    for (const row of rows) {
      expect(row.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(row.applied_at).toBeInstanceOf(Date);
    }
    expect((await db.query("SELECT to_regclass('users') AS users, to_regclass('outbox_events') AS outbox")).rows[0])
      .toEqual({ users: 'users', outbox: 'outbox_events' });
    await noLeakedSession();
  });

  it('serializa dos runners con un advisory lock de sesión y registra cada migración una vez', async () => {
    await writeFile(join(directory, '001_slow.sql'), 'SELECT pg_sleep(0.3); CREATE TABLE once_only (id int);');
    await writeFile(join(directory, '002_next.sql'), 'ALTER TABLE once_only ADD COLUMN value text;');
    const runs = Promise.all([runMigrations(db, { directory }), runMigrations(db, { directory })]);
    // El bloqueo sigue perteneciendo a un único backend durante todo el run.
    await expect.poll(async () => (await db.query(`SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND granted
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`)).rows[0].n).toBe(1);
    const results = await runs;
    expect(results.map((result) => result.applied.length).sort()).toEqual([0, 2]);
    expect(results.map((result) => result.skipped.length).sort()).toEqual([0, 2]);
    expect((await db.query('SELECT name FROM schema_migrations ORDER BY name')).rows)
      .toEqual([{ name: '001_slow.sql' }, { name: '002_next.sql' }]);
    await noLeakedSession();
  });

  it('detecta cambios de bytes incluso CRLF/LF antes de aplicar archivos nuevos', async () => {
    const original = Buffer.from('CREATE TABLE original (id int);\r\n');
    await writeFile(join(directory, '002_original.sql'), original);
    await runMigrations(db, { directory });
    expect((await db.query('SELECT checksum FROM schema_migrations')).rows[0].checksum)
      .toBe(createHash('sha256').update(original).digest('hex'));
    await writeFile(join(directory, '002_original.sql'), 'CREATE TABLE original (id int);\n');
    await writeFile(join(directory, '001_pending.sql'), 'CREATE TABLE must_not_exist (id int);');
    await expect(runMigrations(db, { directory })).rejects.toMatchObject({ code: 'MIGRATION_CHECKSUM_MISMATCH' });
    expect((await db.query("SELECT to_regclass('must_not_exist') AS name")).rows[0].name).toBeNull();
    expect((await db.query('SELECT name FROM schema_migrations')).rows).toEqual([{ name: '002_original.sql' }]);
    await noLeakedSession();
  });

  it('revierte solo la migración fallida y permite reintentar sin historial parcial', async () => {
    await writeFile(join(directory, '001_good.sql'), 'CREATE TABLE committed (id int);');
    await writeFile(join(directory, '002_bad.sql'), 'CREATE TABLE rolled_back (id int); SELECT * FROM nonexistent_table;');
    await expect(runMigrations(db, { directory })).rejects.toMatchObject({ code: '42P01' });
    expect((await db.query("SELECT to_regclass('rolled_back') AS name")).rows[0].name).toBeNull();
    expect((await db.query('SELECT name FROM schema_migrations')).rows).toEqual([{ name: '001_good.sql' }]);
    await noLeakedSession();
    await writeFile(join(directory, '002_bad.sql'), 'CREATE TABLE rolled_back (id int);');
    expect(await runMigrations(db, { directory })).toEqual({ applied: ['002_bad.sql'], skipped: ['001_good.sql'] });
  });

  it('conserva request_id y metadata e impide UPDATE y DELETE de auditoría', async () => {
    await runMigrations(db);
    const requestId = randomUUID();
    const { rows } = await db.query(`INSERT INTO audit_logs (action, entity_type, entity_id, request_id)
      VALUES ('created', 'test', $1, $2) RETURNING id, metadata, request_id`, [randomUUID(), requestId]);
    expect(rows[0]).toMatchObject({ metadata: {}, request_id: requestId });
    await expect(db.query('UPDATE audit_logs SET metadata = $1 WHERE id = $2', [{ changed: true }, rows[0].id]))
      .rejects.toThrow(/immutable/i);
    await expect(db.query('DELETE FROM audit_logs WHERE id = $1', [rows[0].id])).rejects.toThrow(/immutable/i);
    expect((await db.query('SELECT metadata FROM audit_logs WHERE id = $1', [rows[0].id])).rows).toEqual([{ metadata: {} }]);
  });

  it('crea el contrato outbox con deduplicación, estados, reintentos y lease', async () => {
    await runMigrations(db);
    const event = ['operation', randomUUID(), 'operation.created', { example: true }, 'unique-event'];
    const sql = `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, deduplication_key)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`;
    const row = (await db.query(sql, event)).rows[0];
    expect(row).toMatchObject({ status: 'pending', attempts: 0, locked_by: null, locked_at: null,
      last_error: null, processed_at: null, payload: { example: true } });
    for (const column of ['available_at', 'created_at', 'updated_at']) expect(row[column]).toBeInstanceOf(Date);
    await expect(db.query(sql, event)).rejects.toMatchObject({ code: '23505' });
    await expect(db.query("UPDATE outbox_events SET status = 'invalid' WHERE id = $1", [row.id])).rejects.toMatchObject({ code: '23514' });
    await expect(db.query('UPDATE outbox_events SET attempts = -1 WHERE id = $1', [row.id])).rejects.toMatchObject({ code: '23514' });
    await db.query("UPDATE outbox_events SET status = 'processing', locked_by = 'worker-1', locked_at = now() WHERE id = $1", [row.id]);
    await db.query("UPDATE outbox_events SET status = 'processed', processed_at = now() WHERE id = $1", [row.id]);
  });
});
