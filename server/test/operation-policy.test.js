import { describe, expect, it } from 'vitest';
import {
  parseOperationRequest, parseDecision, parseCancellation, validateRequestedTerms,
  buildContractSnapshot, authorizeTransition, publicOperation,
} from '../src/modules/operations/operation.policy.js';

const requester = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const publicationId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-10-01T12:00:00.000Z');
const sale = {
  id: publicationId, owner_id: owner, status: 'Activa', title: 'Laptop', description: 'Equipo original',
  category: 'Tecnología', condition: 'Usado', modality: 'Venta', price: '25.00', guarantee_amount: '0.00',
  contract_version: 3, available_from: null, available_until: null,
};
const rental = {
  ...sale, modality: 'Alquiler', guarantee_amount: '10.00',
  available_from: new Date('2026-10-02T05:00:00.000Z'),
  available_until: new Date('2026-10-10T05:00:00.000Z'),
};
const requestInput = {
  publication_id: publicationId, requested_price: '25.00', requested_guarantee_amount: '0.00',
  requested_contract_version: 3,
};
const pending = {
  id: '55555555-5555-4555-8555-555555555555', publication_id: publicationId,
  demandante_id: requester, oferente_id: owner, modality: 'Venta', status: 'Pendiente',
  requested_price: '25.00', requested_guarantee_amount: '0.00', requested_contract_version: 3,
  start_date: null, end_date: null, request_expires_at: new Date('2026-10-03T12:00:00.000Z'),
  contract_snapshot: null, created_at: now, updated_at: now,
};

describe('operation request parsing and terms', () => {
  it('normalizes a sale request without dates and preserves explicit displayed terms', () => {
    expect(parseOperationRequest(requestInput)).toEqual(requestInput);
    expect(validateRequestedTerms(sale, { ...requestInput, requester_id: requester }, now)).toBeTruthy();
  });

  it.each([
    { publication_id: 'bad' }, { requested_price: 'NaN' }, { requested_guarantee_amount: '-1' },
    { requested_contract_version: 0 }, { unexpected: 'value' },
  ])('rejects malformed request input %o', (change) => {
    expect(() => parseOperationRequest({ ...requestInput, ...change })).toThrow();
  });

  it('rejects sale dates, stale displayed economics and version, inactive or self-owned requests', () => {
    const base = { ...requestInput, requester_id: requester };
    for (const [pub, req] of [
      [sale, { ...base, start_date: new Date('2026-10-02T05:00:00Z') }],
      [sale, { ...base, requested_price: '24.00' }],
      [sale, { ...base, requested_contract_version: 2 }],
      [{ ...sale, status: 'Pausada' }, base],
      [sale, { ...base, requester_id: owner }],
    ]) expect(() => validateRequestedTerms(pub, req, now)).toThrow();
  });

  it('converts date-only Peru midnight and accepts an exact half-open availability window', () => {
    const input = parseOperationRequest({ ...requestInput, requested_guarantee_amount: '10.00',
      start_date: '2026-10-02', end_date: '2026-10-10' });
    expect(input.start_date.toISOString()).toBe('2026-10-02T05:00:00.000Z');
    expect(input.end_date.toISOString()).toBe('2026-10-10T05:00:00.000Z');
    expect(validateRequestedTerms(rental, { ...input, requester_id: requester }, now)).toBeTruthy();
    expect(validateRequestedTerms({ ...rental, modality: 'Préstamo', price: '0.00' },
      { ...input, requested_price: '0.00', requester_id: requester }, now)).toBeTruthy();
  });

  it.each([
    ['2026-10-02', '2026-10-02'], ['2026-10-01', '2026-10-03'],
    ['2026-10-02', '2026-10-11'], ['2026-02-30', '2026-10-03'],
  ])('rejects invalid or out-of-window rental %s to %s', (start_date, end_date) => {
    const request = { ...requestInput, requested_guarantee_amount: '10.00', start_date, end_date };
    expect(() => validateRequestedTerms(rental, { ...request, requester_id: requester }, now)).toThrow();
  });
});

