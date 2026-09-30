import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { requireCurrentUser, validHttpsReference } from '../users/profile.service.js';
import { evaluatePublicationRisk, money, dateValue, modalities } from './risk.policy.js';

const fail = (status, code, message) => new AppError({ status, code, message });
const invalid = () => fail(400, 'INVALID_INPUT', 'Datos inválidos.');
const incomplete = () => fail(422, 'PUBLICATION_INVALID', 'Completa los requisitos de la publicación.');
const conflict = () => fail(409, 'PUBLICATION_CONFLICT', 'El estado actual impide esta acción.');
const missing = () => fail(404, 'PUBLICATION_NOT_FOUND', 'Publicación no encontrada.');
const uuid = value => { if (!z.uuid().safeParse(value).success) throw invalid(); return value; };
const textLimits = { title: 255, description: 5000, category: 100, condition: 50 };
const writable = [...Object.keys(textLimits), 'modality', 'price', 'guarantee_amount',
  'available_from', 'available_until', 'provenance_evidence_ref', 'images'];
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const unsetModality = 'draft-modality-unset';
const https = value => {
  if (!validHttpsReference(value) || /[\\\u0000-\u0020\u007f]/.test(value)) return false;
  const hostname = new URL(value).hostname;
  return hostname.length <= 253 && hostname.split('.').every(label => label.length <= 63);
};

function patchInput(input) {
  if (!object(input) || Object.keys(input).some(key => !writable.includes(key))) throw invalid();
  const patch = {};
  try {
    for (const [key, value] of Object.entries(input)) {
      if (Object.hasOwn(textLimits, key)) {
        if (typeof value !== 'string' || value.trim().length > textLimits[key]) throw invalid();
        patch[key] = value.trim();
      } else if (key === 'modality') {
        if (!modalities.includes(value)) throw invalid(); patch[key] = value;
      } else if (key === 'price' || key === 'guarantee_amount') patch[key] = value === null ? null : money(value).text;
      else if (key === 'available_from' || key === 'available_until') patch[key] = value === null ? null : dateValue(value);
      else if (key === 'provenance_evidence_ref') {
        if (value !== null && !https(value)) throw invalid(); patch[key] = value;
      } else if (key === 'images') {
        if (!Array.isArray(value) || value.length > 4 || value.some(url => !https(url))) throw invalid();
        patch[key] = value;
      }
    }
  } catch { throw invalid(); }
  return patch;
}

async function transaction(db, work) {
  let client, releaseError;
  try {
    client = await db.connect(); await client.query('BEGIN');
    const result = await work(client); await client.query('COMMIT'); return result;
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; } }
    if (error instanceof AppError) throw error;
    throw fail(500, 'INTERNAL_ERROR', 'Error interno del servidor.');
  } finally { client?.release(releaseError); }
}

async function actor(client, id, admin = false) {
  // Prevent role/status changes while allowing FK KEY SHARE checks by an
  // operation that already holds the publication row (avoids a lock cycle).
  const user = requireCurrentUser((await client.query('SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE', [uuid(id)])).rows[0]);
  if (admin && user.role !== 'Administrador') throw fail(403, 'FORBIDDEN', 'Acceso denegado.');
  return user;
}

async function locked(client, id, ownerId) {
  const row = (await client.query(`SELECT * FROM publications WHERE id=$1
    ${ownerId ? 'AND owner_id=$2' : ''} FOR UPDATE`, ownerId ? [uuid(id), ownerId] : [uuid(id)])).rows[0];
  if (!row) throw missing();
  row.images = (await client.query('SELECT image_url FROM publication_images WHERE publication_id=$1 ORDER BY is_primary DESC, created_at, id', [id])).rows.map(p => p.image_url);
  return row;
}

async function unblocked(client, id) {
  // Lock ALL operations: after waiting on a pending operation's transition,
  // PostgreSQL returns its committed state. Assess it while holding both locks.
  const { rows } = await client.query('SELECT id, status FROM operations WHERE publication_id=$1 ORDER BY id FOR UPDATE', [id]);
  if (rows.some(row => !['Pendiente', 'Cancelada', 'Cerrada'].includes(row.status))) throw conflict();
}

