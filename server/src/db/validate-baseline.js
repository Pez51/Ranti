import { isDeepStrictEqual } from 'node:util';
import { baselineContract } from './baseline-contract.js';

export function baselineValidationError(detail) {
  const error = new Error(`Cannot adopt historical 001 baseline: ${detail}`);
  error.code = 'BASELINE_ADOPTION_VALIDATION_FAILED';
  return error;
}

// Called inside the adoption transaction while the migration session lock is held.
// This deliberately accepts only the unmodified public-schema historical baseline.
export async function validateBaseline(client) {
  const context = (await client.query(`SELECT current_schema() AS schema,
    EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE e.extname = 'uuid-ossp' AND n.nspname = 'public') AS extension,
    to_regclass('public.outbox_events') AS outbox`)).rows[0];
  if (context.schema !== 'public' || !context.extension || context.outbox) {
    throw baselineValidationError('expected public baseline with uuid-ossp and without outbox_events');
  }
  for (const [name, labels] of Object.entries(baselineContract.enums)) {
    const { rows } = await client.query(`SELECT e.enumlabel FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'public' AND t.typname = $1 ORDER BY e.enumsortorder`, [name]);
    if (!isDeepStrictEqual(rows.map((row) => row.enumlabel), labels)) {
      throw baselineValidationError(`enum ${name} differs`);
    }
  }
  for (const [name, expected] of Object.entries(baselineContract.tables)) {
    const { rows: tables } = await client.query(`SELECT c.oid FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'
        AND c.relpersistence = 'p' AND NOT c.relrowsecurity AND NOT c.relispartition`, [name]);
    if (tables.length !== 1) throw baselineValidationError(`table ${name} missing or incompatible`);
    // Names come exclusively from the frozen contract. Hold through history COMMIT.
    await client.query(`LOCK TABLE public."${name}" IN ACCESS EXCLUSIVE MODE`);
    const oid = tables[0].oid;
    const { rows: columns } = await client.query(`SELECT a.attname AS name,
      format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS required,
      pg_get_expr(d.adbin, d.adrelid) AS default_value
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [oid]);
    if (!isDeepStrictEqual(columns.map((c) => [c.name, c.type, c.required, c.default_value]), expected.columns)) {
      throw baselineValidationError(`columns of ${name} differ`);
    }
    const { rows: constraints } = await client.query(`SELECT pg_get_constraintdef(oid) AS definition,
      convalidated AS validated FROM pg_constraint WHERE conrelid = $1`, [oid]);
    if (constraints.some((c) => !c.validated)
      || !isDeepStrictEqual(constraints.map((c) => c.definition).sort(), expected.constraints)) {
      throw baselineValidationError(`constraints of ${name} differ`);
    }
    const { rows: restrictions } = await client.query(`SELECT 1 FROM pg_trigger
      WHERE tgrelid = $1 AND NOT tgisinternal
      UNION ALL SELECT 1 FROM pg_rewrite WHERE ev_class = $1
      UNION ALL SELECT 1 FROM pg_index i WHERE i.indrelid = $1 AND i.indisunique
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)`, [oid]);
    if (restrictions.length) throw baselineValidationError(`additional restrictions on ${name}`);
  }
}
