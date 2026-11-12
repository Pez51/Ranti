import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { projectOperation } from './operation-request.service.js';
import { appendConversationEvent } from './conversation-events.js';
import { closeReturnSettlement, confirmReturnReceipt, findReturnSettlement, recordReturn, retentionInput } from './return-settlement.js';
import { createTestPayout } from './test-money-movements.js';
import { deliveryWindowEnd, otpAttempts, otpExpiry, paymentDeadlinePassed } from './workflow-timing.js';

const physicalFields = {
  accessories_confirmed: z.boolean().optional(),
};

const schema = z.discriminatedUnion('action', [
  z.object({action:z.literal('propose'),revision:z.number().int().min(0),meeting_at:z.iso.datetime({offset:true}),location:z.string().trim().min(3).max(200),notes:z.string().trim().max(500).default('')}).strict(),
  z.object({action:z.enum(['agree','request-change','confirm-delivery','confirm-return','accept-inspection','confirm-return-receipt']),revision:z.number().int().min(1)}).strict(),
  z.object({action:z.enum(['generate-delivery-code','regenerate-delivery-code']),revision:z.number().int().min(1),...physicalFields}).strict(),
  z.object({action:z.literal('verify-delivery-code'),revision:z.number().int().min(1),code:z.string().regex(/^\d{6}$/),...physicalFields}).strict(),
  z.object({action:z.literal('record-return'),revision:z.number().int().min(1),notes:z.string().trim().min(3).max(1000),
    returned_at:z.iso.datetime({offset:true}).optional(),return_location:z.string().trim().min(3).max(200).optional(),...physicalFields}).strict(),
  z.object({action:z.literal('inspect-return'),revision:z.number().int().min(1),notes:z.string().trim().min(3).max(1000),
    retention_cents:z.string().regex(retentionInput),inspected_at:z.iso.datetime({offset:true}).optional(),
    inspection_result:z.enum(['conforme','danos','faltantes']).optional(),...physicalFields}).strict(),
]);
const conflict = message => new AppError({status:409,code:'HANDOFF_CONFLICT',message});