function risk(row) {
  return evaluatePublicationRisk({ modality: row.modality, price: row.price, guaranteeAmount: row.guarantee_amount,
    availableFrom: row.available_from, availableUntil: row.available_until });
}
function validateReady(row) {
  if (row.risk_policy_version === unsetModality || Object.keys(textLimits).some(key => !row[key]?.trim()) ||
      !row.images.length || row.images.length > 4 || row.images.some(url => !https(url))) throw incomplete();
  const result = risk(row);
  if (result.requiresProvenanceEvidence && !https(row.provenance_evidence_ref)) throw incomplete();
  return result;
}
function validateWindow(row) {
  if ((row.available_from == null) !== (row.available_until == null) ||
      (row.available_from && row.available_from >= row.available_until)) throw invalid();
}
async function images(client, id, urls) {
  await client.query('DELETE FROM publication_images WHERE publication_id=$1', [id]);
  for (let i = 0; i < urls.length; i++) await client.query(
    'INSERT INTO publication_images (publication_id,image_url,is_primary) VALUES ($1,$2,$3)', [id, urls[i], i === 0]);
}
async function effects(client, actorId, action, before, after) {
  // Allowlist: neither evidence nor free text (including review reason) enters
  // audit/outbox. Each state change has one event; no-op retries write none.
  const summary = row => ({ status: row.status, risk_level: row.risk_level, risk_policy_version: row.risk_policy_version });
  await appendAudit(client, { actorId, action: `publication.${action}`, entityType: 'publication', entityId: after.id,
    oldValues: before ? summary(before) : null, newValues: summary(after) });
  await enqueueOutboxEvent(client, { aggregateType: 'publication', aggregateId: after.id, eventType: `publication.${action}`,
    payload: { publicationId: after.id, ownerId: after.owner_id, ...summary(after) },
    deduplicationKey: `publication.${action}:${after.id}:${randomUUID()}` });
}

async function persist(client, row) {
  const keys = [...writable.filter(key => key !== 'images'), 'status', 'risk_level', 'risk_policy_version',
    'submitted_at', 'reviewed_by', 'review_reason', 'reviewed_at', 'published_at'];
  const updated = (await client.query(`UPDATE publications SET ${keys.map((key, i) => `${key}=$${i + 2}`).join(',')},
    updated_at=clock_timestamp() WHERE id=$1 RETURNING *`, [row.id, ...keys.map(key => row[key] ?? null)])).rows[0];
  return { ...updated, images: row.images };
}
async function stage(client, row) {
  const result = validateReady(row);
  row.risk_level = result.level; row.risk_policy_version = result.policyVersion;
  row.status = result.requiresAdminReview ? 'Pendiente de revisión' : 'Activa';
  // Millisecond precision round-trips exactly through JSON/pg Date, increasing
  // even when rapid resubmission occurs in the same millisecond.
  row.submitted_at = (await client.query(`SELECT GREATEST(date_trunc('milliseconds', clock_timestamp()),
    COALESCE($1::timestamptz + interval '1 millisecond', '-infinity'::timestamptz)) AS stamp`, [row.submitted_at])).rows[0].stamp;
  row.reviewed_by = null; row.reviewed_at = null; row.review_reason = null;
  row.published_at = row.status === 'Activa' ? row.submitted_at : null;
}

export async function createPublication(db, ownerId, input) {
  const patch = patchInput(input);
  const draft = { title: '', description: '', category: '', condition: '', modality: 'Venta',
    price: null, guarantee_amount: null, available_from: null, available_until: null,
    provenance_evidence_ref: null, images: [], ...patch };
  validateWindow(draft);
  return transaction(db, async client => {
    await actor(client, ownerId);
    // Old NOT NULL fields use draft sentinels. Preserve an explicit marker for
    // missing modality so legacy null-policy records remain revalidatable.
    const version = patch.modality ? 'pilot-v1' : unsetModality;
    let level = null; if (patch.modality) { try { level = risk(draft).level; } catch { /* incomplete draft */ } }
    const created = (await client.query(`INSERT INTO publications
      (owner_id, title, description, category, condition, modality, price, guarantee_amount,
       available_from, available_until, provenance_evidence_ref, status, risk_policy_version, risk_level)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Borrador',$12,$13) RETURNING *`,
    [ownerId, draft.title, draft.description, draft.category, draft.condition, draft.modality, draft.price,
      draft.guarantee_amount, draft.available_from, draft.available_until, draft.provenance_evidence_ref, version, level])).rows[0];
    await images(client, created.id, draft.images);
    await effects(client, ownerId, 'created', null, created);
    return { ...created, images: draft.images };
  });
}

