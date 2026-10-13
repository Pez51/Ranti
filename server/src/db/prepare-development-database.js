import { runMigrations } from './migrate.js';

// Development starts must use the same pool as the HTTP application. Never
// migrate a hard-coded demo URL while serving requests against another database.
export async function prepareDevelopmentDatabase(db) {
  const result = await runMigrations(db);
  const required = ['operations', 'operation_handoffs', 'publication_conversations',
    'conversation_messages', 'operation_calendar_availability', 'operation_payment_simulations'];
  const missing = (await db.query(`SELECT name FROM unnest($1::text[]) AS name
    WHERE to_regclass('public.' || name) IS NULL`, [required])).rows;
  if (missing.length) {
    const error = new Error(`El esquema de desarrollo está incompleto: ${missing.map(row => row.name).join(', ')}. Revisa la base configurada y el historial de migraciones; no se iniciará el servidor.`);
    error.code = 'DATABASE_SCHEMA_NOT_READY';
    throw error;
  }
  return result;
}
