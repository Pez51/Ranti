import { z } from 'zod';
import { appendAudit } from '../audit/audit.repository.js';
import { chargebackBalance, financeError } from './finance.policy.js';

const reference = z.string().trim().min(3).max(100);
const evidence = z.string().trim().min(5).max(1000);
const inputSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('open'), reference, evidence,
    amount_cents: z.string().regex(/^[1-9]\d{0,9}$/), evidence_deadline: z.iso.datetime({ offset: true }).optional() }),
  z.strictObject({ action: z.literal('resolve'), status: z.enum(['won', 'lost']), reference, evidence,
    recovery: z.enum(['receivable', 'authorized_offset']).optional() }),
]);

export async function updateDemoChargeback(client, operation, payment, actor, input) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw financeError('Revisa el importe, referencia y evidencia del contracargo de prueba.');
  const data = parsed.data;
  if (payment?.status !== 'simulated_succeeded') throw financeError('Se requiere un cargo de prueba confirmado.');
  const prior = (await client.query(`SELECT * FROM operation_finance_chargebacks WHERE payment_id=$1`,
    [payment.id])).rows[0];
  let result;
  if (data.action === 'open') {
    if (prior) {
      const sameDeadline = (prior.evidence_deadline?.getTime() ?? null) ===
        (data.evidence_deadline ? Date.parse(data.evidence_deadline) : null);
      if (prior.external_reference === data.reference && prior.amount_cents === data.amount_cents &&
          prior.evidence === data.evidence && sameDeadline) return prior;
      throw financeError('El cargo ya tiene un expediente de contracargo.');
    }
    const verified = (await client.query(`SELECT q.economics,
        COALESCE(r.amount_cents,0) AS refund_cents,
        COALESCE(GREATEST(s.guarantee_cents-s.decided_cents,0),0) AS guarantee_refund_cents
      FROM operation_finance_quotes q
      JOIN operation_finance_transfers t ON t.operation_id=q.operation_id
      LEFT JOIN operation_test_refunds r ON r.payment_id=$2
      LEFT JOIN operation_return_settlements s ON s.operation_id=q.operation_id AND s.decided_at IS NOT NULL
      WHERE q.id=$1 AND t.status='confirmed' AND t.mechanism='simulated'`, [payment.quote_id, payment.id])).rows[0];
    if (!verified) throw financeError('El contracargo requiere un abono de prueba ya liquidado.');
    if (BigInt(data.amount_cents) > chargebackBalance(verified.economics.total_cents,
      verified.refund_cents, verified.guarantee_refund_cents)) {
      throw financeError('El importe disputado excede el cargo restante después de las devoluciones registradas.');
    }
    result = (await client.query(`INSERT INTO operation_finance_chargebacks
      (payment_id,external_reference,amount_cents,evidence,evidence_deadline,opened_by)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(external_reference) DO NOTHING RETURNING *`,
    [payment.id, data.reference, data.amount_cents, data.evidence, data.evidence_deadline ?? null, actor])).rows[0];
    if (!result) throw financeError('La referencia del contracargo ya está asociada a otro cargo.');
  } else {
    if (!prior) throw financeError('Abre el expediente antes de registrar el resultado.');
    if ((data.status === 'lost') !== Boolean(data.recovery)) {
      throw financeError('Un contracargo perdido requiere indicar la recuperación de prueba.');
    }
    if (prior.status !== 'open') {
      if (prior.status === data.status && prior.resolution_reference === data.reference &&
          prior.resolution_evidence === data.evidence && prior.recovery === (data.recovery ?? null)) return prior;
      throw financeError('El expediente ya tiene una resolución registrada.');
    }
    result = (await client.query(`UPDATE operation_finance_chargebacks SET status=$2,
      resolution_reference=$3,resolution_evidence=$4,recovery=$5,resolved_by=$6,resolved_at=clock_timestamp()
      WHERE id=$1 RETURNING *`, [prior.id, data.status, data.reference, data.evidence, data.recovery ?? null, actor])).rows[0];
  }
  await appendAudit(client, { actorId: actor, action: `finance.chargeback.${result.status}`, entityType: 'operation',
    entityId: operation.id, newValues: { chargeback_id: result.id, payment_id: payment.id,
      amount_cents: result.amount_cents, reference: data.reference, recovery: result.recovery } });
  return result;
}
