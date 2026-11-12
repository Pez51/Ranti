import { z } from 'zod';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';
import { provenanceMime } from '../publications/provenance-files.js';
import { appendConversationEvent } from './conversation-events.js';
import { transferEligibility } from './finance.service.js';
import { closeReturnSettlement, findReturnSettlement, returnSettlementView } from './return-settlement.js';
import { issueTestRefund, refundOptions, testRefundView } from './test-money-movements.js';
import { returnEvidenceFile, returnEvidenceList } from './return-evidence.js';
import { receivableMovements } from './receivable-movements.js';
import { incidenceError,pendingIncidence,reportPolicy,reportWindowDays,reportSchema,replySchema,adminIncidenceSchema } from './incidence.policy.js';
const missing=()=>incidenceError(404,'Caso u operación no encontrado.');
const uuid=id=>{if(!z.uuid().safeParse(id).success)throw missing();};
async function tx(db,work){const c=await db.connect();try{await c.query('BEGIN');const r=await work(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function accessOperation(c,id,actor,admin=false){
 uuid(id);
 const ref=(await c.query('SELECT publication_id FROM operations WHERE id=$1',[id])).rows[0];if(!ref)throw missing();
 await c.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE',[ref.publication_id]);
 const op=(await c.query('SELECT * FROM operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
 const user=requireCurrentUser((await c.query('SELECT * FROM users WHERE id=$1 FOR SHARE',[actor])).rows[0]);
 if(admin?user.role!=='Administrador':actor!==op.oferente_id&&actor!==op.demandante_id)throw missing();
 return op;
}
async function accessCase(c,id,actor,admin=false){
 uuid(id);const ref=(await c.query('SELECT operation_id FROM incidences WHERE id=$1',[id])).rows[0];if(!ref?.operation_id)throw missing();
 const op=await accessOperation(c,ref.operation_id,actor,admin);
 const item=(await c.query('SELECT * FROM incidences WHERE id=$1 FOR UPDATE',[id])).rows[0];return {op,item};
}
async function effect(c,op){
 const payment=(await c.query('SELECT * FROM operation_finance_payments WHERE operation_id=$1 AND superseded_at IS NULL',[op.id])).rows[0];
 const transfer=await transferEligibility(c,op,payment);
 const pending=(await c.query("SELECT count(*)::int AS total FROM incidences WHERE operation_id=$1 AND status NOT IN ('Resuelta','Desestimada')",[op.id])).rows[0].total;
 return {pending_count:pending,closure_blocked:pending>0,disbursement_blocked:pending>0&&transfer.status!=='confirmed',transfer,
  money_notice:transfer.status==='confirmed'?'El desembolso ya figura registrado. Este reporte no lo revierte automáticamente; administración debe evaluar el caso.':pending?'El cierre y el desembolso quedan bloqueados mientras haya incidencias pendientes. No se ejecuta ningún reembolso automático.':'Sin incidencias pendientes. Se mantienen los demás requisitos de cierre y desembolso; no se ejecuta ningún movimiento automáticamente.'};
}
async function history(c,item,actor,kind,body,decision=null){
 const event=(await c.query('INSERT INTO incidence_events(incidence_id,actor_id,kind,body,status,decision) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,kind',[item.id,actor,kind,body,item.status,decision])).rows[0];
 await appendAudit(c,{actorId:actor,action:`incidence.${kind}`,entityType:'incidence',entityId:item.id,newValues:{status:item.status,revision:item.revision,decision}});
 return event;
}
async function notice(c,op,actor,item,event,body){
 await appendConversationEvent(c,op,actor,{type:`incidence.${event.kind||'updated'}`,key:`incidence:${item.id}:${event.id}`,body:`Caso ${item.id.slice(0,8)}: ${body}`});
}
async function detail(c,op,item,actorId,admin=false,before){
 if(before!==undefined&&(!/^[1-9]\d{0,18}$/.test(String(before))||BigInt(before)>9223372036854775807n))throw incidenceError(400,'Cursor inválido.');
 const events=(await c.query(`SELECT e.id,e.actor_id,u.display_name AS actor_name,u.role AS actor_role,e.kind,e.body,e.status,e.decision,e.created_at
 FROM incidence_events e JOIN users u ON u.id=e.actor_id WHERE e.incidence_id=$1 AND ($2::bigint IS NULL OR e.id<$2) ORDER BY e.id DESC LIMIT 201`,[item.id,before??null])).rows;
 const files=(await c.query('SELECT id,uploaded_by,name,mime,octet_length(bytes) AS size,created_at FROM incidence_evidence WHERE incidence_id=$1 ORDER BY created_at,id',[item.id])).rows;
 const p=(await c.query('SELECT title FROM publications WHERE id=$1',[op.publication_id])).rows[0];
 const settlement=op.modality==='Alquiler'&&op.contract_snapshot?.workflow_payment&&item.type==='guarantee'?await findReturnSettlement(c,op.id):null;
 const refund=await testRefundView(c,op,admin||actorId===op.demandante_id);
 const options=admin&&pendingIncidence(item.status)?await refundOptions(c,op,item):null;
 const movement=item.movement_reference?(await receivableMovements(c,op,item.reporter_id)).find(entry=>entry.reference===item.movement_reference):null;
 return {case:item,operation:{id:op.id,status:op.status,modality:op.modality,title:op.contract_snapshot?.title||p.title,owner_id:op.oferente_id,requester_id:op.demandante_id,closed_at:op.closed_at},events:events.slice(0,200).reverse(),history_before:events.length>200?String(events[199].id):null,evidence:files,effect:await effect(c,op),...(settlement?{
  return_settlement:returnSettlementView(settlement,op,actorId,admin),return_evidence:await returnEvidenceList(c,op.id),
 }:{}),refund,refund_options:options,movement:admin||actorId===item.reporter_id?movement:null};
}
async function outstandingMovements(c,op,actor,now){
 const days=reportWindowDays();
 return (await receivableMovements(c,op,actor)).filter(item=>!item.received_at&&now-new Date(item.sent_at)<=days*86400000);
}
export async function listOperationIncidences(db,id,actor){return tx(db,async c=>{
 const op=await accessOperation(c,id,actor),h=(await c.query('SELECT * FROM operation_handoffs WHERE operation_id=$1',[id])).rows[0];
 const cases=(await c.query('SELECT id,reporter_id,type,status,revision,created_at,resolution_action,system_generated FROM incidences WHERE operation_id=$1 ORDER BY created_at DESC,id',[id])).rows;
 const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
 const movements=await outstandingMovements(c,op,actor,now);
 return {items:cases,policy:reportPolicy(op,h,now,movements.length>0),effect:await effect(c,op),movements};
});}
export async function openIncidence(db,id,actor,input){
 const parsed=reportSchema.safeParse(input);if(!parsed.success)throw incidenceError(400,'Elige un motivo y describe el problema en 10 a 3000 caracteres.');
 return tx(db,async c=>{
  const op=await accessOperation(c,id,actor),h=(await c.query('SELECT * FROM operation_handoffs WHERE operation_id=$1',[id])).rows[0];
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
  const data=parsed.data;
  const movement=data.movement_reference?(await outstandingMovements(c,op,actor,now)).find(entry=>entry.reference===data.movement_reference):null;
  const policy=reportPolicy(op,h,now,Boolean(movement));
  if(!policy.allowed)throw incidenceError(409,'Esta operación no admite reportes o venció el plazo posterior al cierre.');
  if(!policy.reasons.some(r=>r.id===data.reason))throw incidenceError(400,'El motivo o movimiento no está disponible para esta operación.');
  const date=data.occurred_at?new Date(data.occurred_at):null;
  const earliest=movement?.sent_at??(['delivery_absence','delivery_not_validated'].includes(data.reason)?h.meeting_at:op.created_at);
  if(date&&(date>now||date<earliest))throw incidenceError(400,'Revisa la fecha del hecho. Debe corresponder al encuentro o movimiento y no estar en el futuro.');
  if((await c.query(`SELECT id FROM incidences WHERE operation_id=$1 AND reporter_id=$2
    AND movement_reference IS NOT DISTINCT FROM $3::text AND status NOT IN ('Resuelta','Desestimada')`,
  [id,actor,data.movement_reference??null])).rowCount)throw incidenceError(409,'Ya tienes un caso pendiente. Añade tu información al expediente.');
  const item=(await c.query(`INSERT INTO incidences(operation_id,reporter_id,reported_id,type,description,stage_at_report,occurred_at,movement_reference)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[id,actor,actor===op.oferente_id?op.demandante_id:op.oferente_id,
    data.reason,data.description,policy.stage,date,data.movement_reference??null])).rows[0];
  const event=await history(c,item,actor,'opened',data.description);
  await notice(c,op,actor,item,event,'Se abrió una incidencia. Consulta el seguimiento en el detalle de la operación. No se realizará un desembolso ni cierre mientras esté pendiente.');
  return detail(c,op,item,actor);
 });
}
export async function readIncidence(db,id,actor,admin=false,before){return tx(db,async c=>{const {op,item}=await accessCase(c,id,actor,admin);return detail(c,op,item,actor,admin,before);});}
export async function replyIncidence(db,id,actor,input,admin=false){
 const parsed=replySchema.safeParse(input);if(!parsed.success)throw incidenceError(400,'Escribe una respuesta de hasta 3000 caracteres y actualiza el caso.');
 return tx(db,async c=>{
  const {op,item}=await accessCase(c,id,actor,admin);
  if(!pendingIncidence(item.status))throw incidenceError(409,'El caso ya está resuelto; no se modifica su historial.');
  if(item.revision!==parsed.data.revision)throw incidenceError(409,'El caso cambió. Actualízalo antes de responder.');
  const answered=item.status==='Esperando respuesta'&&item.response_requested_from===actor;
  const updated=(await c.query('UPDATE incidences SET revision=revision+1,status=$2,response_requested_from=$3,updated_at=clock_timestamp() WHERE id=$1 RETURNING *',[id,answered?'En revisión':item.status,answered?null:item.response_requested_from])).rows[0];
  const event=await history(c,updated,actor,'reply',parsed.data.body);
  await notice(c,op,actor,updated,event,'Se añadió una respuesta al caso.');return detail(c,op,updated,actor,admin);
 });
}
export async function decideIncidence(db,id,actor,input){
 const parsed=adminIncidenceSchema.safeParse(input);if(!parsed.success)throw incidenceError(400,'Revisa la actuación, la decisión y su explicación.');const data=parsed.data;
 return tx(db,async c=>{
  const {op,item}=await accessCase(c,id,actor,true);
  if([op.oferente_id,op.demandante_id].includes(actor))throw incidenceError(403,'Un participante del trato no puede actuar como administrador de su propio caso. Debe revisarlo otro administrador.');
  if(!pendingIncidence(item.status)||item.revision!==data.revision)throw incidenceError(409,'El caso cambió o ya fue resuelto. Actualiza antes de decidir.');
  const resolvesGuarantee=data.action==='resolve'&&data.decision==='settle_guarantee';
  const refundsPayment=data.action==='resolve'&&data.decision==='refund_payment';
  if(refundsPayment&&['delivery_absence','delivery_not_validated'].includes(item.type)&&
    !(await c.query('SELECT id FROM incidence_evidence WHERE incidence_id=$1 LIMIT 1',[id])).rowCount){
   throw incidenceError(409,'Adjunta evidencia del encuentro antes de resolver el incumplimiento.');
  }
  if(resolvesGuarantee&&(item.type!=='guarantee'||op.modality!=='Alquiler'||!op.contract_snapshot?.workflow_payment)){
   throw incidenceError(409,'Este caso no corresponde a una garantía de prueba pendiente.');
  }
  if(data.action==='request_information'&&![op.oferente_id,op.demandante_id].includes(data.target_id))throw incidenceError(400,'Solicita información a uno de los participantes del trato.');
  if(data.action==='resolve'&&data.decision==='cancel_operation'){
   const payments=(await c.query(`SELECT 1 FROM operation_finance_payments WHERE operation_id=$1 AND superseded_at IS NULL AND status<>'failed'
    UNION ALL SELECT 1 FROM operation_payment_simulations WHERE operation_id=$1
    UNION ALL SELECT 1 FROM transactions WHERE operation_id=$1
    UNION ALL SELECT 1 FROM operation_finance_transfers WHERE operation_id=$1 AND status IN ('pending','confirmed')`,[op.id])).rowCount;
   const h=(await c.query('SELECT * FROM operation_handoffs WHERE operation_id=$1',[op.id])).rows[0];
   const otherPending=(await c.query("SELECT id FROM incidences WHERE operation_id=$1 AND id<>$2 AND status NOT IN ('Resuelta','Desestimada')",[op.id,id])).rowCount;
   if(payments||h?.owner_delivered_at||h?.requester_received_at||otherPending||!['Pendiente','Aceptada','Pendiente de pago/garantía','Lista para entrega'].includes(op.status))throw incidenceError(409,'No se puede cancelar automáticamente: hay entrega, dinero registrado, otro caso pendiente o un estado incompatible. Registra una resolución sin movimiento económico y gestiona lo pendiente por separado.');
  }
  const status=data.action==='resolve'?'Resuelta':data.action==='review'?'En revisión':'Esperando respuesta';
  const updated=(await c.query(`UPDATE incidences SET status=$2,revision=revision+1,response_requested_from=$3,
   resolution_action=$4,resolution_notes=$5,resolved_by=$6,resolved_at=CASE WHEN $6::uuid IS NOT NULL THEN clock_timestamp() ELSE NULL END,
   guarantee_outcome=$7,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
   [id,status,data.action==='request_information'?data.target_id:null,data.action==='resolve'?data.decision:null,data.action==='resolve'?data.body:null,
    data.action==='resolve'?actor:null,resolvesGuarantee?(data.guarantee_outcome??(BigInt(data.retention_cents)===0n?'dismissed':'proceeds')):null])).rows[0];
  if(data.action==='resolve'&&data.decision==='cancel_operation'){
   await c.query("UPDATE operations SET status='Cancelada',cancelled_at=clock_timestamp(),cancelled_by=$3,incidence_cancelled_by=$3,cancellation_reason=$2,updated_at=clock_timestamp() WHERE id=$1",[op.id,`Resolución administrativa del caso ${id}`,actor]);
   await c.query("UPDATE reservations SET status='Disponible',released_at=clock_timestamp(),release_reason=$2 WHERE operation_id=$1 AND status IN ('Bloqueo Provisional','Reservada/Bloqueada')",[op.id,`Resolución administrativa del caso ${id}`]);
   op.status='Cancelada';
  }
  if(resolvesGuarantee){
   await closeReturnSettlement(c,op,await findReturnSettlement(c,op.id),data.retention_cents,actor);
   Object.assign(op,(await c.query('SELECT * FROM operations WHERE id=$1',[op.id])).rows[0]);
  }
  if(refundsPayment){
   await issueTestRefund(c,op,item,data.refund_cents,actor);
   Object.assign(op,(await c.query('SELECT * FROM operations WHERE id=$1',[op.id])).rows[0]);
  }
  const event=await history(c,updated,actor,data.action==='resolve'?'resolved':data.action,data.body,data.action==='resolve'?data.decision:null);
  const body=resolvesGuarantee?'Administración resolvió el reparto de la garantía de prueba. Consulta los importes en la operación.':
   refundsPayment?'Administración registró la devolución del pago de prueba. Consulta el importe y la referencia en la operación.':
   data.action==='resolve'?`Administración resolvió la incidencia (${data.decision==='cancel_operation'?'cancelar operación sin pagos ni entrega':data.decision==='continue_operation'?'continuar con las condiciones acordadas':'registrar resolución sin cambiar la operación'}). No implica reembolso ni transferencia automática.`:data.action==='review'?'Administración inició la revisión.':'Administración solicitó información a un participante. Revisa el seguimiento del caso.';
  await notice(c,op,actor,updated,event,body);return detail(c,op,updated,actor,true);
 });
}
export async function listAdminIncidences(db,actor,offset=0){
 if(!Number.isInteger(offset)||offset<0||offset>10000)throw incidenceError(400,'Página inválida.');
 const user=requireCurrentUser((await db.query('SELECT * FROM users WHERE id=$1',[actor])).rows[0]);if(user.role!=='Administrador')throw missing();
 return {items:(await db.query(`SELECT i.id,i.operation_id,i.type,i.status,i.created_at,i.revision,p.title,o.modality,
  CASE WHEN i.system_generated THEN 'Sistema' ELSE u.display_name END AS reporter_name
  FROM incidences i JOIN operations o ON o.id=i.operation_id JOIN publications p ON p.id=o.publication_id JOIN users u ON u.id=i.reporter_id
  ORDER BY (i.status IN ('Resuelta','Desestimada')),i.updated_at DESC,i.id LIMIT 20 OFFSET $1`,[offset])).rows,offset,limit:20};
}
export async function uploadIncidenceEvidence(db,id,actor,bytes,contentType,name,admin=false){
 const mime=provenanceMime(bytes);
 if(!mime||mime!==contentType?.split(';')[0]||!z.string().trim().min(1).max(180).safeParse(name).success)throw incidenceError(400,'Adjunta JPEG, PNG o WebP de hasta 2 MB, o PDF de hasta 5 MB, con un nombre válido.');
 return tx(db,async c=>{
  const {op,item}=await accessCase(c,id,actor,admin);if(!pendingIncidence(item.status))throw incidenceError(409,'El caso está resuelto; sus evidencias no se modifican.');
  if((await c.query('SELECT id FROM incidence_evidence WHERE incidence_id=$1',[id])).rowCount>=5)throw incidenceError(409,'Cada caso admite hasta cinco evidencias.');
  const file=(await c.query('INSERT INTO incidence_evidence(incidence_id,uploaded_by,name,mime,bytes) VALUES($1,$2,$3,$4,$5) RETURNING id,name,mime',[id,actor,name.trim(),mime,bytes])).rows[0];
  const updated=(await c.query('UPDATE incidences SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *',[id])).rows[0];
  const event=await history(c,updated,actor,'evidence',`Se adjuntó evidencia: ${file.name}`);
  await notice(c,op,actor,updated,event,'Se adjuntó evidencia privada al caso.');return file;
 });
}
export async function downloadIncidenceEvidence(db,id,fileId,actor,admin=false){
 uuid(fileId);return tx(db,async c=>{
  const {item}=await accessCase(c,id,actor,admin);
  const file=(await c.query('SELECT name,mime,bytes FROM incidence_evidence WHERE id=$1 AND incidence_id=$2',[fileId,item.id])).rows[0];if(!file)throw missing();
  await appendAudit(c,{actorId:actor,action:'incidence.evidence.downloaded',entityType:'incidence',entityId:id,newValues:{file_id:fileId}});return file;
 });
}
export function downloadCaseReturnEvidence(db,id,fileId,actor){
 return tx(db,async c=>{
  const {op,item}=await accessCase(c,id,actor,true);
  if(op.modality!=='Alquiler'||item.type!=='guarantee')throw missing();
  return returnEvidenceFile(c,op.id,actor,fileId);
 });
}
