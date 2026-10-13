import { beforeEach, expect, it, vi } from 'vitest';
import { runMigrations } from '../src/db/migrate.js';
import { prepareDevelopmentDatabase } from '../src/db/prepare-development-database.js';
vi.mock('../src/db/migrate.js', () => ({ runMigrations: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it('migrates the actual application pool before checking required tables', async () => {
  const db = { query: vi.fn(async () => ({ rows: [] })) };
  runMigrations.mockImplementation(async received => {
    expect(received).toBe(db);
    expect(db.query).not.toHaveBeenCalled();
    return { applied: ['020_calendar_and_simulated_payment.sql'], skipped: [] };
  });
  expect(await prepareDevelopmentDatabase(db)).toMatchObject({ applied: ['020_calendar_and_simulated_payment.sql'] });
  expect(db.query.mock.calls[0][1][0]).toContain('operation_payment_simulations');
});
it('does not allow startup if a recorded migration has a missing payment table', async () => {
  runMigrations.mockResolvedValue({ applied: [], skipped: ['020_calendar_and_simulated_payment.sql'] });
  const db = { query: vi.fn(async () => ({ rows: [{ name: 'operation_payment_simulations' }] })) };
  await expect(prepareDevelopmentDatabase(db)).rejects.toMatchObject({ code: 'DATABASE_SCHEMA_NOT_READY' });
});
it('propagates migration failures without pretending the schema is ready', async () => {
  runMigrations.mockRejectedValue(new Error('Migration failed'));
  const db = { query: vi.fn() };
  await expect(prepareDevelopmentDatabase(db)).rejects.toThrow('Migration failed');
  expect(db.query).not.toHaveBeenCalled();
});
