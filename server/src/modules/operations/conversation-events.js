import { randomUUID } from 'node:crypto';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';

// Call only inside the transaction that commits the actual workflow change.
// No arbitrary client-supplied text or financial details enter these notices.
export async function appendConversationEvent(c,op,actor,{type,key,body}){
  await c.query(`INSERT INTO publication_conversations(publication_id,owner_id,requester_id)
    VALUES($1,$2,$3) ON CONFLICT(publication_id,requester_id) DO NOTHING`,[op.publication_id,op.oferente_id,op.demandante_id]);
  const chat=(await c.query('SELECT id FROM publication_conversations WHERE publication_id=$1 AND requester_id=$2 FOR UPDATE',[op.publication_id,op.demandante_id])).rows[0];
  const message=(await c.query(`INSERT INTO conversation_messages(conversation_id,sender_id,client_id,body,kind,operation_id,event_type,event_key)
    VALUES($1,$2,$3,$4,'workflow_event',$5,$6,$7) ON CONFLICT(operation_id,event_key) WHERE kind='workflow_event' DO NOTHING RETURNING id`,
    [chat.id,actor,randomUUID(),body,op.id,type,key])).rows[0];
  if(!message)return;
  await c.query('UPDATE publication_conversations SET updated_at=clock_timestamp() WHERE id=$1',[chat.id]);
  await enqueueOutboxEvent(c,{aggregateType:'conversation',aggregateId:chat.id,eventType:'conversation.workflow.updated',payload:{conversationId:chat.id,messageId:String(message.id),operationId:op.id},deduplicationKey:`conversation.workflow:${message.id}`});
}
