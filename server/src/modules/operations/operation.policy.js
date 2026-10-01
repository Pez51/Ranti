import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { dateValue, money } from '../publications/risk.policy.js';

const invalid = () => new AppError({ status: 400, code: 'INVALID_INPUT', message: 'Datos inválidos.' });
const forbidden = () => new AppError({ status: 403, code: 'FORBIDDEN', message: 'Acceso denegado.' });
const missing = () => new AppError({ status: 404, code: 'OPERATION_NOT_FOUND', message: 'Operación no encontrada.' });
const conflict = () => new AppError({ status: 409, code: 'OPERATION_CONFLICT', message: 'El estado actual impide esta acción.' });
const termsInvalid = () => new AppError({ status: 422, code: 'OPERATION_TERMS_INVALID', message: 'Las condiciones solicitadas no están disponibles.' });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = z.uuid();
const requestKeys = new Set(['publication_id', 'requested_price', 'requested_guarantee_amount',
  'requested_contract_version', 'start_date', 'end_date']);
const date = value => { try { return dateValue(value); } catch { throw invalid(); } };
const amount = value => { try { return money(value).text; } catch { throw invalid(); } };

function keys(input, allowed) {
  if (!isObject(input) || Object.keys(input).some(key => !allowed.has(key))) throw invalid();
}

function reason(value) {
  if (typeof value !== 'string') throw invalid();
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 500) throw invalid();
  return normalized;
}

export function parseOperationRequest(input) {
  keys(input, requestKeys);
  if (!uuid.safeParse(input.publication_id).success ||
      !Number.isSafeInteger(input.requested_contract_version) || input.requested_contract_version < 1) throw invalid();
  const result = {
    publication_id: input.publication_id,
    requested_price: amount(input.requested_price),
    requested_guarantee_amount: amount(input.requested_guarantee_amount),
    requested_contract_version: input.requested_contract_version,
  };
  if (Object.hasOwn(input, 'start_date')) result.start_date = date(input.start_date);
  if (Object.hasOwn(input, 'end_date')) result.end_date = date(input.end_date);
  return result;
}

export function parseDecision(input) {
  keys(input, new Set(['decision', 'reason']));
  if (input.decision === 'accept' && !Object.hasOwn(input, 'reason')) return { decision: 'accept' };
  if (input.decision === 'reject') return { decision: 'reject', reason: reason(input.reason) };
  throw invalid();
}

export function parseCancellation(input) {
  keys(input, new Set(['reason']));
  return { reason: reason(input.reason) };
}

function instant(value) {
  try { return dateValue(value); } catch { throw termsInvalid(); }
}

export function validateRequestedTerms(publication, request, now) {
  if (!isObject(publication) || !isObject(request) || publication.status !== 'Activa' ||
      request.publication_id !== publication.id || request.requester_id === publication.owner_id ||
      !uuid.safeParse(request.requester_id).success || !uuid.safeParse(publication.owner_id).success ||
      !['Venta', 'Alquiler', 'Préstamo'].includes(publication.modality) ||
      request.requested_contract_version !== publication.contract_version ||
      !Number.isSafeInteger(publication.contract_version) || publication.contract_version < 1) throw termsInvalid();
  let price, guarantee, requestedPrice, requestedGuarantee;
  try {
    price = money(publication.price ?? 0); guarantee = money(publication.guarantee_amount ?? 0);
    requestedPrice = money(request.requested_price); requestedGuarantee = money(request.requested_guarantee_amount);
  } catch { throw termsInvalid(); }
  if (price.cents !== requestedPrice.cents || guarantee.cents !== requestedGuarantee.cents) throw termsInvalid();
  if (publication.modality === 'Venta') {
    if (request.start_date != null || request.end_date != null ||
        publication.available_from != null || publication.available_until != null || guarantee.cents !== 0n || price.cents <= 0n) throw termsInvalid();
    return true;
  }
  if (publication.modality === 'Préstamo' ? price.cents !== 0n : price.cents <= 0n) throw termsInvalid();
  const start = instant(request.start_date); const end = instant(request.end_date);
  const availableFrom = instant(publication.available_from); const availableUntil = instant(publication.available_until);
  const current = instant(now);
  if (start >= end || start < availableFrom || end > availableUntil || start < current) throw termsInvalid();
  return true;
}

export function buildContractSnapshot(publication, operation, acceptedAt) {
  const accepted = instant(acceptedAt).toISOString();
  return {
    publication_id: publication.id, contract_version: publication.contract_version,
    title: publication.title, description: publication.description, category: publication.category,
    condition: publication.condition, modality: publication.modality,
    agreed_price: amount(publication.price ?? 0), guarantee_amount: amount(publication.guarantee_amount ?? 0),
    start_date: operation.start_date == null ? null : instant(operation.start_date).toISOString(),
    end_date: operation.end_date == null ? null : instant(operation.end_date).toISOString(),
    demandante_id: operation.demandante_id, oferente_id: operation.oferente_id, accepted_at: accepted,
  };
}

