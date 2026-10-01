import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { authorizeTransition, buildContractSnapshot, parseDecision, parseOperationRequest,
  publicOperation, validateRequestedTerms } from './operation.policy.js';
import { env } from '../../config/env.js';

const fail = (status, code, message) => new AppError({ status, code, message });
const invalid = () => fail(400, 'INVALID_INPUT', 'Datos inválidos.');
const missing = () => fail(404, 'OPERATION_NOT_FOUND', 'Operación no encontrada.');
const publicationMissing = () => fail(404, 'PUBLICATION_NOT_FOUND', 'Publicación no encontrada.');
const unavailable = () => fail(409, 'PUBLICATION_UNAVAILABLE', 'La publicación no está disponible.');
const conflict = () => fail(409, 'OPERATION_CONFLICT', 'El estado actual impide esta acción.');
const forbidden = () => fail(403, 'FORBIDDEN', 'Acceso denegado.');
const uuid = value => { if (!z.uuid().safeParse(value).success) throw invalid(); return value; };

function reservationConstraint(error) {
  return (error?.code === '23505' && ['reservations_one_live_sale_per_publication', 'reservations_operation_key']
    .includes(error.constraint)) || (error?.code === '23P01' && error.constraint === 'reservations_live_interval_exclusion');
}

async function transaction(db, work) {
  let client, releaseError;
  try {
    client = await db.connect(); await client.query('BEGIN');
    const result = await work(client); await client.query('COMMIT'); return result;
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; } }
    if (error instanceof AppError) throw error;
    if (reservationConstraint(error)) throw conflict();
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

async function transitionRule(client, from, to, actorKind, precondition) {
  const row = (await client.query(`SELECT from_status,to_status,actor_kind,precondition_key,effect_key
    FROM operation_transition_rules WHERE from_status=$1 AND to_status=$2
      AND actor_kind=$3 AND precondition_key=$4`, [from, to, actorKind, precondition])).rows[0];
  if (!row) throw conflict();
  return row;
}

async function decisionEffects(client, operation, previousStatus, status, actorId, reasonCode) {
  const eventType = status === 'Aceptada' ? 'operation.accepted' :
    status === 'Expirada' ? 'operation.expired' : 'operation.rejected';
  const summary = { status, publication_id: operation.publication_id,
    requester_id: operation.demandante_id, owner_id: operation.oferente_id,
    ...(reasonCode ? { reason_code: reasonCode } : {}) };
  await appendAudit(client, { actorId, action: eventType, entityType: 'operation', entityId: operation.id,
    oldValues: { status: previousStatus }, newValues: summary });
  await enqueueOutboxEvent(client, { aggregateType: 'operation', aggregateId: operation.id,
    eventType, payload: { operationId: operation.id, ...summary },
    deduplicationKey: `${eventType}:${operation.id}` });
}

function hasReservationConflict(reservations, operation) {
  const live = reservations.filter(row => ['Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso'].includes(row.status));
  if (operation.modality === 'Venta') return live.some(row => row.start_date === null);
  const start = new Date(operation.start_date).getTime();
  const end = new Date(operation.end_date).getTime();
  return live.some(row => row.start_date !== null && start < new Date(row.end_date).getTime() &&
    new Date(row.start_date).getTime() < end);
}

function changedContract(publication, operation) {
  return Number(publication.contract_version) !== Number(operation.requested_contract_version) ||
    publication.modality !== operation.modality ||
    Number(publication.price) !== Number(operation.requested_price) ||
    Number(publication.guarantee_amount) !== Number(operation.requested_guarantee_amount);
}

