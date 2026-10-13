import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';

const fail=(status,message)=>new AppError({status,code:'CONVERSATION_ERROR',message});
const uuid=id=>{if(!z.uuid().safeParse(id).success)throw fail(400,'Identificador inválido.');};
async function tx(db,work){const c=await db.connect();try{await c.query('BEGIN');const r=await work(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function member(db,id,actor,lock=false){
  uuid(id);
  const row=(await db.query(`SELECT * FROM publication_conversations WHERE id=$1 AND (owner_id=$2 OR requester_id=$2)${lock?' FOR UPDATE':''}`,[id,actor])).rows[0];
  if(!row)throw fail(404,'Conversación no encontrada.');
  requireCurrentUser((await db.query('SELECT * FROM users WHERE id=$1',[actor])).rows[0]);
  return row;
}
export async function startConversation(db,publicationId,actor,requester=actor){
  uuid(publicationId);
  return tx(db,async c=>{
    const p=(await c.query('SELECT * FROM publications WHERE id=$1 FOR UPDATE',[publicationId])).rows[0];
    if(!p)throw fail(404,'Publicación no encontrada.');
    if(requester===p.owner_id)throw fail(400,'Consulta las conversaciones de tus interesados en Mis conversaciones.');
    if(requester!==actor && (p.owner_id!==actor || !(await c.query('SELECT id FROM operations WHERE publication_id=$1 AND oferente_id=$2 AND demandante_id=$3 LIMIT 1',[p.id,actor,requester])).rowCount))throw fail(404,'Operación no encontrada.');
    const users=(await c.query('SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE',[[requester,p.owner_id]])).rows;
    users.forEach(requireCurrentUser);
    const old=(await c.query('SELECT id FROM publication_conversations WHERE publication_id=$1 AND requester_id=$2',[p.id,requester])).rows[0];
    if(old)return old;
    if(p.status!=='Activa' && !(await c.query('SELECT id FROM operations WHERE publication_id=$1 AND demandante_id=$2 AND oferente_id=$3 LIMIT 1',[p.id,requester,p.owner_id])).rowCount)throw fail(409,'La publicación no admite nuevas consultas. Las conversaciones anteriores siguen en tu bandeja.');
    const row=(await c.query('INSERT INTO publication_conversations(publication_id,owner_id,requester_id) VALUES($1,$2,$3) RETURNING id',[p.id,p.owner_id,requester])).rows[0];
    await appendAudit(c,{actorId:actor,action:'conversation.started',entityType:'conversation',entityId:row.id,newValues:{publication_id:p.id}});
    return row;
  });
}
export async function startOperationConversation(db,id,actor){
  uuid(id);
  const row=(await db.query('SELECT publication_id,demandante_id FROM operations WHERE id=$1 AND (oferente_id=$2 OR demandante_id=$2)',[id,actor])).rows[0];
  if(!row)throw fail(404,'Operación no encontrada.');
  return startConversation(db,row.publication_id,actor,row.demandante_id);
}
export async function listConversations(db,actor,offset=0){
  if(!Number.isInteger(offset)||offset<0||offset>10000)throw fail(400,'Página inválida.');
  requireCurrentUser((await db.query('SELECT * FROM users WHERE id=$1',[actor])).rows[0]);
  return {items:(await db.query(`SELECT c.id,c.publication_id,p.title,c.updated_at,u.display_name AS counterpart_name,
    u.id AS counterpart_id,u.avatar_url AS counterpart_photo,(c.owner_id=$1) AS is_my_product,
    (SELECT image_url FROM publication_images WHERE publication_id=p.id ORDER BY position LIMIT 1) AS product_image,
    (SELECT left(body,100) FROM conversation_messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_message
    FROM publication_conversations c JOIN publications p ON p.id=c.publication_id
    JOIN users u ON u.id=CASE WHEN c.owner_id=$1 THEN c.requester_id ELSE c.owner_id END
    WHERE c.owner_id=$1 OR c.requester_id=$1 ORDER BY c.updated_at DESC,c.id LIMIT 20 OFFSET $2`,[actor,offset])).rows,offset,limit:20};
}
export async function readMessages(db,id,actor,before){
  return tx(db,async c=>{
    const conversation=await member(c,id,actor);
    if(before!==undefined&&(!/^[1-9]\d{0,18}$/.test(before)||BigInt(before)>9223372036854775807n))throw fail(400,'Cursor inválido.');
    const rows=(await c.query(`SELECT id,body,kind,event_type,operation_id,created_at,sender_id=$2 AS mine FROM conversation_messages WHERE conversation_id=$1 AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT 51`,[id,actor,before??null])).rows;
    const more=rows.length>50,items=rows.slice(0,50).reverse();
    const publication=(await c.query(`SELECT id,title,(SELECT image_url FROM publication_images WHERE publication_id=publications.id ORDER BY position LIMIT 1) AS image FROM publications WHERE id=$1`,[conversation.publication_id])).rows[0];
    const counterpart=(await c.query('SELECT id,display_name,avatar_url FROM users WHERE id=$1',[actor===conversation.owner_id?conversation.requester_id:conversation.owner_id])).rows[0];
    const deals=(await c.query(`SELECT o.id,o.status,o.modality,o.accepted_at,
      (o.status='Pendiente de pago/garantía' AND h.agreed_by IS NOT NULL AND NOT h.change_requested AND pay.operation_id IS NULL) AS payment_available
      FROM operations o LEFT JOIN operation_handoffs h ON h.operation_id=o.id LEFT JOIN operation_payment_simulations pay ON pay.operation_id=o.id
      WHERE o.publication_id=$1 AND o.demandante_id=$2 AND o.oferente_id=$3 AND o.accepted_at IS NOT NULL ORDER BY o.accepted_at DESC LIMIT 20`,[conversation.publication_id,conversation.requester_id,conversation.owner_id])).rows;
    return {items,before:more?String(items[0].id):null,publication,counterpart_name:counterpart?.display_name||'Usuario UCSM',counterpart,is_my_product:actor===conversation.owner_id,deals};
  });
}
export async function sendMessage(db,id,actor,input){
  const parsed=z.object({body:z.string().trim().min(1).max(1000).optional(),client_id:z.uuid(),kind:z.enum(['text','calendar_invitation']).default('text'),operation_id:z.uuid().optional()}).strict().safeParse(input);
  if(!parsed.success)throw fail(400,'Escribe de 1 a 1000 caracteres.');
  const data=parsed.data;
  if(data.kind==='text'?(!data.body||data.operation_id):(data.body!==undefined||!data.operation_id))throw fail(400,'Mensaje o invitación inválidos.');
  return tx(db,async c=>{
    const conversation=await member(c,id,actor);
    const users=(await c.query('SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE',[[conversation.owner_id,conversation.requester_id]])).rows;
    users.forEach(requireCurrentUser);
    // Match workflow lock order (users before conversation) to avoid a cycle
    // with transactional calendar/handoff notices sent at the same time.
    await c.query('SELECT id FROM publication_conversations WHERE id=$1 FOR UPDATE',[id]);
    const body=data.kind==='calendar_invitation'?'Te invito a elegir nuestros horarios disponibles y acordar el encuentro para entregar el artículo. La propuesta debe ser confirmada por ambos.':data.body;
    const previous=(await c.query('SELECT id,body,kind,operation_id,created_at,true AS mine FROM conversation_messages WHERE conversation_id=$1 AND sender_id=$2 AND client_id=$3',[id,actor,data.client_id])).rows[0];
    if(previous){if(previous.body!==body||previous.kind!==data.kind||previous.operation_id!==(data.operation_id??null))throw fail(409,'Ese envío ya existe con otro contenido.');return {message:previous};}
    if(data.kind==='calendar_invitation'){
      const operation=(await c.query(`SELECT id FROM operations WHERE id=$1 AND publication_id=$2 AND demandante_id=$3 AND oferente_id=$4
        AND accepted_at IS NOT NULL AND status IN ('Aceptada','Pendiente de pago/garantía','Lista para entrega')`,[data.operation_id,conversation.publication_id,conversation.requester_id,conversation.owner_id])).rows[0];
      if(!operation)throw fail(409,'La invitación requiere un trato aceptado de esta misma conversación.');
    }
    const message=(await c.query('INSERT INTO conversation_messages(conversation_id,sender_id,client_id,body,kind,operation_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,body,kind,operation_id,created_at,true AS mine',[id,actor,data.client_id,body,data.kind,data.operation_id??null])).rows[0];
    await c.query('UPDATE publication_conversations SET updated_at=clock_timestamp() WHERE id=$1',[id]);
    await appendAudit(c,{actorId:actor,action:'conversation.message.sent',entityType:'conversation',entityId:id,newValues:{message_id:String(message.id)}});
    await enqueueOutboxEvent(c,{aggregateType:'conversation',aggregateId:id,eventType:'conversation.message.sent',payload:{conversationId:id,messageId:String(message.id)},deduplicationKey:`conversation.message:${message.id}`});
    return {message};
  });
}
