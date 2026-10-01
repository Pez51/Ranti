import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Each suite owns its tables, including queue-wide claims and destructive cleanup.
export async function createDisposableDatabase() {
  if (process.env.RANTI_EPHEMERAL_DB !== '1' || !process.env.TEST_DATABASE_URL) {
    throw new Error('Integration tests require the disposable PostgreSQL cluster.');
  }
  const url = new URL(process.env.TEST_DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test') {
    throw new Error('Integration tests require the disposable local database.');
  }
  const cluster = new pg.Pool({ connectionString: url.href });
  // The identifier is generated here, never supplied by an environment variable or caller.
  const name = `suite_${randomUUID().replaceAll('-', '')}`;
  try {
    await cluster.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await cluster.end();
    throw error;
  }
  url.pathname = `/${name}`;
  const db = new pg.Pool({ connectionString: url.href });
  return {
    db,
    async close() {
      try {
        await db.end();
      } finally {
        try { await cluster.query(`DROP DATABASE "${name}"`); }
        finally { await cluster.end(); }
      }
    },
  };
}
