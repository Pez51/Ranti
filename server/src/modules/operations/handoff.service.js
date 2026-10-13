import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { projectOperation } from './operation-request.service.js';
import { appendConversationEvent } from './conversation-events.js';

const schema = z.discriminatedUnion('action', [
  z.object({action:z.literal('propose'),revision:z.number().int().min(0),meeting_at:z.iso.datetime({offset:true}),location:z.string().trim().min(3).max(200),notes:z.string().trim().max(500).default('')}).strict(),
  ...['agree','request-change','confirm-delivery','confirm-return'].map(action=>z.object({action:z.literal(action),revision:z.number().int().min(1)}).strict()),
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
    const paid=(await client.query('SELECT operation_id FROM operation_payment_simulations WHERE operation_id=$1',[id])).rowCount>0;
    let changed=true;
    if(data.action==='propose') {
      const meeting=new Date(data.meeting_at);
      if(!['Aceptada','Pendiente de pago/garantía','Lista para entrega'].includes(operation.status)||row.owner_delivered_at||row.requester_received_at)throw conflict('La entrega ya fue declarada; no se puede cambiar el acuerdo.');
      if(meeting<=now||meeting.getTime()>now.getTime()+366*86400000||(operation.end_date&&meeting>=operation.end_date))throw conflict('Elige una fecha futura dentro del próximo año y anterior al fin del período solicitado.');
      if(operation.modality!=='Venta'&&operation.start_date&&meeting>=operation.start_date)throw conflict('La entrega debe programarse antes del inicio del alquiler o préstamo. Si ese inicio ya pasó, deben revisar las fechas del pedido.');
      await client.query(`UPDATE operation_handoffs SET revision=revision+1,proposed_by=$2,meeting_at=$3,location=$4,notes=$5,agreed_by=NULL,change_requested=false,updated_at=$6 WHERE operation_id=$1`,[id,actor,meeting,data.location,data.notes,now]);
      operation=(await client.query("UPDATE operations SET status='Aceptada',updated_at=$2 WHERE id=$1 RETURNING *",[id,now])).rows[0];
    } else if(data.action==='agree'||data.action==='request-change') {
      if(!['Aceptada','Pendiente de pago/garantía','Lista para entrega'].includes(operation.status)||row.owner_delivered_at||row.requester_received_at)throw conflict('La entrega ya fue declarada.');
      if(row.proposed_by===actor)throw conflict('La otra persona debe responder a tu propuesta.');
      if(data.action==='agree'&&row.change_requested)throw conflict('Se pidió un cambio; debe enviarse una nueva propuesta.');
      if(data.action==='agree'&&(row.meeting_at<=now||(operation.modality!=='Venta'&&operation.start_date&&row.meeting_at>=operation.start_date)))throw conflict('El encuentro debe ser futuro y anterior al inicio del alquiler o préstamo. Solicita una nueva propuesta o revisen las fechas del pedido.');
      await client.query('UPDATE operation_handoffs SET agreed_by=$2,change_requested=$3,updated_at=$4 WHERE operation_id=$1',[id,data.action==='agree'?actor:null,data.action==='request-change',now]);
      operation=(await client.query('UPDATE operations SET status=$2,updated_at=$3 WHERE id=$1 RETURNING *',[id,data.action==='agree'?(paid?'Lista para entrega':'Pendiente de pago/garantía'):'Aceptada',now])).rows[0];
    } else if(data.action==='confirm-delivery') {
      if(!row.agreed_by||row.change_requested||row.meeting_at>now)throw conflict('Ambos deben acordar la entrega y esperar al horario pactado antes de confirmarla.');
      if(!paid||!['Lista para entrega','Entregada/Activa'].includes(operation.status))throw conflict('Primero coordina la entrega y completa el pago simulado del piloto. No hay cobro real.');
      if((await client.query(`SELECT o.id FROM operations o LEFT JOIN operation_handoffs h ON h.operation_id=o.id
        WHERE o.publication_id=$1 AND o.id<>$2 AND (
          (o.status IN ('Aceptada','Lista para entrega','Entregada/Activa') AND (h.owner_delivered_at IS NOT NULL OR h.requester_received_at IS NOT NULL)
           AND NOT (h.owner_returned_at IS NOT NULL AND h.requester_returned_at IS NOT NULL))
          OR EXISTS(SELECT 1 FROM reservations r WHERE r.operation_id=o.id AND r.status='Activa/En uso')) LIMIT 1`,[operation.publication_id,id])).rowCount)throw conflict('El artículo tiene una entrega declarada en otra operación; primero debe resolverse o confirmarse su devolución.');
      const field=owner?'owner_delivered_at':'requester_received_at';
      changed=!row[field];
      if(changed)await client.query(`UPDATE operation_handoffs SET ${field}=$2,updated_at=$2 WHERE operation_id=$1`,[id,now]);
      if((owner&&row.requester_received_at)||(!owner&&row.owner_delivered_at)) {
        operation=(await client.query("UPDATE operations SET status='Entregada/Activa',updated_at=$2 WHERE id=$1 RETURNING *",[id,now])).rows[0];
        await client.query("UPDATE reservations SET status='Activa/En uso' WHERE operation_id=$1 AND status='Reservada/Bloqueada'",[id]);
      }
    } else {
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
      const body=meetingText||({'agree':paid?'Confirmó el nuevo lugar y horario. El pago simulado ya estaba registrado; no se requiere repetirlo.':'Confirmó el lugar y horario. Ambos acordaron el encuentro; el solicitante puede continuar al pago simulado.','request-change':'Pidió cambiar el lugar u horario. Deben enviar una nueva propuesta.','confirm-delivery':operation.status==='Entregada/Activa'?'Ambos confirmaron la entrega del artículo.':'Confirmó su parte de la entrega. Falta la confirmación de la otra persona.','confirm-return':operation.status==='Cerrada'?'Ambos confirmaron la devolución. El trato está finalizado.':'Confirmó su parte de la devolución. Falta la otra persona.'})[data.action];
      await appendConversationEvent(client,operation,actor,{type:`handoff.${data.action}`,key:`handoff:${data.action}:${data.action==='propose'?row.revision+1:row.revision}:${actor}`,body});
      await appendAudit(client,{actorId:actor,action:`handoff.${data.action}`,entityType:'operation',entityId:id,newValues:{revision:data.action==='propose'?row.revision+1:row.revision,status:operation.status}});
      await enqueueOutboxEvent(client,{aggregateType:'operation',aggregateId:id,eventType:`handoff.${data.action}`,payload:{operationId:id},deduplicationKey:`handoff:${id}:${data.action}:${data.action==='propose'?row.revision+1:row.revision}:${actor}:${now.toISOString()}`});
    }
    const result={operation:await projectOperation(client,operation,actor)};
    await client.query('COMMIT');return result;
  } catch(error) { await client.query('ROLLBACK');throw error; }
  finally {client.release();}
}
