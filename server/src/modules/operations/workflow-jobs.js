import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { createInAppNotification } from '../../controllers/notification.controller.js';
import { closeReturnSettlement, findReturnSettlement, pendingCase } from './return-settlement.js';
import { inspectionHours, overdueGraceHours, paymentDeadlinePassed } from './workflow-timing.js';

async function processCandidates(db, candidates, apply) {
  const changed = [];
  for (const candidate of candidates) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const publication = await client.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE SKIP LOCKED', [candidate.publication_id]);
      const op = publication.rowCount ?
        (await client.query('SELECT * FROM operations WHERE id=$1 FOR UPDATE SKIP LOCKED', [candidate.id])).rows[0] : null;
      if (op && await apply(client, op)) changed.push(op.id);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  return changed;
}

async function notify(client, operation, title, message) {
  for (const userId of [operation.demandante_id, operation.oferente_id]) {
    await createInAppNotification(client, { userId, type: 'Alerta', title, message, referenceId: operation.id });
  }
}

export async function expireOperationRequests(db, { now = new Date(), limit = 50 } = {}) {
  const { rows } = await db.query(`SELECT id,publication_id FROM operations o
    WHERE (status='Pendiente' AND request_expires_at <= $1
      OR status IN ('Aceptada','Pendiente de pago/garantía') AND payment_expires_at <= $1)
    AND NOT EXISTS (SELECT 1 FROM incidences WHERE operation_id=o.id AND ${pendingCase})
    AND NOT EXISTS (SELECT 1 FROM operation_finance_payments WHERE operation_id=o.id
      AND superseded_at IS NULL AND status <> 'failed')
    ORDER BY COALESCE(payment_expires_at,request_expires_at),id LIMIT $2`, [now, limit]);

  return processCandidates(db, rows, async (client, op) => {
    const accepted = ['Aceptada', 'Pendiente de pago/garantía'].includes(op.status);
    if (op.status === 'Pendiente' ? op.request_expires_at > now : !accepted || !paymentDeadlinePassed(op, now)) return false;
    const blockers = await client.query(`SELECT 1 FROM incidences WHERE operation_id=$1 AND ${pendingCase}
      UNION ALL SELECT 1 FROM operation_finance_payments WHERE operation_id=$1 AND superseded_at IS NULL AND status<>'failed'
      UNION ALL SELECT 1 FROM operation_payment_simulations WHERE operation_id=$1
      UNION ALL SELECT 1 FROM transactions WHERE operation_id=$1`, [op.id]);
    if (blockers.rowCount) return false;

    const reason = accepted ? 'payment_deadline_expired' : 'request_expired';
    if (accepted) {
      await client.query(`UPDATE operations SET status='Expirada',payment_expired_at=$2,
        decision_reason=$3,updated_at=clock_timestamp() WHERE id=$1`, [op.id, now, reason]);
      await client.query(`UPDATE reservations SET status='Disponible',released_at=$2,release_reason=$3
        WHERE operation_id=$1 AND status IN ('Bloqueo Provisional','Reservada/Bloqueada')`, [op.id, now, reason]);
    } else {
      await client.query(`UPDATE operations SET status='Expirada',decided_at=$2,decision_reason=$3,
        updated_at=clock_timestamp() WHERE id=$1`, [op.id, now, reason]);
    }
    await appendAudit(client, { action: 'operation.expired', entityType: 'operation',
      entityId: op.id, oldValues: { status: op.status }, newValues: { status: 'Expirada', reason } });
    await enqueueOutboxEvent(client, { aggregateType: 'operation', aggregateId: op.id, eventType: 'operation.expired',
      payload: { operationId: op.id, ownerId: op.oferente_id, requesterId: op.demandante_id },
      deduplicationKey: `operation.expired:${op.id}` });
    await notify(client, op, accepted ? 'Reserva vencida' : 'Solicitud vencida',
      accepted ? 'Terminó el plazo sin un pago confirmado. La reserva se liberó.' :
        'Terminó el plazo sin que el oferente aceptara. La solicitud caducó sin cobro.');
    return true;
  });
}