const edges = new Map([
  ['Pendiente|Aceptada|owner|request_available', 'create_reservation'],
  ['Pendiente|Rechazada|owner|pending_request', 'no_reservation'],
  ['Pendiente|Rechazada|owner|publication_invalidated', 'no_reservation'],
  ['Pendiente|Cancelada|requester|pending_request', 'no_reservation'],
  ['Pendiente|Expirada|system|expired_request', 'no_reservation'],
  ['Aceptada|Cancelada|requester|pre_economic', 'release_reservation'],
  ['Pendiente de pago/garantía|Cancelación en reversión|requester|pre_delivery', 'retain_reservation'],
  ['Lista para entrega|Cancelación en reversión|requester|pre_delivery', 'retain_reservation'],
]);
const effects = {
  create_reservation: Object.freeze({ createReservation: true, releaseReservation: false, retainReservation: false }),
  no_reservation: Object.freeze({ createReservation: false, releaseReservation: false, retainReservation: false }),
  release_reservation: Object.freeze({ createReservation: false, releaseReservation: true, retainReservation: false }),
  retain_reservation: Object.freeze({ createReservation: false, releaseReservation: false, retainReservation: true }),
};

export function authorizeTransition(rule, context) {
  if (!isObject(rule) || !isObject(context) || !isObject(context.operation)) throw conflict();
  const edge = [rule.from_status, rule.to_status, rule.actor_kind, rule.precondition_key].join('|');
  if (edges.get(edge) !== rule.effect_key || context.operation.status !== rule.from_status) throw conflict();
  const operation = context.operation;
  if (rule.actor_kind === 'owner' ? context.actorId !== operation.oferente_id :
      rule.actor_kind === 'requester' ? context.actorId !== operation.demandante_id :
        context.actorId != null) throw forbidden();
  const current = instant(context.now);
  const expires = instant(operation.request_expires_at);
  if (rule.precondition_key === 'expired_request') {
    if (current < expires) throw conflict();
  } else if (rule.precondition_key === 'pending_request') {
    if (current >= expires) throw conflict();
  } else if (rule.precondition_key === 'request_available') {
    if (current >= expires || context.reservationConflict) throw conflict();
    validateRequestedTerms(context.publication, {
      publication_id: operation.publication_id, requester_id: operation.demandante_id,
      requested_price: operation.requested_price,
      requested_guarantee_amount: operation.requested_guarantee_amount,
      requested_contract_version: operation.requested_contract_version,
      start_date: operation.start_date, end_date: operation.end_date,
    }, current);
    if (context.publication.owner_id !== operation.oferente_id || context.publication.modality !== operation.modality) throw conflict();
  } else if (rule.precondition_key === 'publication_invalidated') {
    if (current >= expires) throw conflict();
    try {
      validateRequestedTerms(context.publication, {
        publication_id: operation.publication_id, requester_id: operation.demandante_id,
        requested_price: operation.requested_price,
        requested_guarantee_amount: operation.requested_guarantee_amount,
        requested_contract_version: operation.requested_contract_version,
        start_date: operation.start_date, end_date: operation.end_date,
      }, current);
      if (context.publication.owner_id === operation.oferente_id && context.publication.modality === operation.modality) throw conflict();
    } catch (error) { if (error.code === 'OPERATION_CONFLICT') throw error; }
  } else if (rule.precondition_key === 'pre_economic' && context.hasEconomicMovement) throw conflict();
  else if (rule.precondition_key === 'pre_delivery' && context.delivered) throw conflict();
  return effects[rule.effect_key];
}

function pick(source, fields) {
  if (!isObject(source)) return null;
  return Object.fromEntries(fields.filter(field => Object.hasOwn(source, field)).map(field => [field, source[field]]));
}
const snapshotFields = ['publication_id', 'contract_version', 'title', 'description', 'category', 'condition',
  'modality', 'agreed_price', 'guarantee_amount', 'start_date', 'end_date', 'demandante_id', 'oferente_id', 'accepted_at'];
const operationFields = ['id', 'publication_id', 'modality', 'status', 'start_date', 'end_date',
  'requested_price', 'requested_guarantee_amount', 'requested_contract_version', 'request_expires_at',
  'accepted_at', 'decided_at', 'cancelled_at', 'decision_reason', 'cancellation_reason', 'created_at', 'updated_at'];
const publicationFields = ['id', 'title', 'primary_image', 'contract_version'];
const counterpartFields = ['id', 'display_name', 'reputation_score', 'operations_count'];

export function publicOperation(row, viewerId) {
  if (!isObject(row) || (viewerId !== row.demandante_id && viewerId !== row.oferente_id)) throw missing();
  const requesterView = viewerId === row.demandante_id;
  const counterpart = requesterView ? row.owner : row.requester;
  const allowed = row.status === 'Pendiente' ? (requesterView ? ['cancel'] : ['accept', 'reject']) :
    requesterView && row.status === 'Aceptada' ? ['cancel'] : [];
  return {
    ...pick(row, operationFields),
    contract_snapshot: row.accepted_at ? pick(row.contract_snapshot, snapshotFields) : null,
    allowed_actions: allowed,
    publication: pick(row.publication, publicationFields),
    counterpart: pick(counterpart, counterpartFields),
  };
}