export async function updateHandoff(db, id, actor, input) {
  const parsed=schema.safeParse(input);
  if(!z.uuid().safeParse(id).success||!parsed.success) throw new AppError({status:400,code:'INVALID_INPUT',message:'Revisa el lugar, la fecha, la hora y la versión de la coordinación.'});
  const data=parsed.data,client=await db.connect();
  try {
    await client.query('BEGIN');
    const reference=(await client.query('SELECT publication_id FROM operations WHERE id=$1 AND (oferente_id=$2 OR demandante_id=$2)',[id,actor])).rows[0];
    if(!reference)throw new AppError({status:404,code:'OPERATION_NOT_FOUND',message:'Operación no encontrada.'});
    await client.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE',[reference.publication_id]);
    let operation=(await client.query('SELECT * FROM operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
    const users=(await client.query('SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE',[[operation.oferente_id,operation.demandante_id]])).rows;
    users.forEach(requireCurrentUser);
    if(!['Aceptada','Pendiente de pago/garantía','Lista para entrega','Entregada/Activa','Cerrada'].includes(operation.status))throw conflict('Primero se debe aceptar la solicitud. Una operación cancelada no admite coordinación.');
    if((await client.query('SELECT id FROM transactions WHERE operation_id=$1 LIMIT 1',[id])).rowCount)throw conflict('Esta coordinación pertenece al piloto sin pagos. La operación económica requiere su flujo de entrega específico.');
    await client.query('INSERT INTO operation_handoffs(operation_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
    const row=(await client.query('SELECT * FROM operation_handoffs WHERE operation_id=$1 FOR UPDATE',[id])).rows[0];
    if(row.revision!==data.revision)throw conflict('La propuesta cambió. Actualiza las operaciones antes de confirmar.');
    const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const owner=actor===operation.oferente_id;
    const otpRequired=Boolean(operation.contract_snapshot?.workflow_payment);
    if(data.action==='confirm-return'&&(await client.query("SELECT id FROM incidences WHERE operation_id=$1 AND status NOT IN ('Resuelta','Desestimada') LIMIT 1",[id])).rowCount)throw conflict('Hay una incidencia pendiente. Administración debe resolverla antes de cerrar la operación; puedes registrar la devolución en el seguimiento del caso.');
    const paid=(await client.query('SELECT operation_id FROM operation_payment_simulations WHERE operation_id=$1',[id])).rowCount>0;
    if(['propose','agree','request-change'].includes(data.action)){
      if(!paid&&paymentDeadlinePassed(operation,now))throw conflict('Venció el plazo de la reserva para pagar.');
      if((await client.query("SELECT id FROM operation_finance_payments WHERE operation_id=$1 AND superseded_at IS NULL AND status='pending'",[id])).rowCount)
        throw conflict('Hay un pago de prueba pendiente de confirmación. Concílialo antes de cambiar el acuerdo.');
    }
    let changed=true;
    if(data.action==='propose') {
      const meeting=new Date(data.meeting_at);
      if(!['Aceptada','Pendiente de pago/garantía','Lista para entrega'].includes(operation.status)||row.owner_delivered_at||row.requester_received_at)throw conflict('La entrega ya fue declarada; no se puede cambiar el acuerdo.');
      if(meeting<=now||meeting.getTime()>now.getTime()+366*86400000||(operation.end_date&&meeting>=operation.end_date))throw conflict('Elige una fecha futura dentro del próximo año y anterior al fin del período solicitado.');
      if(operation.modality!=='Venta'&&operation.start_date&&meeting>=operation.start_date)throw conflict('La entrega debe programarse antes del inicio del alquiler o préstamo. Si ese inicio ya pasó, deben revisar las fechas del pedido.');
      await client.query(`UPDATE operation_handoffs SET revision=revision+1,proposed_by=$2,meeting_at=$3,location=$4,notes=$5,agreed_by=NULL,change_requested=false,updated_at=$6,delivery_otp=NULL,delivery_otp_expires_at=NULL,delivery_otp_attempts=0 WHERE operation_id=$1`,[id,actor,meeting,data.location,data.notes,now]);
      operation=(await client.query("UPDATE operations SET status='Aceptada',updated_at=$2 WHERE id=$1 RETURNING *",[id,now])).rows[0];
    } else if(data.action==='agree'||data.action==='request-change') {
      if(!['Aceptada','Pendiente de pago/garantía','Lista para entrega'].includes(operation.status)||row.owner_delivered_at||row.requester_received_at)throw conflict('La entrega ya fue declarada.');
      if(row.proposed_by===actor)throw conflict('La otra persona debe responder a tu propuesta.');
      if(data.action==='agree'&&row.change_requested)throw conflict('Se pidió un cambio; debe enviarse una nueva propuesta.');
      if(data.action==='agree'&&(row.meeting_at<=now||(operation.modality!=='Venta'&&operation.start_date&&row.meeting_at>=operation.start_date)))throw conflict('El encuentro debe ser futuro y anterior al inicio del alquiler o préstamo. Solicita una nueva propuesta o revisen las fechas del pedido.');
      await client.query('UPDATE operation_handoffs SET agreed_by=$2,change_requested=$3,updated_at=$4 WHERE operation_id=$1',[id,data.action==='agree'?actor:null,data.action==='request-change',now]);
      operation=(await client.query('UPDATE operations SET status=$2,updated_at=$3 WHERE id=$1 RETURNING *',[id,data.action==='agree'?(paid?'Lista para entrega':'Pendiente de pago/garantía'):'Aceptada',now])).rows[0];
    } else if(['record-return','inspect-return','accept-inspection','confirm-return-receipt'].includes(data.action)){
      if(!otpRequired||operation.modality!=='Alquiler'||!row.owner_delivered_at||!row.requester_received_at)throw conflict('Solo se registra una devolución después de entregar el alquiler.');
      const settlement=await findReturnSettlement(client,id);
      if(data.action==='record-return'){
        if(owner||operation.status!=='Entregada/Activa'||settlement)throw conflict('El comprador registra la devolución física una sola vez.');
        if(data.returned_at&&(new Date(data.returned_at)<row.requester_received_at||new Date(data.returned_at)>now))
          throw conflict('Indica una fecha real de devolución entre la entrega y el momento actual.');
        await recordReturn(client,operation,data,now);
      } else if(data.action==='inspect-return'){
        if(!owner||operation.status!=='Entregada/Activa'||!settlement||settlement.proposed_cents!==null)throw conflict('El oferente puede inspeccionar solo una devolución ya registrada.');
        if(data.inspected_at&&(new Date(data.inspected_at)<(settlement.return_at??row.requester_returned_at)||new Date(data.inspected_at)>now))
          throw conflict('Indica una fecha real de inspección entre la devolución y el momento actual.');
        const retention=BigInt(data.retention_cents);
        const outcome=data.inspection_result??(retention>0n?'danos':'conforme');
        if((outcome==='conforme')!==(retention===0n))throw conflict('La inspección conforme tiene importe cero. Para daños o faltantes, indica el importe reclamado.');
        if(outcome!=='conforme'&&!(await client.query("SELECT id FROM operation_return_evidence WHERE operation_id=$1 AND phase='inspection' LIMIT 1",[id])).rowCount)
          throw conflict('Adjunta una foto de los daños o faltantes antes de proponer la retención.');
        await client.query(`UPDATE operation_return_settlements SET inspection_notes=$2,proposed_cents=$3,inspected_at=$4,
          inspection_result=$5,inspection_accessories_confirmed=$6 WHERE operation_id=$1`,
        [id,data.notes,data.retention_cents,data.inspected_at??now,outcome,data.accessories_confirmed??null]);
        await client.query('UPDATE operation_handoffs SET owner_returned_at=$2,updated_at=$2 WHERE operation_id=$1',[id,now]);
      } else if(data.action==='accept-inspection'){
        if(owner)throw conflict('El comprador debe revisar el acta y aceptar el reparto.');
        await closeReturnSettlement(client,operation,settlement,settlement?.proposed_cents,actor);
        operation=(await client.query('SELECT * FROM operations WHERE id=$1',[id])).rows[0];
      } else {
        await confirmReturnReceipt(client,operation,settlement,owner,actor);
        changed=false;
      }
    } else if(['confirm-delivery','generate-delivery-code','regenerate-delivery-code','verify-delivery-code'].includes(data.action)) {
      if(!row.agreed_by||row.change_requested||row.meeting_at>now)throw conflict('Ambos deben acordar la entrega y esperar al horario pactado antes de confirmarla.');
      if(!paid||!['Lista para entrega','Entregada/Activa'].includes(operation.status))throw conflict('Primero coordina la entrega y completa el pago simulado del piloto. No hay cobro real.');
      const windowEnd=otpRequired?deliveryWindowEnd(row.meeting_at,operation.end_date):null;
      if(windowEnd&&now>=windowEnd)throw conflict('Terminó la ventana del encuentro. Reporta la inasistencia o acuerda una nueva entrega.');
      if(data.action==='generate-delivery-code'||data.action==='regenerate-delivery-code'){
        if(!otpRequired||owner||operation.status!=='Lista para entrega')throw conflict('El código corresponde al comprador y solo se genera durante la entrega.');
        const live=row.delivery_otp_expires_at>now;
        if(live&&row.delivery_otp_attempts>=otpAttempts())throw conflict('Código bloqueado. Espera a que venza para generar otro.');
        if(!live||data.action==='regenerate-delivery-code'){
          let code;
          do { code=String(randomInt(0,1000000)).padStart(6,'0'); } while(code===row.delivery_otp);
          await client.query(`UPDATE operation_handoffs SET delivery_otp=$2,delivery_otp_expires_at=$3,
            delivery_otp_attempts=$4 WHERE operation_id=$1`,[id,code,otpExpiry(now,windowEnd),live?row.delivery_otp_attempts:0]);
          await appendAudit(client,{actorId:actor,action:`handoff.${data.action}`,entityType:'operation',entityId:id,
            newValues:{revision:row.revision,accessories_confirmed:data.accessories_confirmed??null}});
        }
        const result={operation:await projectOperation(client,operation,actor)};
        await client.query('COMMIT');return result;
      }
      if((await client.query(`SELECT o.id FROM operations o LEFT JOIN operation_handoffs h ON h.operation_id=o.id
        WHERE o.publication_id=$1 AND o.id<>$2 AND (
          (o.status IN ('Aceptada','Lista para entrega','Entregada/Activa') AND (h.owner_delivered_at IS NOT NULL OR h.requester_received_at IS NOT NULL)
           AND NOT (h.owner_returned_at IS NOT NULL AND h.requester_returned_at IS NOT NULL))
          OR EXISTS(SELECT 1 FROM reservations r WHERE r.operation_id=o.id AND r.status='Activa/En uso')) LIMIT 1`,[operation.publication_id,id])).rowCount)throw conflict('El artículo tiene una entrega declarada en otra operación; primero debe resolverse o confirmarse su devolución.');
      if(data.action==='verify-delivery-code'){
        if(!otpRequired||!owner||operation.status!=='Lista para entrega')throw conflict('Solo el oferente puede validar el código de esta entrega.');
        if(!row.delivery_otp_expires_at||row.delivery_otp_expires_at<=now||row.delivery_otp_attempts>=otpAttempts())throw conflict('El código no está vigente. Pide al comprador un código válido.');
        if(data.code!==row.delivery_otp){
          await client.query('UPDATE operation_handoffs SET delivery_otp_attempts=delivery_otp_attempts+1 WHERE operation_id=$1',[id]);
          const result={operation:await projectOperation(client,operation,actor),handoff_error:'El código es incorrecto. Verifica los seis dígitos con el comprador.'};
          await client.query('COMMIT');
          return result;
        }
        if((await client.query("SELECT 1 FROM incidences WHERE operation_id=$1 AND status NOT IN ('Resuelta','Desestimada') LIMIT 1",[id])).rowCount)throw conflict('Resuelve la incidencia pendiente antes de validar la entrega.');
        await client.query(`UPDATE operation_handoffs SET owner_delivered_at=$2,requester_received_at=$2,updated_at=$2,
          delivery_otp=NULL,delivery_otp_expires_at=NULL,delivery_otp_attempts=0 WHERE operation_id=$1`,[id,now]);
        const status=operation.modality==='Venta'?'Cerrada':'Entregada/Activa';
        operation=(await client.query("UPDATE operations SET status=$3,updated_at=$2 WHERE id=$1 RETURNING *",[id,now,status])).rows[0];
        await client.query("UPDATE reservations SET status='Activa/En uso' WHERE operation_id=$1 AND status='Reservada/Bloqueada'",[id]);
        if(status==='Cerrada')await createTestPayout(client,operation);
      } else {
      if(otpRequired)throw conflict('Completa la entrega con el código de un solo uso.');
      const field=owner?'owner_delivered_at':'requester_received_at';
      changed=!row[field];
      if(changed)await client.query(`UPDATE operation_handoffs SET ${field}=$2,updated_at=$2 WHERE operation_id=$1`,[id,now]);
      if((owner&&row.requester_received_at)||(!owner&&row.owner_delivered_at)) {
        operation=(await client.query("UPDATE operations SET status='Entregada/Activa',updated_at=$2 WHERE id=$1 RETURNING *",[id,now])).rows[0];
        await client.query("UPDATE reservations SET status='Activa/En uso' WHERE operation_id=$1 AND status='Reservada/Bloqueada'",[id]);
      }
      }
    } else {
      if(otpRequired)throw conflict('Registra la devolución y revisa el acta en el recorrido de esta operación.');
      if(operation.modality==='Venta'||!row.owner_delivered_at||!row.requester_received_at||!['Entregada/Activa','Cerrada'].includes(operation.status))throw conflict('Solo se confirma la devolución de un alquiler o préstamo entregado.');
      const field=owner?'owner_returned_at':'requester_returned_at';
      changed=!row[field];
      if(changed)await client.query(`UPDATE operation_handoffs SET ${field}=$2,updated_at=$2 WHERE operation_id=$1`,[id,now]);
      if((owner&&row.requester_returned_at)||(!owner&&row.owner_returned_at)) {
        operation=(await client.query("UPDATE operations SET status='Cerrada',updated_at=$2 WHERE id=$1 RETURNING *",[id,now])).rows[0];
        await client.query("UPDATE reservations SET status='Disponible',released_at=$2,release_reason='Devolución confirmada por ambos participantes' WHERE operation_id=$1 AND status='Activa/En uso'",[id,now]);
      }
    }
    if(changed) {
      const meetingText=data.action==='propose'?`Propuso un encuentro el ${new Date(data.meeting_at).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'})} (Perú), en ${data.location}. La otra persona debe confirmar.`:null;
      const body=meetingText||({
        agree:paid?'Confirmó el nuevo encuentro. El pago de prueba ya estaba registrado.':'Confirmó el encuentro. El comprador puede continuar al pago de prueba.',
        'request-change':'Pidió cambiar el lugar u horario. Deben enviar una nueva propuesta.',
        'verify-delivery-code':'El oferente validó el código de entrega presencial.',
        'confirm-delivery':operation.status==='Entregada/Activa'?'Ambos confirmaron la entrega del artículo.':'Confirmó su parte de la entrega. Falta la confirmación de la otra persona.',
        'confirm-return':operation.status==='Cerrada'?'Ambos confirmaron la devolución. El trato está finalizado.':'Confirmó su parte de la devolución. Falta la otra persona.',
        'record-return':'El comprador registró la devolución física.',
        'inspect-return':'El oferente registró la inspección. Revisa el acta y el reparto propuesto en la operación.',
        'accept-inspection':'El comprador aceptó el acta de devolución.',
      })[data.action];
      await appendConversationEvent(client,operation,actor,{type:`handoff.${data.action}`,key:`handoff:${data.action}:${data.action==='propose'?row.revision+1:row.revision}:${actor}`,body});
      await appendAudit(client,{actorId:actor,action:`handoff.${data.action}`,entityType:'operation',entityId:id,
        newValues:{revision:data.action==='propose'?row.revision+1:row.revision,status:operation.status,
          ...(data.action==='verify-delivery-code'?{accessories_confirmed:data.accessories_confirmed??null}:{})}});
      await enqueueOutboxEvent(client,{aggregateType:'operation',aggregateId:id,eventType:`handoff.${data.action}`,payload:{operationId:id},deduplicationKey:`handoff:${id}:${data.action}:${data.action==='propose'?row.revision+1:row.revision}:${actor}:${now.toISOString()}`});
    }
    const result={operation:await projectOperation(client,operation,actor)};
    await client.query('COMMIT');return result;
  } catch(error) { await client.query('ROLLBACK');throw error; }
  finally {client.release();}
}
