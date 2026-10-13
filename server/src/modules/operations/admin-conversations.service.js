import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';

const fail=(status,message)=>new AppError({status,code:'ADMIN_CHAT_ERROR',message});
async function asAdmin(db,actor,work){
  const c=await db.connect();
  try{
    await c.query('BEGIN');
    // Hold the authorization read through the audited read transaction.
    const user=(await c.query('SELECT * FROM users WHERE id=$1 FOR SHARE',[actor])).rows[0];
    requireCurrentUser(user);
    if(user.role!=='Administrador')throw fail(403,'Solo un Administrador puede revisar chats ajenos.');
    const result=await work(c);await c.query('COMMIT');return result;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
export async function listAdminConversations(db,actor,offset=0){
  if(!Number.isInteger(offset)||offset<0||offset>10000)throw fail(400,'Página inválida.');
  return asAdmin(db,actor,async c=>{
    const rows=(await c.query(`SELECT c.id,c.updated_at,p.id AS publication_id,p.title,
      owner.display_name AS owner_name,requester.display_name AS requester_name
      FROM publication_conversations c JOIN publications p ON p.id=c.publication_id
      JOIN users owner ON owner.id=c.owner_id JOIN users requester ON requester.id=c.requester_id
      ORDER BY c.updated_at DESC,c.id LIMIT 21 OFFSET $1`,[offset])).rows;
    const items=rows.slice(0,20);
    await appendAudit(c,{actorId:actor,action:'admin.conversations.listed',entityType:'admin-chat-list',entityId:actor,newValues:{offset,returned_count:items.length}});
    return {items,offset,has_more:rows.length>20,read_only:true};
  });
}
export async function readAdminMessages(db,id,actor,before){
  if(!z.uuid().safeParse(id).success)throw fail(400,'Identificador inválido.');
  if(before!==undefined&&(typeof before!=='string'||!/^[1-9]\d{0,18}$/.test(before)||BigInt(before)>9223372036854775807n))throw fail(400,'Cursor inválido.');
  return asAdmin(db,actor,async c=>{
    const conversation=(await c.query(`SELECT c.id,p.title,owner.display_name AS owner_name,requester.display_name AS requester_name
      FROM publication_conversations c JOIN publications p ON p.id=c.publication_id
      JOIN users owner ON owner.id=c.owner_id JOIN users requester ON requester.id=c.requester_id WHERE c.id=$1`,[id])).rows[0];
    if(!conversation)throw fail(404,'Conversación no encontrada.');
    const rows=(await c.query(`SELECT m.id,m.body,m.kind,m.event_type,m.operation_id,m.created_at,
      u.display_name AS sender_name,(m.sender_id=c.owner_id) AS sender_is_owner
      FROM conversation_messages m JOIN users u ON u.id=m.sender_id JOIN publication_conversations c ON c.id=m.conversation_id
      WHERE m.conversation_id=$1 AND ($2::bigint IS NULL OR m.id<$2) ORDER BY m.id DESC LIMIT 51`,[id,before??null])).rows;
    const items=rows.slice(0,50).reverse();
    // Audit contains references/counts only, never a second copy of chat text.
    await appendAudit(c,{actorId:actor,action:'admin.conversation.read',entityType:'conversation',entityId:id,newValues:{returned_count:items.length},metadata:{before:before??null}});
    return {conversation,items,before:rows.length>50?String(items[0].id):null,read_only:true};
  });
}
