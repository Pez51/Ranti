import { createHash } from 'node:crypto';
import { z } from 'zod';
import { appendAudit } from '../audit/audit.repository.js';
import { provenanceMime } from '../publications/provenance-files.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { AppError } from '../../shared/errors/app-error.js';

const types = ['Acceso', 'Rectificacion', 'Cancelacion', 'Oposicion'];
const finalStatuses = ['Atendida', 'Parcialmente atendida', 'Rechazada'];
const reviewStatuses = ['En revisión', 'Pendiente de subsanación', ...finalStatuses];
const allStatuses = ['Presentada', ...reviewStatuses];
const text = (limit) => z.string().trim().min(1).max(limit);
const caseData = {
  dataScope: text(1000),
  description: text(4000),
  attachment: z.object({ name: text(180), type: z.string(), content: z.base64().max(6_990_508) }).strict().optional(),
};
const creation = z.object({ ...caseData, submissionId: z.uuid(), type: z.enum(types), identityConfirmed: z.literal(true) }).strict();
const correction = z.object({ ...caseData, revision: z.number().int().positive() }).strict();
const decision = z.object({
  revision: z.number().int().positive(), status: z.enum(reviewStatuses), reason: text(4000),
  dueDate: z.iso.date().optional(), retentionReason: text(2000).optional(),
}).strict();
const filters = z.object({
  status: z.enum(allStatuses).optional(),
  offset: z.string().regex(/^\d{1,5}$/).transform(Number).optional(),
}).strict();

const failure = (status, code, message) => new AppError({ status, code, message, details: undefined });
const invalid = message => failure(400, 'ARCO_INVALID_INPUT', message);
const missing = () => failure(404, 'ARCO_NOT_FOUND', 'Expediente o archivo no encontrado.');
const stale = () => failure(409, 'ARCO_CHANGED', 'El expediente cambió. Consúltalo antes de continuar.');

function validate(schema, input, message) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalid(message);
  return parsed.data;
}

function validateId(id) {
  if (!z.uuid().safeParse(id).success) throw missing();
}

function evidenceBytes(attachment) {
  if (!attachment) return null;
  const bytes = Buffer.from(attachment.content, 'base64');
  if (provenanceMime(bytes) !== attachment.type) {
    throw invalid('Adjunta un PDF de hasta 5 MB o una imagen JPEG, PNG o WebP de hasta 2 MB.');
  }
  return bytes;
}

async function transaction(db, work) {
  const client = await db.connect();
  let discardClient;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { discardClient = rollbackError; }
    throw error;
  } finally {
    client.release(discardClient);
  }
}

async function requireActor(client, actorId, admin) {
  const { rows } = await client.query('SELECT status, verification_status, role FROM users WHERE id=$1 FOR SHARE', [actorId]);
  const user = requireCurrentUser(rows[0]);
  if (admin && user.role !== 'Administrador') throw failure(403, 'ARCO_FORBIDDEN', 'No tienes permiso para atender expedientes.');
}

const projection = `id, user_id, type, data_scope, description, status, resolution_notes,
  due_date::text AS due_date, retention_reason, created_at, updated_at, resolved_at, revision, submission_hash, identity_confirmed_at`;

function summary(row) {
  return {
    id: row.id, reference: `ARCO-${row.id.slice(0, 8).toUpperCase()}`, type: row.type, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at, dueDate: row.due_date, resolvedAt: row.resolved_at,
  };
}

async function details(client, row, admin) {
  const evidence = await client.query(`SELECT id, name, mime AS type, octet_length(bytes) AS size, revision
    FROM arco_evidence WHERE request_id=$1 ORDER BY revision`, [row.id]);
  const events = await client.query(`SELECT status, reason, retention_reason AS "retentionReason", due_date::text AS "dueDate", created_at AS "createdAt"
    FROM arco_request_events WHERE request_id=$1 ORDER BY revision`, [row.id]);
  const owner = admin ? (await client.query('SELECT id, email FROM users WHERE id=$1', [row.user_id])).rows[0] : null;
  return {
    ...summary(row), dataScope: row.data_scope, description: row.description, reason: row.resolution_notes,
    retentionReason: row.retention_reason, revision: row.revision, evidence: evidence.rows, history: events.rows,
    ...(owner ? { owner, identityConfirmedAt: row.identity_confirmed_at } : {}),
  };
}

