import { z } from 'zod';
import { assertNoSensitiveKeys } from '../../shared/security/sensitive-data.js';

const jsonObject = z.custom(value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}, { message: 'Expected a JSON object' }).pipe(z.json());

const outboxEvent = z.object({
  aggregateType: z.string().trim().min(1).max(100),
  aggregateId: z.uuid(),
  eventType: z.string().trim().min(1).max(200),
  payload: jsonObject,
  deduplicationKey: z.string().trim().min(1).max(500),
  availableAt: z.date().optional(),
});
const leaseOwner = z.object({ id: z.uuid(), workerId: z.string().trim().min(1).max(200) });
const claimOptions = z.object({
  workerId: leaseOwner.shape.workerId,
  limit: z.number().int().min(1).max(1000).default(20),
  leaseSeconds: z.number().int().min(1).max(86400).default(60),
});

// Pass the business transaction client to make this insert atomic with the domain write.
export async function enqueueOutboxEvent(db, event) {
  assertNoSensitiveKeys(event?.payload, 'outbox payload');
  const parsed = outboxEvent.parse(event);
  const { rows } = await db.query(
    `INSERT INTO outbox_events
       (aggregate_type, aggregate_id, event_type, payload, deduplication_key, available_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
     ON CONFLICT (deduplication_key) DO NOTHING
     RETURNING *`,
    [parsed.aggregateType, parsed.aggregateId, parsed.eventType, parsed.payload,
      parsed.deduplicationKey, parsed.availableAt ?? null],
  );
  if (rows[0]) return rows[0];
  // A separate statement sees the concurrent winner after ON CONFLICT waits for it.
  const existing = await db.query('SELECT * FROM outbox_events WHERE deduplication_key = $1', [parsed.deduplicationKey]);
  return existing.rows[0];
}

// One statement is a short implicit transaction on a Pool or an idle pg Client.
// Worker use requires autocommit: never wrap claiming/dispatch in a business transaction.
// All workers for a queue must use the same leaseSeconds; worker IDs identify unique runs.
export async function claimOutboxBatch(db, options) {
  const { workerId, limit, leaseSeconds } = claimOptions.parse(options);
  const { rows } = await db.query(
    `WITH candidates AS (
       SELECT id FROM outbox_events
       WHERE (status = 'pending' AND available_at <= statement_timestamp())
          OR (status = 'processing' AND locked_at < statement_timestamp() - make_interval(secs => $3))
       ORDER BY available_at, created_at, id
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE outbox_events AS event
     SET status = 'processing', locked_at = statement_timestamp(), locked_by = $1, updated_at = statement_timestamp()
     FROM candidates WHERE event.id = candidates.id
     RETURNING event.*`,
    [workerId, limit, leaseSeconds],
  );
  return rows;
}

export async function completeOutboxEvent(db, options) {
  const { id, workerId } = leaseOwner.parse(options);
  const { rows } = await db.query(
    `UPDATE outbox_events
     SET status = 'processed', processed_at = statement_timestamp(), updated_at = statement_timestamp(),
         locked_at = NULL, locked_by = NULL, last_error = NULL
     WHERE id = $1 AND status = 'processing' AND locked_by = $2
     RETURNING *`,
    [id, workerId],
  );
  return rows[0] ?? null;
}

export async function failOutboxEvent(db, options) {
  const { id, workerId } = leaseOwner.parse(options);
  const retryAt = z.date().parse(options.retryAt);
  // Arbitrary handler errors may contain SQL, payloads or credentials. Persist only a
  // fixed safe diagnostic, never Error.message/stack or coercion of a thrown object.
  const safeError = 'Outbox handler failed.';
  const { rows } = await db.query(
    `UPDATE outbox_events
     SET status = 'pending', attempts = attempts + 1, last_error = $3, available_at = $4,
         locked_at = NULL, locked_by = NULL, updated_at = statement_timestamp()
     WHERE id = $1 AND status = 'processing' AND locked_by = $2
     RETURNING *`,
    [id, workerId, safeError, retryAt],
  );
  return rows[0] ?? null;
}
