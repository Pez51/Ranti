import { AppError } from '../../shared/errors/app-error.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { requireCurrentUser, validHttpsReference } from './profile.service.js';

const invalid = () => new AppError({ status: 400, code: 'INVALID_INPUT', message: 'Datos inválidos.' });
const forbidden = () => new AppError({ status: 403, code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' });
const conflict = () => new AppError({ status: 409, code: 'ROLE_REQUEST_CONFLICT', message: 'La solicitud ya tiene otra decisión.' });
const unavailable = () => new AppError({ status: 500, code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' });
const uuid = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const metadataLimits = Object.freeze({ documentType: 100, institution: 200, academicPeriod: 100, note: 500 });

function metadata(input) {
  const value = input === undefined ? {} : input;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid();
  const parsed = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !Object.hasOwn(metadataLimits, key)) throw invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') throw invalid();
    const text = descriptor.value.trim();
    if (!text || text.length > metadataLimits[key]) throw invalid();
    parsed[key] = text;
  }
  if (Buffer.byteLength(JSON.stringify(parsed), 'utf8') > 4096) throw invalid();
  return parsed;
}

async function transaction(db, work) {
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* preserve safe primary error */ } }
    if (error instanceof AppError) throw error;
    if (error?.code === '23505') throw new AppError({ status: 409, code: 'ROLE_REQUEST_PENDING', message: 'Ya tienes una solicitud pendiente.' });
    throw unavailable();
  } finally { client?.release(); }
}

function publicRequest(row) {
  return { id: row.id, user_id: row.user_id, requested_role: row.requested_role,
    status: row.status, evidence_ref: row.evidence_ref, evidence_metadata: row.evidence_metadata,
    reviewed_by: row.reviewed_by, review_reason: row.review_reason, reviewed_at: row.reviewed_at,
    created_at: row.created_at };
}

export async function requestStudentRole(db, input) {
  if (!input || !uuid(input.userId) || !validHttpsReference(input.evidence_ref) ||
      Object.keys(input).some(key => !['userId', 'evidence_ref', 'evidence_metadata'].includes(key))) throw invalid();
  const evidenceMetadata = metadata(input.evidence_metadata);
  return transaction(db, async client => {
    const user = requireCurrentUser((await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [input.userId])).rows[0]);
    if (user.role !== 'Egresado') throw forbidden();
    const { rows } = await client.query(`INSERT INTO role_requests
      (user_id, requested_role, evidence_ref, evidence_metadata) VALUES ($1, 'Estudiante', $2, $3)
      RETURNING *`, [input.userId, input.evidence_ref, evidenceMetadata]);
    return publicRequest(rows[0]);
  });
}

export async function listOwnRoleRequests(db, userId) {
  const user = (await db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  requireCurrentUser(user);
  const { rows } = await db.query(`SELECT * FROM role_requests WHERE user_id = $1
    ORDER BY created_at DESC, id DESC`, [userId]);
  return rows.map(publicRequest);
}

export async function listPendingRoleRequests(db, page) {
  if (!page || !uuid(page.adminId) || Object.keys(page).some(key => !['adminId', 'limit', 'offset'].includes(key)) ||
      (page.limit !== undefined && (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100)) ||
      (page.offset !== undefined && (!Number.isInteger(page.offset) || page.offset < 0 || page.offset > 100000))) throw invalid();
  const limit = page.limit ?? 20; const offset = page.offset ?? 0;
  return transaction(db, async client => {
    const admin = (await client.query('SELECT * FROM users WHERE id = $1', [page.adminId])).rows[0];
    requireCurrentUser(admin);
    if (admin.role !== 'Administrador') throw forbidden();
    const { rows } = await client.query(`SELECT rr.*, u.email, u.display_name FROM role_requests rr
      JOIN users u ON u.id = rr.user_id WHERE rr.status = 'pending'
      ORDER BY rr.created_at ASC, rr.id ASC LIMIT $1 OFFSET $2`, [limit, offset]);
    for (const row of rows) await appendAudit(client, { actorId: page.adminId,
      action: 'identity.role-request.evidence-read', entityType: 'role_request', entityId: row.id,
      metadata: { userId: row.user_id } });
    return { items: rows.map(row => ({ ...publicRequest(row),
      user: { id: row.user_id, email: row.email, display_name: row.display_name } })), limit, offset };
  });
}

export async function decideStudentRole(db, input) {
  if (!input || !uuid(input.adminId) || !uuid(input.requestId) ||
      !['approve', 'reject'].includes(input.decision) || typeof input.reason !== 'string' ||
      !input.reason.trim() || input.reason.trim().length > 500 ||
      Object.keys(input).some(key => !['adminId', 'requestId', 'decision', 'reason'].includes(key))) throw invalid();
  return transaction(db, async client => {
    const candidate = (await client.query('SELECT user_id FROM role_requests WHERE id = $1', [input.requestId])).rows[0];
    if (!candidate) throw new AppError({ status: 404, code: 'ROLE_REQUEST_NOT_FOUND', message: 'Solicitud no encontrada.' });
    // Acquire every user lock in the same UUID order across concurrent decisions.
    const lockedUsers = new Map();
    for (const id of [...new Set([input.adminId, candidate.user_id])].sort()) {
      lockedUsers.set(id, (await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0]);
    }
    const admin = requireCurrentUser(lockedUsers.get(input.adminId));
    if (admin.role !== 'Administrador') throw forbidden();
    const user = lockedUsers.get(candidate.user_id);
    const row = (await client.query('SELECT * FROM role_requests WHERE id = $1 FOR UPDATE', [input.requestId])).rows[0];
    if (!row || row.user_id !== candidate.user_id) throw conflict();
    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    if (row.status !== 'pending') {
      if (row.status !== status) throw conflict();
      return publicRequest(row);
    }
    requireCurrentUser(user);
    if (user.role !== 'Egresado') throw forbidden();
    const decided = (await client.query(`UPDATE role_requests SET status = $2, reviewed_by = $3,
      review_reason = $4, reviewed_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE id = $1 RETURNING *`, [input.requestId, status, input.adminId, input.reason.trim()])).rows[0];
    if (status === 'approved') await client.query("UPDATE users SET role = 'Estudiante', updated_at = clock_timestamp() WHERE id = $1", [user.id]);
    await appendAudit(client, { actorId: input.adminId, action: 'identity.role-request.decided',
      entityType: 'role_request', entityId: row.id,
      oldValues: { status: 'pending', role: user.role },
      newValues: { status, role: status === 'approved' ? 'Estudiante' : user.role } });
    await enqueueOutboxEvent(client, { aggregateType: 'role_request', aggregateId: row.id,
      eventType: 'identity.role-request.decided',
      payload: { requestId: row.id, userId: row.user_id, reviewerId: input.adminId, outcome: status },
      deduplicationKey: `identity.role-request.decided:${row.id}` });
    return publicRequest(decided);
  });
}
