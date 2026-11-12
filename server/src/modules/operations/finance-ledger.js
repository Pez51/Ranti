import { z } from 'zod';
import { appendAudit } from '../audit/audit.repository.js';
import { financeError, formatCents } from './finance.policy.js';
import { demoPaymentMethods } from '../users/payment-profile.service.js';

export const ledgerEntriesQuery = `SELECT q.id,q.operation_id,q.mode,q.method,q.tariff_version,q.tariff_snapshot,q.economics,q.public_snapshot,
    p.id AS payment_id,p.status AS payment_status,p.provider_reference,p.reconciliation,p.created_at AS payment_created_at,
    p.confirmed_at AS payment_confirmed_at,p.superseded_at,p.demo_authorization_required,
    t.external_reference AS payout_reference,t.participant_received_at AS payout_received_at,t.confirmed_at AS payout_confirmed_at,
    o.contract_snapshot #> '{workflow_payment,payout}' AS payout,
    r.amount_cents AS refund_cents,r.received_at AS refund_received_at,r.created_at AS refund_created_at,
    'REEMBOLSO-PRUEBA-'||r.reference AS refund_reference,
    s.guarantee_cents,s.decided_cents,'DEV-PRUEBA-'||s.reference AS guarantee_reference,s.decided_at AS guarantee_decided_at,
    to_jsonb(cb) AS chargeback
    FROM operation_finance_quotes q LEFT JOIN operation_finance_payments p ON p.quote_id=q.id
    JOIN operations o ON o.id=q.operation_id
    LEFT JOIN operation_finance_transfers t ON t.operation_id=p.operation_id AND p.status IN ('simulated_succeeded','sandbox_succeeded')
    LEFT JOIN operation_test_refunds r ON r.payment_id=p.id
    LEFT JOIN operation_return_settlements s ON s.operation_id=p.operation_id AND p.status IN ('simulated_succeeded','sandbox_succeeded')
    LEFT JOIN operation_finance_chargebacks cb ON cb.payment_id=p.id`;

export function ledgerMovements(row) {
  if (!row.payment_id) return [];
  const method = demoPaymentMethods[row.method] ?? row.method;
  const buyer = row.public_snapshot.requester?.name ?? 'Comprador';
  const owner = row.public_snapshot.owner?.name ?? 'Oferente';
  const payout = row.payout ? `${row.payout.label} •••• ${row.payout.last_four}` : owner;
  const amounts = row.economics;
  const status = ['simulated_succeeded','sandbox_succeeded'].includes(row.payment_status) ? 'confirmed' : row.payment_status;
  const movements = [];
  const add = (key, label, value, origin, destination, reference, date, state, canReview = false) => {
    if (value === null || value === undefined || BigInt(value) === 0n) return;
    movements.push({ key, label, amount: formatCents(value), origin, destination, reference, date, status: state, can_review: canReview });
  };
  const chargeRef = row.provider_reference ?? row.payment_id;
  const chargedAt = row.payment_confirmed_at ?? row.payment_created_at;
  add('price', row.public_snapshot.modality === 'Venta' ? 'Precio de venta' : 'Tarifa de alquiler',
    amounts.owner_cents, buyer, 'Registro de ingreso del oferente', chargeRef, chargedAt, status);
  add('commission', 'Comisión', amounts.ranti_expected_cents, buyer, 'Ranti', chargeRef, chargedAt, status);
  add('processor_cost', 'Costo de procesamiento', amounts.processor_expected_cents, buyer,
    'Canal de pago de prueba', chargeRef, chargedAt, status);
  add('guarantee', 'Garantía cobrada', amounts.guarantee_charged_cents, buyer,
    'Registro de garantía de prueba', chargeRef, chargedAt, status);
  if (row.payout_reference) add('payout', 'Abono al oferente', amounts.owner_cents, 'Piloto Ranti',
    payout, row.payout_reference, row.payout_confirmed_at, 'confirmed', true);
  if (row.refund_reference) add('refund', 'Reembolso del pago', row.refund_cents, 'Piloto Ranti',
    method, row.refund_reference, row.refund_created_at, 'confirmed', true);
  if (row.guarantee_decided_at) {
    add('guarantee_refund', 'Saldo de garantía devuelto', BigInt(row.guarantee_cents) - BigInt(row.decided_cents),
      'Registro de garantía de prueba', method, row.guarantee_reference, row.guarantee_decided_at, 'confirmed', true);
    add('guarantee_retention', 'Garantía asignada al oferente', row.decided_cents,
      'Registro de garantía de prueba', payout, row.guarantee_reference, row.guarantee_decided_at, 'confirmed', true);
  }
  if (row.chargeback) add('chargeback', 'Importe disputado', row.chargeback.amount_cents,
    'Cargo de prueba', 'Expediente de contracargo', row.chargeback.external_reference, row.chargeback.opened_at, row.chargeback.status);
  return movements;
}

const reviewInput = z.strictObject({
  outcome: z.enum(['confirmed','not_executed','unknown']),
  verification_reference: z.string().trim().min(3).max(100),
  evidence: z.string().trim().min(5).max(500),
});

export async function inspectLedgerMovement(client, operation, payment, actor, key, input) {
  const row = (await client.query(`${ledgerEntriesQuery} WHERE p.id=$1`, [payment?.id])).rows[0];
  const movement = row && ledgerMovements(row).find(item => item.key === key && item.can_review);
  if (!movement) throw financeError('El movimiento original no está disponible para conciliación.');
  if (input !== undefined) {
    const parsed = reviewInput.safeParse(input);
    if (!parsed.success) throw financeError('Indica resultado, referencia y evidencia de la consulta.');
    const { outcome, verification_reference: reference, evidence } = parsed.data;
    const prior = (await client.query(`SELECT * FROM operation_finance_movement_reviews
      WHERE payment_id=$1 AND movement_key=$2 AND verification_reference=$3`,
    [payment.id, key, reference])).rows[0];
    if (prior && (prior.outcome !== outcome || prior.evidence !== evidence)) {
      throw financeError('Esa referencia de consulta ya tiene otro resultado registrado.');
    }
    if (!prior) {
      await client.query(`INSERT INTO operation_finance_movement_reviews
        (payment_id,movement_key,original_reference,verification_reference,outcome,evidence,recorded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [payment.id, key, movement.reference, reference, outcome, evidence, actor]);
      await appendAudit(client, { actorId: actor, action: 'finance.movement.reconciled', entityType: 'operation',
        entityId: operation.id, newValues: { payment_id: payment.id, movement_key: key, reference, outcome } });
    }
  }
  const reviews = (await client.query(`SELECT outcome,verification_reference,evidence,recorded_at,recorded_by
    FROM operation_finance_movement_reviews WHERE payment_id=$1 AND movement_key=$2
    ORDER BY recorded_at DESC,id LIMIT 20`, [payment.id, key])).rows;
  return { movement, reviews };
}