describe('decisions, transitions, snapshots and projections', () => {
  it('requires normalized rejection and cancellation reasons of 1–500 characters', () => {
    expect(parseDecision({ decision: 'reject', reason: '  No disponible  ' })).toEqual({ decision: 'reject', reason: 'No disponible' });
    expect(parseDecision({ decision: 'accept' })).toEqual({ decision: 'accept' });
    expect(parseCancellation({ reason: '  Cambio de planes  ' })).toEqual({ reason: 'Cambio de planes' });
    for (const reason of ['', '   ', 'x'.repeat(501)]) {
      expect(() => parseDecision({ decision: 'reject', reason })).toThrow();
      expect(() => parseCancellation({ reason })).toThrow();
    }
    expect(() => parseDecision({ decision: 'accept', reason: 'extra' })).toThrow();
    expect(() => parseDecision({ decision: 'reject', reason: 'ok', secret: 'x' })).toThrow();
  });

  it('freezes agreed publication and participant terms at acceptance', () => {
    expect(buildContractSnapshot(sale, pending, now)).toEqual({
      publication_id: publicationId, contract_version: 3, title: 'Laptop', description: 'Equipo original',
      category: 'Tecnología', condition: 'Usado', modality: 'Venta', agreed_price: '25.00',
      guarantee_amount: '0.00', start_date: null, end_date: null,
      demandante_id: requester, oferente_id: owner, accepted_at: now.toISOString(),
    });
  });

  it('authorizes only the owner on an unexpired available acceptance edge', () => {
    const rule = { from_status: 'Pendiente', to_status: 'Aceptada', actor_kind: 'owner',
      precondition_key: 'request_available', effect_key: 'create_reservation' };
    const context = { operation: pending, publication: sale, actorId: owner, now, reservationConflict: false };
    expect(authorizeTransition(rule, context)).toEqual({ createReservation: true, releaseReservation: false, retainReservation: false });
    expect(() => authorizeTransition(rule, { ...context, actorId: requester })).toThrow();
    expect(() => authorizeTransition(rule, { ...context, now: pending.request_expires_at })).toThrow();
    expect(() => authorizeTransition(rule, { ...context, reservationConflict: true })).toThrow();
  });

  it('rejects forged or unknown transition keys, status mismatch, and unauthorized actor kinds', () => {
    const base = { from_status: 'Pendiente', to_status: 'Cancelada', actor_kind: 'requester',
      precondition_key: 'pending_request', effect_key: 'no_reservation' };
    const context = { operation: pending, publication: sale, actorId: requester, now };
    expect(authorizeTransition(base, context)).toEqual({ createReservation: false, releaseReservation: false, retainReservation: false });
    for (const rule of [
      { ...base, precondition_key: 'eval' }, { ...base, effect_key: 'execute_sql' },
      { ...base, actor_kind: 'admin' }, { ...base, from_status: 'Aceptada' },
    ]) expect(() => authorizeTransition(rule, context)).toThrow();
  });

  it('projects only participant-safe fields and hides internal and counterpart secrets', () => {
    const row = { ...pending, status: 'Aceptada', accepted_at: now, otp_code: '123456', otp_hash: 'hash', worker_payload: { token: 'secret' },
      contract_snapshot: { ...buildContractSnapshot(sale, pending, now), otp: 'hidden' },
      publication: { id: publicationId, title: 'Laptop', primary_image: 'https://example.org/p.png',
        contract_version: 3, provenance_evidence_ref: 'secret' },
      requester: { id: requester, email: 'secret@example.org', display_name: 'Solicitante' },
      owner: { id: owner, email: 'owner@example.org', display_name: 'Oferente', reputation_score: '4.5', operations_count: 2 },
    };
    const projected = publicOperation(row, requester);
    expect(projected.publication).toEqual({ id: publicationId, title: 'Laptop', primary_image: 'https://example.org/p.png', contract_version: 3 });
    expect(projected.counterpart).toEqual({ id: owner, display_name: 'Oferente', reputation_score: '4.5', operations_count: 2 });
    expect(projected.contract_snapshot).not.toHaveProperty('otp');
    expect(projected.allowed_actions).toContain('cancel');
    expect(JSON.stringify(projected)).not.toMatch(/otp|secret|evidence|worker|email/);
    expect(() => publicOperation(row, other)).toThrow();
  });
});
