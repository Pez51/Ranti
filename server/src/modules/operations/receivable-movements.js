import { formatCents } from './finance.policy.js';
import { distributeGuarantee } from './return-settlement.js';

export async function receivableMovements(client, op, actor) {
  if (!op.contract_snapshot?.workflow_payment) return [];
  const owner = actor === op.oferente_id;
  const movements = [];
  if (owner) {
    const payout = (await client.query(`SELECT t.external_reference,t.confirmed_at,t.participant_received_at,
      q.economics->>'owner_cents' AS amount_cents
      FROM operation_finance_transfers t JOIN operation_finance_payments p ON p.operation_id=t.operation_id
      JOIN operation_finance_quotes q ON q.id=p.quote_id
      WHERE t.operation_id=$1 AND p.superseded_at IS NULL AND t.status='confirmed' AND t.mechanism='simulated'`, [op.id])).rows[0];
    if (payout) movements.push({ kind: 'payout', reference: payout.external_reference, amount: formatCents(payout.amount_cents),
      sent_at: payout.confirmed_at, received_at: payout.participant_received_at });
  } else {
    const refund = (await client.query('SELECT * FROM operation_test_refunds WHERE operation_id=$1', [op.id])).rows[0];
    if (refund) movements.push({ kind: 'refund', reference: `REEMBOLSO-PRUEBA-${refund.reference}`, amount: formatCents(refund.amount_cents),
      sent_at: refund.created_at, received_at: refund.received_at });
  }
  const settlement = (await client.query(`SELECT * FROM operation_return_settlements WHERE operation_id=$1 AND decided_at IS NOT NULL`, [op.id])).rows[0];
  if (settlement) {
    const amount = distributeGuarantee(settlement.guarantee_cents, settlement.decided_cents)[owner ? 'owner' : 'buyer'];
    if (amount !== '0.00') movements.push({ kind: 'guarantee', reference: `DEV-PRUEBA-${settlement.reference}`, amount,
      sent_at: settlement.decided_at, received_at: owner ? settlement.owner_received_at : settlement.buyer_received_at });
  }
  return movements;
}
