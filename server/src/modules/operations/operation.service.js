import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { parseOperationRequest, publicOperation, validateRequestedTerms } from './operation.policy.js';
import { env } from '../../config/env.js';

const fail = (status, code, message) => new AppError({ status, code, message });
const invalid = () => fail(400, 'INVALID_INPUT', 'Datos inválidos.');
const missing = () => fail(404, 'OPERATION_NOT_FOUND', 'Operación no encontrada.');
const publicationMissing = () => fail(404, 'PUBLICATION_NOT_FOUND', 'Publicación no encontrada.');
const unavailable = () => fail(409, 'PUBLICATION_UNAVAILABLE', 'La publicación no está disponible.');
const uuid = value => { if (!z.uuid().safeParse(value).success) throw invalid(); return value; };

async function transaction(db, work) {
  let client, releaseError;
  try {
    client = await db.connect(); await client.query('BEGIN');
    const result = await work(client); await client.query('COMMIT'); return result;
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; } }
    if (error instanceof AppError) throw error;
    const internal = fail(500, 'INTERNAL_ERROR', 'Error interno del servidor.');
    internal.cause = error;
    throw internal;
  } finally { client?.release(releaseError); }
}

const projection = `SELECT o.*, json_build_object('id',p.id,'title',p.title,
  'primary_image',(SELECT image_url FROM publication_images WHERE publication_id=p.id AND is_primary=true
    ORDER BY position LIMIT 1),'contract_version',p.contract_version) AS publication,
  json_build_object('id',owner.id,'display_name',owner.display_name,
    'reputation_score',owner.reputation_score,'operations_count',owner.operations_count) AS owner,
  json_build_object('id',requester.id,'display_name',requester.display_name,
    'reputation_score',requester.reputation_score,'operations_count',requester.operations_count) AS requester
  FROM operations o JOIN publications p ON p.id=o.publication_id
  JOIN users owner ON owner.id=o.oferente_id JOIN users requester ON requester.id=o.demandante_id`;

function projected(row, actorId) {
  // PostgreSQL bigint is returned as text; contract versions fit our safe input range.
  row.requested_contract_version = Number(row.requested_contract_version);
  row.publication.contract_version = Number(row.publication.contract_version);
  return publicOperation(row, actorId);
}

async function currentActor(db, actorId) {
  const row = (await db.query('SELECT id,status,verification_status FROM users WHERE id=$1', [uuid(actorId)])).rows[0];
  return requireCurrentUser(row);
}

export async function requestOperation(db, actorId, input) {
  uuid(actorId);
  const request = parseOperationRequest(input);
  // This read only discovers the current owner. Recheck after acquiring locks.
  const discovered = (await db.query('SELECT owner_id FROM publications WHERE id=$1', [request.publication_id])).rows[0];
  if (!discovered) throw publicationMissing();
  return transaction(db, async client => {
    const users = [actorId, discovered.owner_id].sort();
    for (const id of users) {
      const row = (await client.query('SELECT id,status,verification_status FROM users WHERE id=$1 FOR NO KEY UPDATE', [id])).rows[0];
      requireCurrentUser(row);
    }
    const publication = (await client.query('SELECT * FROM publications WHERE id=$1 FOR UPDATE', [request.publication_id])).rows[0];
    if (!publication) throw publicationMissing();
    if (publication.owner_id !== discovered.owner_id) throw unavailable();
    if (publication.owner_id === actorId) throw invalid();
    if (publication.status !== 'Activa') throw unavailable();
    const now = new Date();
    validateRequestedTerms(publication, { ...request, requester_id: actorId }, now);
    const created = (await client.query(`INSERT INTO operations
      (publication_id,demandante_id,oferente_id,modality,status,start_date,end_date,
       contract_snapshot,otp_code,requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at)
      VALUES ($1,$2,$3,$4,'Pendiente',$5,$6,NULL,NULL,$7,$8,$9,
        clock_timestamp()+make_interval(hours => $10::int)) RETURNING id`,
    [publication.id, actorId, publication.owner_id, publication.modality,
      request.start_date ?? null, request.end_date ?? null, request.requested_price,
      request.requested_guarantee_amount, request.requested_contract_version, env.OPERATION_REQUEST_TTL_HOURS])).rows[0];
    const summary = { status: 'Pendiente', publication_id: publication.id, requester_id: actorId,
      owner_id: publication.owner_id, contract_version: request.requested_contract_version };
    await appendAudit(client, { actorId, action: 'operation.requested', entityType: 'operation', entityId: created.id,
      newValues: summary });
    await enqueueOutboxEvent(client, { aggregateType: 'operation', aggregateId: created.id,
      eventType: 'operation.requested', payload: { operationId: created.id, ...summary },
      deduplicationKey: `operation.requested:${created.id}` });
    const row = (await client.query(`${projection} WHERE o.id=$1`, [created.id])).rows[0];
    return projected(row, actorId);
  });
}

function pageFilters(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['side', 'status', 'limit', 'offset'].includes(key))) throw invalid();
  const side = input.side ?? 'requested';
  if (!['requested', 'received'].includes(side)) throw invalid();
  const statuses = ['Pendiente', 'Aceptada', 'Rechazada', 'Expirada', 'Cancelada',
    'Cancelación en reversión', 'Pendiente de pago/garantía', 'Lista para entrega',
    'Entregada/Activa', 'En cierre', 'Pendiente de resolución económica', 'Cerrada', 'En incidencia'];
  if (input.status !== undefined && !statuses.includes(input.status)) throw invalid();
  const integer = (value, fallback, min, max) => {
    if (value === undefined) return fallback;
    if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) return value;
    if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) {
      const parsed = Number(value); if (parsed >= min && parsed <= max) return parsed;
    }
    throw invalid();
  };
  return { side, status: input.status, limit: integer(input.limit, 20, 1, 100),
    offset: integer(input.offset, 0, 0, 10000) };
}

export async function listParticipantOperations(db, actorId, filters = {}) {
  const { side, status, limit, offset } = pageFilters(filters);
  await currentActor(db, actorId);
  const participant = side === 'requested' ? 'o.demandante_id' : 'o.oferente_id';
  const rows = (await db.query(`${projection} WHERE ${participant}=$1
    AND ($2::operation_status IS NULL OR o.status=$2::operation_status)
    ORDER BY o.updated_at DESC,o.id DESC LIMIT $3 OFFSET $4`,
  [actorId, status ?? null, limit, offset])).rows;
  return { items: rows.map(row => projected(row, actorId)), limit, offset };
}

export async function getParticipantOperation(db, actorId, operationId) {
  uuid(operationId); await currentActor(db, actorId);
  const row = (await db.query(`${projection} WHERE o.id=$1 AND (o.demandante_id=$2 OR o.oferente_id=$2)`,
    [operationId, actorId])).rows[0];
  if (!row) throw missing();
  return projected(row, actorId);
}