export async function decideOperation(db, ownerId, operationId, input) {
  uuid(ownerId); uuid(operationId);
  const { decision, reason } = parseDecision(input);
  // Discovery selects lock targets only. All relationships are verified after locking.
  const discovered = (await db.query(`SELECT o.publication_id,o.demandante_id,o.oferente_id,p.owner_id
    FROM operations o JOIN publications p ON p.id=o.publication_id WHERE o.id=$1`, [operationId])).rows[0];
  if (!discovered) throw missing();
  const outcome = await transaction(db, async client => {
    for (const id of [...new Set([ownerId, discovered.demandante_id, discovered.oferente_id,
      discovered.owner_id])].sort()) {
      const user = (await client.query('SELECT id,status,verification_status FROM users WHERE id=$1 FOR NO KEY UPDATE', [id])).rows[0];
      // The current owner and requester must remain eligible throughout acceptance.
      if (id === ownerId || id === discovered.demandante_id || id === discovered.owner_id) requireCurrentUser(user);
    }
    const publication = (await client.query('SELECT * FROM publications WHERE id=$1 FOR UPDATE',
      [discovered.publication_id])).rows[0];
    if (!publication) throw missing();
    const operations = (await client.query('SELECT * FROM operations WHERE publication_id=$1 ORDER BY id FOR UPDATE',
      [discovered.publication_id])).rows;
    const operation = operations.find(row => row.id === operationId);
    if (!operation || operation.publication_id !== discovered.publication_id ||
      operation.demandante_id !== discovered.demandante_id ||
      operation.oferente_id !== discovered.oferente_id || publication.owner_id !== discovered.owner_id) throw conflict();
    if (ownerId !== publication.owner_id || ownerId !== operation.oferente_id) throw forbidden();
    const reservations = (await client.query('SELECT * FROM reservations WHERE publication_id=$1 ORDER BY id FOR UPDATE',
      [publication.id])).rows;
    if (operation.status === (decision === 'accept' ? 'Aceptada' : 'Rechazada')) {
      const row = (await client.query(`${projection} WHERE o.id=$1`, [operationId])).rows[0];
      return { operation: projected(row, ownerId) };
    }
    if (operation.status !== 'Pendiente') throw conflict();
    const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    let status, decidedBy, decisionReason, acceptedAt = null, responseConflict = false;
    let precondition;
    if (now >= operation.request_expires_at) {
      status = 'Expirada'; decidedBy = null; decisionReason = 'request_expired';
      precondition = 'expired_request'; responseConflict = true;
    } else if (decision === 'accept' && (publication.status !== 'Activa' || changedContract(publication, operation))) {
      status = 'Rechazada'; decidedBy = ownerId;
      decisionReason = publication.status !== 'Activa' ? 'publication_unavailable' : 'contract_changed';
      precondition = 'publication_invalidated'; responseConflict = true;
    } else if (decision === 'reject') {
      status = 'Rechazada'; decidedBy = ownerId; decisionReason = reason;
      precondition = 'pending_request';
    } else {
      status = 'Aceptada'; decidedBy = ownerId; decisionReason = null; acceptedAt = now;
      precondition = 'request_available';
    }
    const rule = await transitionRule(client, 'Pendiente', status,
      status === 'Expirada' ? 'system' : 'owner', precondition);
    const reservationConflict = hasReservationConflict(reservations, operation);
    authorizeTransition(rule, { operation, publication,
      actorId: status === 'Expirada' ? null : ownerId, now, reservationConflict });
    const snapshot = status === 'Aceptada' ? buildContractSnapshot({ ...publication,
      contract_version: Number(publication.contract_version) }, operation, now) : null;
    await client.query(`UPDATE operations SET status=$2,decided_at=$3,decided_by=$4,decision_reason=$5,
      accepted_at=$6,contract_snapshot=$7,updated_at=$3 WHERE id=$1`,
    [operationId, status, now, decidedBy, decisionReason, acceptedAt, snapshot]);
    if (status === 'Aceptada') await client.query(`INSERT INTO reservations
      (publication_id,operation_id,start_date,end_date,status) VALUES ($1,$2,$3,$4,'Reservada/Bloqueada')`,
    [publication.id, operationId, operation.start_date, operation.end_date]);
    await decisionEffects(client, operation, 'Pendiente', status, decidedBy,
      precondition === 'expired_request' || precondition === 'publication_invalidated' ? decisionReason : null);
    const row = (await client.query(`${projection} WHERE o.id=$1`, [operationId])).rows[0];
    return { operation: projected(row, ownerId), responseConflict };
  });
  if (outcome.responseConflict) throw conflict();
  return outcome.operation;
}