async function findCase(client, id, actorId, admin, lock = false) {
  const { rows } = await client.query(`SELECT ${projection} FROM arco_requests
    WHERE id=$1 AND ($2::uuid IS NULL OR user_id=$2) ${lock ? 'FOR UPDATE' : 'FOR SHARE'}`, [id, admin ? null : actorId]);
  if (!rows.length) throw missing();
  return rows[0];
}

async function saveEvidence(client, row, attachment, bytes) {
  if (!bytes) return;
  await client.query('INSERT INTO arco_evidence(request_id,revision,name,mime,bytes) VALUES($1,$2,$3,$4,$5)',
    [row.id, row.revision, attachment.name, attachment.type, bytes]);
}

async function saveEvent(client, row, actorId, requestId, action, previous = null) {
  await client.query(`INSERT INTO arco_request_events(request_id,revision,actor_id,status,reason,retention_reason,due_date)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [row.id, row.revision, actorId, row.status, row.resolution_notes, row.retention_reason, row.due_date]);
  await appendAudit(client, { actorId, requestId, entityType: 'arco_request', entityId: row.id, action,
    oldValues: previous && { status: previous.status, revision: previous.revision, due_date: previous.due_date },
    newValues: { status: row.status, revision: row.revision, due_date: row.due_date, type: row.type, retention_documented: Boolean(row.retention_reason) },
  });
}

export async function createArcoRequest(db, actorId, requestId, input) {
  const data = validate(creation, input, 'Selecciona un derecho, identifica los datos y confirma la solicitud con tu identidad.');
  const bytes = evidenceBytes(data.attachment);
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return transaction(db, async client => {
    await requireActor(client, actorId, false);
    const { rows } = await client.query(`INSERT INTO arco_requests
      (user_id,type,data_scope,description,submission_id,submission_hash,identity_confirmed_at)
      VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()) ON CONFLICT (user_id,submission_id) DO NOTHING RETURNING ${projection}`,
    [actorId, data.type, data.dataScope, data.description, data.submissionId, hash]);
    if (!rows.length) {
      const existing = (await client.query(`SELECT ${projection} FROM arco_requests
        WHERE user_id=$1 AND submission_id=$2 FOR SHARE`, [actorId, data.submissionId])).rows[0];
      if (existing?.submission_hash !== hash) throw stale();
      return details(client, existing, false);
    }
    const row = rows[0];
    await saveEvidence(client, row, data.attachment, bytes);
    await saveEvent(client, row, actorId, requestId, 'arco.request.created');
    return details(client, row, false);
  });
}

export async function listArcoRequests(db, actorId, query, admin = false) {
  const { status, offset = 0 } = validate(filters, query, 'Selecciona filtros de expediente válidos.');
  return transaction(db, async client => {
    await requireActor(client, actorId, admin);
    const { rows } = await client.query(`SELECT id,type,status,created_at,updated_at,due_date::text AS due_date,resolved_at
      FROM arco_requests WHERE ($1::uuid IS NULL OR user_id=$1) AND ($2::arco_status IS NULL OR status=$2)
      ORDER BY created_at DESC, id LIMIT 21 OFFSET $3`, [admin ? null : actorId, status ?? null, offset]);
    return { items: rows.slice(0, 20).map(summary), nextOffset: rows.length > 20 ? offset + 20 : null };
  });
}

export async function readArcoRequest(db, actorId, requestId, id, admin = false) {
  validateId(id);
  return transaction(db, async client => {
    await requireActor(client, actorId, admin);
    const row = await findCase(client, id, actorId, admin);
    if (admin) await appendAudit(client, { actorId, requestId, entityType: 'arco_request', entityId: id, action: 'arco.request.viewed' });
    return details(client, row, admin);
  });
}

export async function correctArcoRequest(db, actorId, requestId, id, input) {
  validateId(id);
  const data = validate(correction, input, 'Identifica los datos y describe la corrección solicitada.');
  const bytes = evidenceBytes(data.attachment);
  return transaction(db, async client => {
    await requireActor(client, actorId, false);
    const old = await findCase(client, id, actorId, false, true);
    if (old.revision !== data.revision || old.status !== 'Pendiente de subsanación') throw stale();
    const { rows: [row] } = await client.query(`UPDATE arco_requests SET data_scope=$2, description=$3,
      status='En revisión', resolution_notes=NULL, revision=revision+1, updated_at=clock_timestamp()
      WHERE id=$1 RETURNING ${projection}`, [id, data.dataScope, data.description]);
    await saveEvidence(client, row, data.attachment, bytes);
    await saveEvent(client, row, actorId, requestId, 'arco.request.corrected', old);
    return details(client, row, false);
  });
}

export async function decideArcoRequest(db, actorId, requestId, id, input) {
  validateId(id);
  const data = validate(decision, input, 'Selecciona un estado e indica el motivo de la decisión.');
  return transaction(db, async client => {
    await requireActor(client, actorId, true);
    const old = await findCase(client, id, actorId, true, true);
    if (old.user_id === actorId) throw failure(403, 'ARCO_SELF_REVIEW', 'Otro administrador debe revisar tu solicitud.');
    if (old.revision !== data.revision || finalStatuses.includes(old.status)) throw stale();
    if (old.type === 'Cancelacion' && data.status === 'Parcialmente atendida' && !data.retentionReason) {
      throw invalid('Indica qué datos deben conservarse y el motivo de su conservación.');
    }
    const isFinal = finalStatuses.includes(data.status);
    const { rows: [row] } = await client.query(`UPDATE arco_requests SET status=$2, resolution_notes=$3,
      retention_reason=$4, due_date=COALESCE($5::date,due_date), admin_id=$6, revision=revision+1,
      resolved_at=CASE WHEN $7 THEN clock_timestamp() ELSE NULL END, updated_at=clock_timestamp()
      WHERE id=$1 RETURNING ${projection}`,
    [id, data.status, data.reason, data.retentionReason ?? null, data.dueDate ?? null, actorId, isFinal]);
    await saveEvent(client, row, actorId, requestId, 'arco.request.decided', old);
    return details(client, row, true);
  });
}

/** @param {{ fileId?: string, admin?: boolean }} [options] */
export async function downloadArcoFile(db, actorId, requestId, id, options = {}) {
  const { fileId, admin = false } = options;
  validateId(id);
  if (fileId !== undefined) validateId(fileId);
  return transaction(db, async client => {
    await requireActor(client, actorId, admin);
    const row = await findCase(client, id, actorId, admin);
    const file = fileId ? (await client.query('SELECT name,mime,bytes FROM arco_evidence WHERE request_id=$1 AND id=$2', [id, fileId])).rows[0]
      : finalStatuses.includes(row.status) && {
        name: `${summary(row).reference}-respuesta.txt`, mime: 'text/plain; charset=utf-8',
        bytes: Buffer.from([summary(row).reference, row.status, row.resolved_at?.toISOString(), row.resolution_notes,
          row.retention_reason && `Conservación de datos\n${row.retention_reason}`].filter(Boolean).join('\n\n'), 'utf8'),
      };
    if (!file) throw missing();
    await appendAudit(client, { actorId, requestId, entityType: 'arco_request', entityId: id,
      action: fileId ? 'arco.evidence.downloaded' : 'arco.response.downloaded',
      ...(fileId ? { metadata: { file_id: fileId } } : {}),
    });
    return file;
  });
}
