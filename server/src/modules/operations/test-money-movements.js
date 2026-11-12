import { appendAudit } from '../audit/audit.repository.js';
import { demoPaymentMethods } from '../users/payment-profile.service.js';
import { financeError, formatCents } from './finance.policy.js';

export async function createTestPayout(client, operation) {
  if (!operation.contract_snapshot?.workflow_payment) return;
  await client.query(`UPDATE operation_finance_transfers t SET status='confirmed',mechanism='simulated',
    external_reference='ABONO-PRUEBA-'||p.id,confirmed_at=clock_timestamp()
    FROM operation_finance_payments p WHERE t.operation_id=$1 AND p.operation_id=t.operation_id
    AND p.status='simulated_succeeded' AND t.status='not_enabled'`, [operation.id]);
}

export async function testRefundView(client, operation, requester) {
  if (!operation.contract_snapshot?.workflow_payment) return null;
  const row = (await client.query(`SELECT r.*,q.method FROM operation_test_refunds r
    JOIN operation_finance_payments p ON p.id=r.payment_id JOIN operation_finance_quotes q ON q.id=p.quote_id
    WHERE r.operation_id=$1`, [operation.id])).rows[0];
  if (!row) return null;
  return { amount: formatCents(row.amount_cents), reference: `REEMBOLSO-PRUEBA-${row.reference}`,
    created_at: row.created_at, ...(requester ? {
      received_at: row.received_at, destination: demoPaymentMethods[row.method] ?? 'Medio original de prueba',
    } : {}) };
}

export async function refundOptions(client, operation, incidence) {
  if (!operation.contract_snapshot?.workflow_payment || !['meeting','payment','not_as_described','damage',
    'delivery_absence','delivery_not_validated','paid_cancellation'].includes(incidence.type)) return null;
  const row = (await client.query(`SELECT p.id AS payment_id,q.economics,q.method,h.owner_delivered_at,h.requester_received_at
    FROM operation_finance_payments p JOIN operation_finance_quotes q ON q.id=p.quote_id
    JOIN operation_handoffs h ON h.operation_id=p.operation_id
    WHERE p.operation_id=$1 AND p.status='simulated_succeeded' AND p.superseded_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM operation_finance_chargebacks WHERE payment_id=p.id AND status IN ('open','lost'))
    AND NOT EXISTS (SELECT 1 FROM operation_test_refunds WHERE operation_id=p.operation_id)`, [operation.id])).rows[0];
  if (!row) return null;
  const beforeDelivery = !row.owner_delivered_at && !row.requester_received_at && operation.status === 'Lista para entrega';
  if (!beforeDelivery && !(operation.modality === 'Venta' && operation.status === 'Cerrada')) return null;
  return { payment_id: row.payment_id, total: formatCents(row.economics.total_cents),
    guarantee: formatCents(row.economics.guarantee_charged_cents), destination: demoPaymentMethods[row.method],
    before_delivery: beforeDelivery };
}

export async function issueTestRefund(client, operation, incidence, cents, actor) {
  const options = await refundOptions(client, operation, incidence);
  if (!options) throw financeError('Esta operación no tiene un pago de prueba disponible para devolución.');
  const amount = BigInt(cents);
  const toCents = value => BigInt(value.replace('.', ''));
  if (amount < 1n || amount > toCents(options.total) || amount < toCents(options.guarantee)) {
    throw financeError('Indica un importe dentro del saldo disponible. Si cancelas antes de entregar, incluye toda la garantía cobrada.');
  }
  if (options.before_delivery) {
    const others = await client.query("SELECT 1 FROM incidences WHERE operation_id=$1 AND status NOT IN ('Resuelta','Desestimada') LIMIT 1", [operation.id]);
    if (others.rowCount) throw financeError('Resuelve los demás casos antes de cancelar la operación.');
    await client.query(`UPDATE operations SET status='Cancelada',cancelled_at=clock_timestamp(),
      cancelled_by=$2,incidence_cancelled_by=$2,cancellation_reason=$3,updated_at=clock_timestamp() WHERE id=$1`,
    [operation.id, actor, `Devolución de prueba por el caso ${incidence.id}`]);
    await client.query(`UPDATE reservations SET status='Disponible',released_at=clock_timestamp(),
      release_reason='Cancelación administrativa con devolución de prueba'
      WHERE operation_id=$1 AND status IN ('Bloqueo Provisional','Reservada/Bloqueada')`, [operation.id]);
  }
  await client.query(`INSERT INTO operation_test_refunds(operation_id,payment_id,incidence_id,amount_cents)
    VALUES($1,$2,$3,$4)`, [operation.id, options.payment_id, incidence.id, String(amount)]);
  await appendAudit(client, { actorId: actor, action: 'finance.test_refund_recorded', entityType: 'operation',
    entityId: operation.id, newValues: { incidence_id: incidence.id, amount_cents: String(amount) } });
}
