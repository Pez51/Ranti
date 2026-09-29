import { z } from 'zod';
import { assertNoSensitiveKeys } from '../../shared/security/sensitive-data.js';

const jsonObject = z.custom(value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}, { message: 'Expected a JSON object' }).pipe(z.json());

const auditEvent = z.object({
  actorId: z.uuid().nullable().optional(),
  action: z.string().trim().min(1).max(100),
  entityType: z.string().trim().min(1).max(100),
  entityId: z.uuid(),
  oldValues: jsonObject.nullable().optional(),
  newValues: jsonObject.nullable().optional(),
  requestId: z.uuid().nullable().optional(),
  metadata: jsonObject.optional(),
});

export async function appendAudit(db, event) {
  assertNoSensitiveKeys(event?.oldValues, 'oldValues');
  assertNoSensitiveKeys(event?.newValues, 'newValues');
  assertNoSensitiveKeys(event?.metadata, 'metadata');

  const parsed = auditEvent.parse(event);
  const oldValues = parsed.oldValues ?? null;
  const newValues = parsed.newValues ?? null;
  const metadata = parsed.metadata ?? {};

  const { rows } = await db.query(
    `INSERT INTO audit_logs
       (actor_id, action, entity_type, entity_id, old_values, new_values, request_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [parsed.actorId ?? null, parsed.action, parsed.entityType, parsed.entityId,
      oldValues, newValues, parsed.requestId ?? null, metadata],
  );
  return rows[0];
}
