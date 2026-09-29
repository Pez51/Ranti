import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pool from '../config/database.js';
import { baselineValidationError, validateBaseline } from './validate-baseline.js';

const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
// Shared by every runner; session ownership survives each migration's COMMIT.
const migrationLock = [1380011604, 1];

export async function runMigrations(db = pool, { directory = migrationsDirectory, adoptBaseline = false } = {}) {
  const client = await db.connect();
  let locked = false;
  let discardClient;
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', migrationLock);
    locked = true;
    const names = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    const migrations = await Promise.all(names.map(async (name) => {
      const bytes = await readFile(resolve(directory, name));
      return { name, bytes, checksum: createHash('sha256').update(bytes).digest('hex') };
    }));
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT name, checksum FROM schema_migrations');
    const history = new Map(rows.map((row) => [row.name, row.checksum]));
    // Validate the complete set before executing even the first pending file.
    for (const migration of migrations) {
      if (history.has(migration.name) && history.get(migration.name) !== migration.checksum) {
        const error = new Error(`Applied migration has changed: ${migration.name}`);
        error.code = 'MIGRATION_CHECKSUM_MISMATCH';
        throw error;
      }
    }
    if (adoptBaseline && !history.has('001_init.sql') && !migrations.some((m) => m.name === '001_init.sql')) {
      throw baselineValidationError('001_init.sql is missing from the migration directory');
    }
    const result = { applied: [], skipped: [] };
    for (const migration of migrations) {
      if (history.has(migration.name)) {
        result.skipped.push(migration.name);
        continue;
      }
      await client.query('BEGIN');
      try {
        const adopting = adoptBaseline && migration.name === '001_init.sql';
        if (adopting) await validateBaseline(client);
        else await client.query(migration.bytes.toString('utf8'));
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [migration.name, migration.checksum]);
        await client.query('COMMIT');
        result[adopting ? 'skipped' : 'applied'].push(migration.name);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { discardClient = rollbackError; }
        throw error;
      }
    }
    return result;
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1, $2)', migrationLock);
    } catch (error) {
      // Never return a session whose lock ownership is uncertain to the pool.
      discardClient = error;
      throw error;
    } finally {
      client.release(discardClient);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(await runMigrations(pool, { adoptBaseline: process.argv.includes('--adopt-baseline') }));
  } catch (error) {
    console.error(`Migration failed (${error.code || 'ERROR'}): ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
