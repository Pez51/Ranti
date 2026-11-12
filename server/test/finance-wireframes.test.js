import { expect, it } from 'vitest';
import { canRetryFinancePayment, chargebackBalance } from '../src/modules/operations/finance.policy.js';
import { financeDocumentVariants } from '../src/modules/operations/finance-documents.js';
import { ledgerMovements } from '../src/modules/operations/finance-ledger.js';

it('allows a new attempt only after a known local failure and during a valid reservation', () => {
  const op = { status: 'Pendiente de pago/garantía' };
  const failed = { mode: 'simulated', status: 'failed' };
  expect(canRetryFinancePayment(op, failed, false)).toBe(true);
  expect(canRetryFinancePayment(op, failed, true)).toBe(false);
  expect(canRetryFinancePayment(op, { ...failed, status: 'pending' }, false)).toBe(false);
  expect(canRetryFinancePayment(op, { ...failed, mode: 'culqi_sandbox' }, false)).toBe(false);
});

it('limits a post-payout dispute to the original amount net of confirmed refunds', () => {
  expect(chargebackBalance('36540', '10000', '12000')).toBe(14540n);
  expect(chargebackBalance('100', '100', '100')).toBe(0n);
});

const economics = { total_cents: '36540', owner_cents: '15000', ranti_expected_cents: '750',
  processor_expected_cents: '790', guarantee_charged_cents: '20000' };
const snapshot = { title: 'Equipo', modality: 'Alquiler', owner: { name: 'María' }, requester: { name: 'Luis' } };

it('creates separately identifiable documents using only confirmed movements', () => {
  const quote = { id: 'quote', operation_id: 'op', economics, public_snapshot: snapshot };
  const payment = { status: 'simulated_succeeded', provider_reference: 'charge', confirmed_at: '2026-01-01' };
  const pending = financeDocumentVariants({ quote, payment: { ...payment, status: 'pending' },
    transfer: null, refund: null, settlement: null, payout: null });
  expect(pending).toEqual([]);
  const docs = financeDocumentVariants({ quote, payment, transfer: null, refund: null, settlement: null, payout: null });
  expect(docs.map(({ kind, amount }) => [kind, amount])).toEqual([
    ['rental', '150.00'], ['commission', '7.50'], ['payment', '365.40'], ['guarantee', '200.00'],
  ]);
  expect(new Set(docs.map(doc => doc.number)).size).toBe(docs.length);
  expect(docs.every(doc => doc.recipient === 'Luis' && doc.test_notice.includes('DE PRUEBA'))).toBe(true);
});

it('lists guarantee allocation and refund as separate ledger movements', () => {
  const row = { payment_id: 'payment', provider_reference: 'charge', payment_status: 'simulated_succeeded',
    method: 'tarjeta_prueba', public_snapshot: snapshot, economics, guarantee_cents: '20000',
    decided_cents: '8000', guarantee_reference: 'settlement', guarantee_decided_at: '2026-01-01' };
  expect(ledgerMovements(row).filter(item => item.can_review).map(item => [item.key, item.amount])).toEqual([
    ['guarantee_refund', '120.00'], ['guarantee_retention', '80.00'],
  ]);
});
