import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)('Audit repository with disposable PostgreSQL', () => {
  let db;
  let appendAudit;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test') {
      throw new Error('Audit integration tests require the disposable local database.');
    }
    db = new pg.Pool({ connectionString: url.href });
    const { runMigrations } = await import('../src/db/migrate.js');
    ({ appendAudit } = await import('../src/modules/audit/audit.repository.js'));
    await runMigrations(db);
  });

  afterAll(async () => { if (db) await db.end(); });

  it('inserts and reads an audit row with JSON and default metadata', async () => {
    const entityId = randomUUID();
    const row = await appendAudit(db, {
      action: 'publication.created', entityType: 'publication', entityId,
      newValues: { status: 'Borrador' },
    });
    const { rows } = await db.query('SELECT * FROM audit_logs WHERE id = $1', [row.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: row.id, actor_id: null, action: 'publication.created', entity_type: 'publication',
      entity_id: entityId, old_values: null, new_values: { status: 'Borrador' },
      request_id: null, metadata: {},
    });
    expect(row.timestamp).toBeInstanceOf(Date);
  });

  it('refuses update and delete of a stored audit row', async () => {
    const row = await appendAudit(db, {
      action: 'publication.reviewed', entityType: 'publication', entityId: randomUUID(),
    });
    await expect(db.query('UPDATE audit_logs SET action = $1 WHERE id = $2', ['changed', row.id]))
      .rejects.toThrow(/immutable/i);
    await expect(db.query('DELETE FROM audit_logs WHERE id = $1', [row.id]))
      .rejects.toThrow(/immutable/i);
    expect((await db.query('SELECT action FROM audit_logs WHERE id = $1', [row.id])).rows)
      .toEqual([{ action: 'publication.reviewed' }]);
  });

  it('rolls back a business insert when the audit insert fails in the same transaction', async () => {
    const client = await db.connect();
    const email = `audit-${randomUUID()}@estudiante.ucsm.edu.pe`;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, 'test-only', 'Estudiante') RETURNING id`,
        [email],
      );
      await expect(appendAudit(client, {
        actorId: randomUUID(), action: 'user.created', entityType: 'user', entityId: rows[0].id,
      })).rejects.toMatchObject({ code: '23503' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect((await db.query('SELECT id FROM users WHERE email = $1', [email])).rows).toEqual([]);
  });
});
