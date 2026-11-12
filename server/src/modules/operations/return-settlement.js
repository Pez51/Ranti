import { appendAudit } from '../audit/audit.repository.js';
import { appendConversationEvent } from './conversation-events.js';
import { financeError, formatCents } from './finance.policy.js';
import { demoPaymentMethods } from '../users/payment-profile.service.js';
import { createTestPayout } from './test-money-movements.js';
import { inspectionHours } from './workflow-timing.js';
import { createInAppNotification } from '../../controllers/notification.controller.js';

export const retentionInput = /^\d{1,10}$/;
export const pendingCase = "status NOT IN ('Resuelta','Desestimada')";

export function distributeGuarantee(held, requested) {
  const guarantee = BigInt(held);
  const retention = BigInt(requested);
  const owner = retention > guarantee ? guarantee : retention;
  return { guarantee: formatCents(guarantee), owner: formatCents(owner),
    buyer: formatCents(guarantee - owner), excess: formatCents(retention - owner) };
}

export async function findReturnSettlement(client, id) {
  return (await client.query(`SELECT s.*,
    GREATEST(s.inspection_due_at, (SELECT max(i.resolved_at) + ($2 * interval '1 hour')
      FROM incidences i WHERE i.operation_id=s.operation_id AND i.created_at >= s.notified_at)) AS effective_inspection_due_at
    FROM operation_return_settlements s WHERE s.operation_id=$1`, [id, inspectionHours()])).rows[0];
}

export function returnSettlementView(row, operation, viewer, admin = false) {
  if (!row) return null;
  const owner = viewer === operation.oferente_id;
  const reference = `DEV-PRUEBA-${row.reference}`;
  return {
    return_notes: row.return_notes,
    inspection_notes: row.inspection_notes,
    return_at: row.return_at,
    return_location: row.return_location,
    return_accessories_confirmed: row.return_accessories_confirmed,
    inspected_at: row.inspected_at,
    inspection_result: row.inspection_result,
    inspection_accessories_confirmed: row.inspection_accessories_confirmed,
    notified_at: row.notified_at,
    inspection_due_at: row.effective_inspection_due_at ?? row.inspection_due_at,
    closed_by_silence: row.closed_by_silence,
    proposed: row.proposed_cents === null ? null : distributeGuarantee(row.guarantee_cents, row.proposed_cents),
    decided: row.decided_cents === null ? null : distributeGuarantee(row.guarantee_cents, row.decided_cents),
    held: formatCents(row.guarantee_cents),
    reference: row.decided_at ? reference : null,
    decided_at: row.decided_at,
    buyer_destination: demoPaymentMethods[row.payment_method] ?? 'Medio de pago original',
    ...((owner || admin) ? { owner_destination: operation.contract_snapshot.workflow_payment.payout } : {}),
    received_at: owner ? row.owner_received_at : row.buyer_received_at,
  };
}

export async function recordReturn(client, operation, data, now) {
  const finance = (await client.query(`SELECT q.method,q.economics
    FROM operation_finance_payments p JOIN operation_finance_quotes q ON q.id=p.quote_id
    WHERE p.operation_id=$1 AND p.superseded_at IS NULL AND p.status IN ('simulated_succeeded','sandbox_succeeded')`, [operation.id])).rows[0];
  if (!finance) throw financeError('Debe estar confirmado el pago de prueba de esta operación.');
  await client.query(`INSERT INTO operation_return_settlements(
    operation_id,return_notes,guarantee_cents,payment_method,return_at,return_location,
    return_accessories_confirmed,notified_at,inspection_due_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8::timestamptz + ($9 * interval '1 hour'))`,
  [operation.id, data.notes, finance.economics.guarantee_charged_cents, finance.method,
    data.returned_at ?? now, data.return_location ?? null, data.accessories_confirmed ?? null, now, inspectionHours()]);
  await client.query('UPDATE operation_handoffs SET requester_returned_at=$2,updated_at=$2 WHERE operation_id=$1', [operation.id, now]);
  await createInAppNotification(client, { userId: operation.oferente_id, type: 'Alerta',
    title: 'Devolución registrada', message: 'Revisa el equipo y registra la inspección en Mis operaciones.', referenceId: operation.id });
}

export async function closeReturnSettlement(client, operation, settlement, retention, actor, bySilence = false) {
  if (operation.status !== 'Entregada/Activa' || !settlement || settlement.proposed_cents === null || settlement.decided_at) {
    throw financeError('La devolución necesita un acta de inspección pendiente de resolver.');
  }
  if ((await client.query(`SELECT 1 FROM incidences WHERE operation_id=$1 AND ${pendingCase} LIMIT 1`, [operation.id])).rowCount) {
    throw financeError('Hay otro caso pendiente. Resuélvelo antes de cerrar la devolución.');
  }
  await client.query(`UPDATE operation_return_settlements SET decided_cents=$2,decided_at=clock_timestamp(),closed_by_silence=$3
    WHERE operation_id=$1`, [operation.id, retention, bySilence]);
  await client.query("UPDATE operations SET status='Cerrada',updated_at=clock_timestamp() WHERE id=$1", [operation.id]);
  await createTestPayout(client, operation);
  await client.query(`UPDATE reservations SET status='Disponible',released_at=clock_timestamp(),
    release_reason=$2 WHERE operation_id=$1 AND status='Activa/En uso'`,
  [operation.id, bySilence ? 'Plazo de inspección vencido sin respuesta' : 'Acta de devolución resuelta']);
  const amounts = distributeGuarantee(settlement.guarantee_cents, retention);
  await appendAudit(client, { actorId: actor, action: bySilence ? 'finance.return_settled_by_silence' : 'finance.return_settled', entityType: 'operation',
    entityId: operation.id, newValues: amounts });
  if (bySilence) {
    for (const userId of [operation.demandante_id, operation.oferente_id]) {
      await createInAppNotification(client, { userId, type: 'Transaccion', referenceId: operation.id,
        title: 'Devolución cerrada por vencimiento de inspección',
        message: 'Venció el plazo sin inspección ni caso pendiente. Consulta los movimientos de prueba de la operación.' });
    }
  } else {
    await appendConversationEvent(client, operation, actor, { type: 'finance.return_settled',
      key: 'finance.return_settled', body: 'Devolución cerrada. Revisa en la operación el reparto de la garantía de prueba.' });
  }
}

export async function confirmReturnReceipt(client, operation, settlement, owner, actor) {
  if (operation.status !== 'Cerrada' || !settlement?.decided_at) throw financeError('La devolución sigue pendiente.');
  const amounts = distributeGuarantee(settlement.guarantee_cents, settlement.decided_cents);
  const field = owner ? 'owner_received_at' : 'buyer_received_at';
  if (amounts[owner ? 'owner' : 'buyer'] === '0.00') throw financeError('No hay saldo de garantía para confirmar.');
  const result = await client.query(`UPDATE operation_return_settlements SET ${field}=clock_timestamp()
    WHERE operation_id=$1 AND ${field} IS NULL`, [operation.id]);
  if (result.rowCount) await appendAudit(client, { actorId: actor, action: 'finance.return_receipt_confirmed',
    entityType: 'operation', entityId: operation.id, newValues: { recipient: owner ? 'owner' : 'buyer' } });
}