export async function closeUnansweredReturns(db, { now = new Date(), limit = 50 } = {}) {
  const hours = inspectionHours();
  const { rows } = await db.query(`SELECT o.id,o.publication_id
    FROM operations o JOIN operation_return_settlements s ON s.operation_id=o.id
    WHERE o.status='Entregada/Activa' AND s.proposed_cents IS NULL AND s.decided_at IS NULL
    AND (s.inspection_due_at IS NULL OR GREATEST(s.inspection_due_at,
      (SELECT max(i.resolved_at) + ($2 * interval '1 hour') FROM incidences i
       WHERE i.operation_id=o.id AND i.created_at>=s.notified_at)) <= $1)
    AND NOT EXISTS(SELECT 1 FROM incidences WHERE operation_id=o.id AND ${pendingCase})
    ORDER BY s.inspection_due_at NULLS FIRST,o.id LIMIT $3`, [now, hours, limit]);

  return processCandidates(db, rows, async (client, op) => {
    if (op.status !== 'Entregada/Activa') return false;
    const settlement = await findReturnSettlement(client, op.id);
    if (!settlement || settlement.proposed_cents !== null || settlement.decided_at) return false;
    if ((await client.query(`SELECT id FROM incidences WHERE operation_id=$1 AND ${pendingCase} LIMIT 1`, [op.id])).rowCount) return false;
    if (!settlement.notified_at) {
      await client.query(`UPDATE operation_return_settlements SET notified_at=$2,inspection_due_at=$2::timestamptz+($3 * interval '1 hour')
        WHERE operation_id=$1`, [op.id, now, hours]);
      await createInAppNotification(client, { userId: op.oferente_id, type: 'Alerta', referenceId: op.id,
        title: 'Inspección de devolución pendiente', message: 'Ya puedes revisar la devolución y responder dentro del plazo de inspección.' });
      return false;
    }
    if (settlement.effective_inspection_due_at > now) return false;
    const updated = (await client.query(`UPDATE operation_return_settlements SET proposed_cents=0,
      inspection_notes='El plazo venció sin una inspección registrada.' WHERE operation_id=$1 RETURNING *`, [op.id])).rows[0];
    await closeReturnSettlement(client, op, updated, '0', null, true);
    return true;
  });
}

export async function openOverdueReturns(db, { now = new Date(), limit = 50 } = {}) {
  const grace = overdueGraceHours();
  const { rows } = await db.query(`SELECT o.id,o.publication_id FROM operations o
    JOIN operation_handoffs h ON h.operation_id=o.id
    WHERE o.status='Entregada/Activa' AND o.modality='Alquiler' AND o.contract_snapshot ? 'workflow_payment'
    AND o.end_date + ($2 * interval '1 hour') <= $1 AND h.requester_returned_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM incidences i WHERE i.operation_id=o.id AND i.type='late_return'
      AND (i.system_generated OR i.status NOT IN ('Resuelta','Desestimada')))
    ORDER BY o.end_date,o.id LIMIT $3`, [now, grace, limit]);

  return processCandidates(db, rows, async (client, op) => {
    if (op.status !== 'Entregada/Activa' || op.end_date.getTime() + grace * 3600000 > now.getTime()) return false;
    const handoff = (await client.query('SELECT requester_returned_at FROM operation_handoffs WHERE operation_id=$1', [op.id])).rows[0];
    if (handoff?.requester_returned_at) return false;
    const exists = await client.query(`SELECT 1 FROM incidences WHERE operation_id=$1 AND type='late_return'
      AND (system_generated OR ${pendingCase}) LIMIT 1`, [op.id]);
    if (exists.rowCount) return false;
    const description = 'Venció el plazo de alquiler y el período de gracia sin una devolución registrada.';
    const item = (await client.query(`INSERT INTO incidences(operation_id,reporter_id,reported_id,type,description,
      stage_at_report,occurred_at,system_generated) VALUES($1,$2,$3,'late_return',$4,'delivered',$5,true) RETURNING id`,
    [op.id, op.oferente_id, op.demandante_id, description, op.end_date])).rows[0];
    await appendAudit(client, { action: 'incidence.overdue_return', entityType: 'incidence',
      entityId: item.id, newValues: { operation_id: op.id } });
    await notify(client, op, 'Alquiler vencido sin devolución',
      'Se abrió un caso de devolución pendiente. Coordina la entrega y aporta evidencia en Mis operaciones.');
    return true;
  });
}