export async function updatePublication(db, ownerId, id, input) {
  const patch = patchInput(input); if (!Object.keys(patch).length) throw invalid();
  return transaction(db, async client => {
    await actor(client, ownerId); const before = await locked(client, id, ownerId);
    if (!['Borrador', 'Pausada', 'Activa'].includes(before.status)) throw conflict();
    await unblocked(client, id);
    const row = { ...before, ...patch }; validateWindow(row);
    if (!(patch.modality && before.risk_policy_version === unsetModality) &&
        JSON.stringify(Object.fromEntries(Object.keys(patch).map(key => [key, before[key]]))) === JSON.stringify(patch)) return before;
    if (patch.modality) row.risk_policy_version = 'pilot-v1';
    row.reviewed_by = null; row.reviewed_at = null; row.review_reason = null;
    if (before.status === 'Activa') await stage(client, row);
    else if (before.status === 'Pausada') {
      const result = validateReady(row); row.risk_level = result.level; row.risk_policy_version = result.policyVersion;
    } else if (row.risk_policy_version !== unsetModality) { try { row.risk_level = risk(row).level; } catch { row.risk_level = null; } }
    if (Object.hasOwn(patch, 'images')) await images(client, id, row.images);
    const updated = await persist(client, row); await effects(client, ownerId, 'updated', before, updated); return updated;
  });
}

async function lifecycle(db, ownerId, id, action) {
  return transaction(db, async client => {
    await actor(client, ownerId); const before = await locked(client, id, ownerId);
    if (before.status === 'Retirada') { if (action === 'withdraw') return before; throw conflict(); }
    await unblocked(client, id);
    const row = { ...before };
    if (action === 'submit') {
      if (['Activa', 'Pendiente de revisión'].includes(row.status)) return row;
      if (row.status !== 'Borrador') throw conflict(); await stage(client, row);
    } else if (action === 'reactivate') {
      if (['Activa', 'Pendiente de revisión'].includes(row.status)) return row;
      if (row.status !== 'Pausada') throw conflict(); await stage(client, row);
    } else if (action === 'pause') {
      if (row.status === 'Pausada') return row;
      if (row.status !== 'Activa') throw conflict(); row.status = 'Pausada';
    } else row.status = 'Retirada';
    const changed = await persist(client, row); await effects(client, ownerId, action, before, changed); return changed;
  });
}
export const submitPublication = (db, ownerId, id) => lifecycle(db, ownerId, id, 'submit');
export const pausePublication = (db, ownerId, id) => lifecycle(db, ownerId, id, 'pause');
export const reactivatePublication = (db, ownerId, id) => lifecycle(db, ownerId, id, 'reactivate');
export const withdrawPublication = (db, ownerId, id) => lifecycle(db, ownerId, id, 'withdraw');

export async function listOwnPublications(db, ownerId) {
  requireCurrentUser((await db.query('SELECT * FROM users WHERE id=$1', [uuid(ownerId)])).rows[0]);
  return (await db.query(`SELECT p.*, COALESCE((SELECT json_agg(image_url ORDER BY is_primary DESC, created_at, id)
    FROM publication_images WHERE publication_id=p.id),'[]'::json) AS images
    FROM publications p WHERE owner_id=$1 ORDER BY created_at DESC, id DESC`, [ownerId])).rows;
}

export async function listPendingPublicationReviews(db, adminId, page = {}) {
  if (!object(page) || Object.keys(page).some(key => !['limit', 'offset'].includes(key))) throw invalid();
  const limit = page.limit === undefined ? 20 : Number(page.limit); const offset = page.offset === undefined ? 0 : Number(page.offset);
  if ((page.limit !== undefined && !/^\d+$/.test(String(page.limit))) || (page.offset !== undefined && !/^\d+$/.test(String(page.offset))) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw invalid();
  return transaction(db, async client => {
    await actor(client, adminId, true);
    const { rows } = await client.query(`SELECT p.*, COALESCE((SELECT json_agg(image_url ORDER BY is_primary DESC, created_at, id)
      FROM publication_images WHERE publication_id=p.id),'[]'::json) AS images
      FROM publications p WHERE status='Pendiente de revisión' ORDER BY submitted_at, id LIMIT $1 OFFSET $2`, [limit, offset]);
    return { items: rows, limit, offset };
  });
}

export async function decidePublicationReview(db, adminId, id, input) {
  if (!object(input) || Object.keys(input).some(key => !['decision', 'reason', 'submittedAt'].includes(key)) ||
      !['approve', 'reject'].includes(input.decision) || typeof input.reason !== 'string' || !input.reason.trim() ||
      input.reason.trim().length > 500 || typeof input.submittedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.submittedAt)) throw invalid();
  try { dateValue(input.submittedAt); } catch { throw invalid(); }
  return transaction(db, async client => {
    await actor(client, adminId, true); const before = await locked(client, id);
    if (before.submitted_at?.toISOString() !== input.submittedAt) throw conflict();
    const target = input.decision === 'approve' ? 'Activa' : 'Borrador';
    if (before.status !== 'Pendiente de revisión') {
      if (before.reviewed_at && before.status === target && before.reviewed_by === adminId && before.review_reason === input.reason.trim()) return before;
      throw conflict();
    }
    await unblocked(client, id); const row = { ...before };
    if (input.decision === 'approve') {
      const result = validateReady(row); row.risk_level = result.level; row.risk_policy_version = result.policyVersion;
      row.published_at = new Date();
    }
    row.status = target; row.reviewed_by = adminId; row.review_reason = input.reason.trim(); row.reviewed_at = new Date();
    const changed = await persist(client, row); await effects(client, adminId, `review-${input.decision}`, before, changed); return changed;
  });
}

