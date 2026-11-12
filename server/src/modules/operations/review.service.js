import { z } from 'zod';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';
import { appendConversationEvent } from './conversation-events.js';
import { reviewEligibility,reviewPublicationDays,reviewError,reviewSchema } from './review.policy.js';
import { reputationProjection,productReviewProjection } from './review-read.js';
const uuid=id=>{if(!z.uuid().safeParse(id).success)throw reviewError(404,'Operación o perfil no encontrado.');};
async function tx(db,work){const c=await db.connect();try{await c.query('BEGIN');const r=await work(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function context(c,id,actor){
 uuid(id);const ref=(await c.query('SELECT publication_id FROM operations WHERE id=$1',[id])).rows[0];if(!ref)throw reviewError(404,'Operación no encontrada.');
 await c.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE',[ref.publication_id]);
 const op=(await c.query('SELECT * FROM operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
 requireCurrentUser((await c.query('SELECT * FROM users WHERE id=$1 FOR SHARE',[actor])).rows[0]);
 if(![op.oferente_id,op.demandante_id].includes(actor))throw reviewError(404,'Operación no encontrada.');
 const h=(await c.query('SELECT * FROM operation_handoffs WHERE operation_id=$1',[id])).rows[0];
 const pending=(await c.query("SELECT id FROM incidences WHERE operation_id=$1 AND status NOT IN ('Resuelta','Desestimada') LIMIT 1",[id])).rowCount;
 const paid=(await c.query(`SELECT 1 FROM operation_payment_simulations WHERE operation_id=$1
 UNION ALL SELECT 1 FROM operation_finance_payments WHERE operation_id=$1 AND superseded_at IS NULL AND status IN ('simulated_succeeded','sandbox_succeeded')
 UNION ALL SELECT 1 FROM transactions WHERE operation_id=$1 AND type='Cobro' AND status='Aprobada'`,[id])).rowCount>0;
 const silent=op.modality==='Alquiler'&&op.contract_snapshot?.workflow_payment&&op.status==='Cerrada'&&
  (await c.query('SELECT 1 FROM operation_return_settlements WHERE operation_id=$1 AND closed_by_silence',[id])).rowCount>0;
 return {op,eligible:reviewEligibility(op,h,pending,paid,silent),pending};
}
async function state(c,op,actor,eligible,pending){
 const rows=(await c.query('SELECT author_id,publish_after,created_at FROM operation_reviews WHERE operation_id=$1',[op.id])).rows;
 const own=rows.find(r=>r.author_id===actor),deadline=rows[0]?.publish_after??(op.closed_at?new Date(new Date(op.closed_at).getTime()+reviewPublicationDays()*86400000):null);
 const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
 return {operation_id:op.id,modality:op.modality,is_owner:actor===op.oferente_id,eligible:eligible&&!own,submitted:Boolean(own),published:Boolean(own&&(rows.length===2||now>=own.publish_after)),publish_after:deadline?.toISOString()??null,
  publication_days:deadline&&op.closed_at?Math.round((deadline-new Date(op.closed_at))/86400000):reviewPublicationDays(),reason:own?'Tu evaluación ya está registrada.':pending?'Resuelve las incidencias pendientes antes de evaluar.':!eligible?'Solo se evalúan operaciones cerradas, con entrega confirmada y devolución cuando corresponda.':null};
}
export async function readOperationReview(db,id,actor){return tx(db,async c=>{const {op,eligible,pending}=await context(c,id,actor);return state(c,op,actor,eligible,pending);});}
export async function submitOperationReview(db,id,actor,input){
 const parsed=reviewSchema.safeParse(input);if(!parsed.success)throw reviewError(400,'Selecciona de 1 a 5 estrellas y usa comentarios de hasta 1000 caracteres.');
 return tx(db,async c=>{
  const {op,eligible,pending}=await context(c,id,actor);
  if(!eligible)throw reviewError(409,'Solo puedes evaluar un trato concretado, cerrado y sin incidencias pendientes.');
  if((await c.query('SELECT id FROM operation_reviews WHERE operation_id=$1 AND author_id=$2',[id,actor])).rowCount)throw reviewError(409,'Ya evaluaste esta operación. Solo se permite una evaluación por participante.');
  const owner=actor===op.oferente_id,data=parsed.data;
  if(owner&&(data.product_rating!==undefined||data.product_comment!==undefined))throw reviewError(400,'Solo quien adquirió o utilizó el artículo puede reseñar el producto.');
  const previous=(await c.query('SELECT publish_after FROM operation_reviews WHERE operation_id=$1 LIMIT 1',[id])).rows[0];
  const deadline=previous?.publish_after??new Date(new Date(op.closed_at).getTime()+reviewPublicationDays()*86400000);
  const review=(await c.query(`INSERT INTO operation_reviews(operation_id,author_id,subject_id,subject_role,publication_id,modality,person_rating,person_comment,product_rating,product_comment,publish_after)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[id,actor,owner?op.demandante_id:op.oferente_id,owner?'requester':'owner',op.publication_id,op.modality,data.person_rating,data.person_comment,data.product_rating??null,data.product_comment??'',deadline])).rows[0];
  await appendAudit(c,{actorId:actor,action:'operation.review.submitted',entityType:'operation',entityId:id,newValues:{review_id:review.id}});
  // Generic notice only: the counterpart must not learn the hidden content.
  await appendConversationEvent(c,op,actor,{type:'review.submitted',key:`review:${actor}`,body:'Se registró una evaluación del trato. Se publicará cuando ambos evalúen o venza el plazo; su contenido permanece oculto hasta entonces.'});
  return state(c,op,actor,eligible,pending);
 });
}
function page(offset){if(!Number.isInteger(offset)||offset<0||offset>10000)throw reviewError(400,'Página inválida.');}
export async function readUserReviews(db,id,viewer,offset=0){
 uuid(id);page(offset);requireCurrentUser((await db.query('SELECT * FROM users WHERE id=$1',[viewer])).rows[0]);
 const target=(await db.query("SELECT id FROM users WHERE id=$1 AND status='Activa' AND verification_status='Verificado'",[id])).rows[0];if(!target)throw reviewError(404,'Perfil no encontrado.');
 return reputationProjection(db,id,viewer,offset);
}
export async function readProductReviews(db,id,offset=0){uuid(id);page(offset);const found=(await db.query('SELECT id FROM publications WHERE id=$1',[id])).rows[0];if(!found)throw reviewError(404,'Publicación no encontrada.');return productReviewProjection(db,id,offset);}
