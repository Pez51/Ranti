import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { dateValue, evaluatePublicationRisk } from './risk.policy.js';
import { publicationImageReference } from './publication-photo.js';
import { provenanceReference,requireOwnedProvenance } from './provenance-files.js';

const error = (status, code, message) => new AppError({ status, code, message });
const invalid = () => error(400, 'INVALID_INPUT', 'Datos inválidos.');
const conflict = () => error(409, 'PUBLICATION_CONFLICT', 'El estado actual impide esta acción.');
const uuid = value => { if (!z.uuid().safeParse(value).success) throw invalid(); return value; };
const object = value => value && typeof value === 'object' && !Array.isArray(value);

async function transaction(db, work) {
  const client = await db.connect();
  let releaseError;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (failure) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; }
    throw failure;
  } finally { client.release(releaseError); }
}

async function administrator(client, id) {
  const user = requireCurrentUser((await client.query('SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE', [uuid(id)])).rows[0]);
  if (user.role !== 'Administrador') throw error(403, 'FORBIDDEN', 'Acceso denegado.');
}

export async function listPendingPublicationReviews(db, adminId, page = {}) {
  if (!object(page) || Object.keys(page).some(key => !['limit', 'offset'].includes(key))) throw invalid();
  const limit = page.limit === undefined ? 20 : Number(page.limit);
  const offset = page.offset === undefined ? 0 : Number(page.offset);
  if ((page.limit !== undefined && !/^\d+$/.test(String(page.limit))) ||
      (page.offset !== undefined && !/^\d+$/.test(String(page.offset))) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 100000) throw invalid();
  return transaction(db, async client => {
    await administrator(client, adminId);
    const { rows } = await client.query(`SELECT p.*, COALESCE((SELECT json_agg(image_url ORDER BY position)
      FROM publication_images WHERE publication_id=p.id), '[]'::json) AS images
      FROM publications p WHERE status='Pendiente de revisión'
      ORDER BY submitted_at, id LIMIT $1 OFFSET $2`, [limit, offset]);
    for (const row of rows) if (row.provenance_evidence_ref) await appendAudit(client, {
      actorId: adminId, action: 'publication.evidence.viewed', entityType: 'publication', entityId: row.id,
      metadata: { source: 'admin-publication-review-queue' },
    });
    return { items: rows, limit, offset };
  });
}

export async function decidePublicationReview(db, adminId, id, input) {
  uuid(id);
  if (!object(input) || Object.keys(input).some(key => !['decision', 'reason', 'submittedAt'].includes(key)) ||
      !['approve', 'reject'].includes(input.decision) || typeof input.reason !== 'string' ||
      !input.reason.trim() || input.reason.trim().length > 500 || typeof input.submittedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.submittedAt)) throw invalid();
  try { dateValue(input.submittedAt); } catch { throw invalid(); }
  return transaction(db, async client => {
    await administrator(client, adminId);
    const before = (await client.query('SELECT * FROM publications WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!before) throw error(404, 'PUBLICATION_NOT_FOUND', 'Publicación no encontrada.');
    if (before.submitted_at?.toISOString() !== input.submittedAt) throw conflict();
    const target = input.decision === 'approve' ? 'Activa' : 'Borrador';
    const reason = input.reason.trim();
    const publicDecision = row => Object.fromEntries(['id', 'status', 'submitted_at', 'reviewed_by',
      'review_reason', 'reviewed_at', 'published_at', 'risk_level', 'risk_policy_version'].map(key => [key, row[key]]));
    if (before.status !== 'Pendiente de revisión') {
      if (before.status === target && before.reviewed_at && before.reviewed_by === adminId && before.review_reason === reason)
        return publicDecision(before);
      throw conflict();
    }
    const operations = (await client.query('SELECT status FROM operations WHERE publication_id=$1 ORDER BY id FOR UPDATE', [id])).rows;
    if (operations.some(row => !['Pendiente', 'Cancelada', 'Cerrada', 'Rechazada', 'Expirada'].includes(row.status))) throw conflict();
    let risk;
    if (input.decision === 'approve') {
      const images = (await client.query('SELECT image_url FROM publication_images WHERE publication_id=$1 ORDER BY position', [id])).rows;
      if (['title', 'description', 'category', 'condition'].some(key => !before[key]?.trim()) ||
          !images.length || images.length > 7 || images.some(image => !publicationImageReference(image.image_url)))
        throw error(422, 'PUBLICATION_INVALID', 'Completa los requisitos de la publicación.');
      risk = evaluatePublicationRisk({ modality: before.modality, price: before.price,
        guaranteeAmount: before.guarantee_amount, availableFrom: before.available_from, availableUntil: before.available_until });
      if (risk.requiresProvenanceEvidence && !provenanceReference(before.provenance_evidence_ref))
        throw error(422, 'PUBLICATION_INVALID', 'La publicación requiere evidencia de procedencia.');
      await requireOwnedProvenance(client,before.provenance_evidence_ref,before.owner_id);
    }
    const updated = (await client.query(`UPDATE publications SET status=$2::publication_status, reviewed_by=$3, review_reason=$4,
      reviewed_at=clock_timestamp(), published_at=CASE WHEN $2::publication_status='Activa' THEN clock_timestamp() ELSE NULL END,
      risk_level=$5, risk_policy_version=$6, updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
    [id, target, adminId, reason, risk?.level ?? before.risk_level, risk?.policyVersion ?? before.risk_policy_version])).rows[0];
    const summary = row => ({ status: row.status, risk_level: row.risk_level, risk_policy_version: row.risk_policy_version });
    const action = `publication.review-${input.decision}`;
    await appendAudit(client, { actorId: adminId, action, entityType: 'publication', entityId: id,
      oldValues: summary(before), newValues: summary(updated) });
    await enqueueOutboxEvent(client, { aggregateType: 'publication', aggregateId: id, eventType: action,
      payload: { publicationId: id, ownerId: before.owner_id, ...summary(updated) },
      deduplicationKey: `${action}:${id}:${input.submittedAt}` });
    return publicDecision(updated);
  });
}