export async function listPublications(db, input = {}) {
  const allowed = ['search', 'category', 'faculty', 'modality', 'condition', 'minPrice', 'maxPrice', 'availableFrom', 'availableUntil'];
  if (Object.keys(input).some(key => !allowed.includes(key)) || Object.values(input).some(v => typeof v !== 'string')) throw invalid();
  const clauses = ["p.status = 'Activa'"]; const params = [];
  const add = (sql, value) => { params.push(value); clauses.push(sql.replace('?', `$${params.length}`)); };
  try {
    for (const key of ['search', 'category', 'faculty', 'condition']) if (input[key] !== undefined) {
      if (!input[key].trim() || input[key].length > (key === 'search' ? 255 : key === 'condition' ? 50 : 100)) throw invalid();
    }
    if (input.category && input.faculty && input.category !== input.faculty) throw invalid();
    if (input.search) add('p.title ILIKE ?', `%${input.search.replace(/[\\%_]/g, '\\$&')}%`);
    if (input.category || input.faculty) add('p.category = ?', input.category || input.faculty);
    if (input.condition) add('p.condition = ?', input.condition);
    if (input.modality !== undefined) { if (!modalities.includes(input.modality)) throw invalid(); add('p.modality = ?', input.modality); }
    const min = input.minPrice === undefined ? null : money(input.minPrice); const max = input.maxPrice === undefined ? null : money(input.maxPrice);
    if (min && max && min.cents > max.cents) throw invalid();
    if (min) add('COALESCE(p.price,0) >= ?', min.text); if (max) add('COALESCE(p.price,0) <= ?', max.text);
    const from = input.availableFrom === undefined ? null : dateValue(input.availableFrom);
    const until = input.availableUntil === undefined ? null : dateValue(input.availableUntil);
    if (from && until && from >= until) throw invalid();
    if (from || until) clauses.push("p.modality IN ('Alquiler','Préstamo')");
    if (from) { add('p.available_from <= ?', from); add('p.available_until > ?', from); }
    if (until) { add('p.available_until >= ?', until); add('p.available_from < ?', until); }
  } catch { throw invalid(); }
  return (await db.query(`SELECT p.id, p.title, p.category, p.condition, p.modality, p.price, p.guarantee_amount,
    p.available_from, p.available_until, pi.image_url AS primary_image FROM publications p
    LEFT JOIN publication_images pi ON pi.publication_id=p.id AND pi.is_primary=true
    WHERE ${clauses.join(' AND ')} ORDER BY p.created_at DESC, p.id DESC`, params)).rows;
}

export async function getPublicPublication(db, id) {
  const row = (await db.query(`SELECT p.id, p.title, p.description, p.category, p.condition, p.modality,
    p.price, p.guarantee_amount, p.available_from, p.available_until, p.created_at,
    u.reputation_score AS owner_reputation_score,
    COALESCE((SELECT json_agg(json_build_object('image_url', image_url, 'is_primary', is_primary)
      ORDER BY is_primary DESC, created_at, id) FROM publication_images WHERE publication_id=p.id),'[]'::json) AS images
    FROM publications p JOIN users u ON u.id=p.owner_id WHERE p.id=$1 AND p.status = 'Activa'`, [uuid(id)])).rows[0];
  if (!row) throw missing(); return row;
}
