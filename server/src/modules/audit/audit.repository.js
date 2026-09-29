import { z } from 'zod';
import { assertNoSensitiveKeys } from '../../shared/security/sensitive-data.js';

const auditEvent = z.object({
  actorId: z.uuid().nullable().optional(),
  action: z.string().trim().min(1).max(100),
  entityType: z.string().trim().min(1).max(100),
  entityId: z.uuid(),
  oldValues: z.json().optional(),
  newValues: z.json().optional(),
  requestId: z.uuid().nullable().optional(),
  metadata: z.json().refine(value => value !== null && typeof value === 'object' && !Array.isArray(value)).optional(),
});

export async function appendAudit(db, event) {
  const parsed = auditEvent.parse(event);
  const oldValues = parsed.oldValues ?? null;
  const newValues = parsed.newValues ?? null;
  const metadata = parsed.metadata ?? {};

  assertNoSensitiveKeys(oldValues, 'oldValues');
  assertNoSensitiveKeys(newValues, 'newValues');
  assertNoSensitiveKeys(metadata, 'metadata');

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
