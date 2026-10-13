import { AppError } from '../../shared/errors/app-error.js';
import { env } from '../../config/env.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { parseOperationRequest,validateRequestedTerms,publicOperation,parseDecision,parseCancellation,authorizeTransition,buildContractSnapshot } from './operation.policy.js';
import { publicationPricing } from '../publications/publication-pricing.js';
import { z } from 'zod';
import { handoffProjection } from './handoff.policy.js';
import { simulationQuote } from './payment-simulation.policy.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { appendConversationEvent } from './conversation-events.js';
const invalid=()=>new AppError({status:400,code:'INVALID_INPUT',message:'Datos inválidos.'});
const missing=()=>new AppError({status:404,code:'OPERATION_NOT_FOUND',message:'Operación no encontrada.'});
async function transaction(db,work){
  const client=await db.connect();let releaseError;
  try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}
  catch(error){try{await client.query('ROLLBACK');}catch(failure){releaseError=failure;}throw error;}
  finally{client.release(releaseError);}
}
export async function projectOperation(client,row,viewer){
  const publication=(await client.query(`SELECT p.id,p.title,p.contract_version,(SELECT image_url FROM publication_images WHERE publication_id=p.id ORDER BY position LIMIT 1) AS primary_image FROM publications p WHERE id=$1`,[row.publication_id])).rows[0];
  const users=(await client.query('SELECT id,display_name,reputation_score,operations_count FROM users WHERE id=ANY($1::uuid[])',[[row.demandante_id,row.oferente_id]])).rows;
  const operation = publicOperation({...row,publication,owner:users.find(u=>u.id===row.oferente_id),requester:users.find(u=>u.id===row.demandante_id)},viewer);
  const handoff=(await client.query('SELECT * FROM operation_handoffs WHERE operation_id=$1',[row.id])).rows[0];
  operation.handoff=handoffProjection(handoff,row,viewer);
  const payment=(await client.query('SELECT amount,unit_count,created_at FROM operation_payment_simulations WHERE operation_id=$1',[row.id])).rows[0];
  if(row.accepted_at) {
    operation.payment_simulation=payment?{...payment,simulated:true,completed:true,guarantee_held:false}:null;
    // The owner never sees buyer payment instruments or processor charges.
    if(viewer===row.demandante_id&&handoff?.agreed_by&&!handoff.change_requested) operation.payment_quote=simulationQuote(row);
  }
  if(handoff?.owner_delivered_at||handoff?.requester_received_at) operation.allowed_actions=[];
  if (row.offered_price != null && viewer === row.oferente_id) {
    operation.offer_pricing = row.contract_snapshot?.pricing ?? publicationPricing({ modality: row.modality, price: row.offered_price,
      guarantee_amount: row.requested_guarantee_amount, rental_unit: row.requested_rental_unit }).owner;
  }
  return operation;
}
const project=projectOperation;
export async function requestOperation(db,input,requesterId){
  const terms=parseOperationRequest(input);
  return transaction(db,async client=>{
    const publication=(await client.query('SELECT * FROM publications WHERE id=$1 FOR UPDATE',[terms.publication_id])).rows[0];
    if(!publication)throw new AppError({status:404,code:'PUBLICATION_NOT_FOUND',message:'Publicación no encontrada.'});
    const users=(await client.query('SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE',[[requesterId,publication.owner_id]])).rows;
    requireCurrentUser(users.find(u=>u.id===requesterId));requireCurrentUser(users.find(u=>u.id===publication.owner_id));
    const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    try{validateRequestedTerms(publication,{...terms,requester_id:requesterId},now);}catch(error){
      if(error.code==='OPERATION_TERMS_INVALID')error.message='La publicación o sus condiciones ya no están disponibles. Actualiza la página y comprueba el precio, la versión y las fechas.';
      throw error;
    }
    const reserved=await client.query(`SELECT id FROM reservations WHERE publication_id=$1 AND status IN('Bloqueo Provisional','Reservada/Bloqueada','Activa/En uso')
      AND ($2::timestamptz IS NULL OR start_date IS NULL OR(status='Activa/En uso' AND end_date<=clock_timestamp()) OR(start_date<$3::timestamptz AND end_date>$2::timestamptz)) LIMIT 1`,[publication.id,terms.start_date||null,terms.end_date||null]);
    if(reserved.rowCount)throw new AppError({status:409,code:'OPERATION_CONFLICT',message:'El artículo ya está reservado para esas condiciones.'});
    const existing=(await client.query(`SELECT * FROM operations WHERE publication_id=$1 AND demandante_id=$2 AND status='Pendiente'
      AND request_expires_at>$3 AND requested_contract_version=$4 AND requested_price=$5 AND requested_guarantee_amount=$6
      AND start_date IS NOT DISTINCT FROM $7::timestamptz AND end_date IS NOT DISTINCT FROM $8::timestamptz
      AND requested_rental_unit IS NOT DISTINCT FROM $9::text AND offered_price IS NOT DISTINCT FROM $10::numeric ORDER BY id LIMIT 1`,
      [publication.id,requesterId,now,terms.requested_contract_version,terms.requested_price,terms.requested_guarantee_amount,terms.start_date||null,terms.end_date||null,publication.modality==='Alquiler'?publication.rental_unit:null,terms.offered_price??null])).rows[0];
    if(existing)return {operation:await project(client,existing,requesterId)};
    const operation=(await client.query(`INSERT INTO operations(publication_id,demandante_id,oferente_id,modality,status,start_date,end_date,
      requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at,requested_rental_unit,offered_price)
      VALUES($1,$2,$3,$4,'Pendiente',$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [publication.id,requesterId,publication.owner_id,publication.modality,terms.start_date||null,terms.end_date||null,terms.requested_price,terms.requested_guarantee_amount,
        terms.requested_contract_version,new Date(now.getTime()+Number(env.OPERATION_REQUEST_TTL_HOURS)*3600000),publication.modality==='Alquiler'?publication.rental_unit:null,terms.offered_price??null])).rows[0];
    await appendAudit(client,{actorId:requesterId,action:'operation.requested',entityType:'operation',entityId:operation.id,newValues:{status:'Pendiente',publication_id:publication.id,...(terms.offered_price?{offered_price:terms.offered_price}:{})}});
    await enqueueOutboxEvent(client,{aggregateType:'operation',aggregateId:operation.id,eventType:'operation.requested',payload:{operationId:operation.id,ownerId:publication.owner_id,requesterId},deduplicationKey:`operation.requested:${operation.id}`});
    return {operation:await project(client,operation,requesterId)};
  });
}
export async function readOperation(db,id,viewer){
  return transaction(db,async client=>{
    requireCurrentUser((await client.query('SELECT * FROM users WHERE id=$1',[viewer])).rows[0]);
    const row=(await client.query('SELECT * FROM operations WHERE id=$1 AND(demandante_id=$2 OR oferente_id=$2)',[id,viewer])).rows[0];
    if(!row)throw missing();return {operation:await project(client,row,viewer)};
  });
}
export async function listOperations(db,viewer,page={}){
  if(Object.keys(page).some(k=>!['side','status','limit','offset'].includes(k)))throw invalid();
  const limit=page.limit===undefined?20:Number(page.limit),offset=page.offset===undefined?0:Number(page.offset),side=page.side||'requested';
  if(!['requested','received'].includes(side)||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>10000)throw invalid();
  return transaction(db,async client=>{
    requireCurrentUser((await client.query('SELECT * FROM users WHERE id=$1',[viewer])).rows[0]);
    const rows=(await client.query(`SELECT * FROM operations WHERE ${side==='requested'?'demandante_id':'oferente_id'}=$1
      AND($2::operation_status IS NULL OR status=$2::operation_status)ORDER BY created_at DESC,id LIMIT $3 OFFSET $4`,[viewer,page.status||null,limit,offset])).rows;
    const items=[];for(const row of rows)items.push(await project(client,row,viewer));return {items,limit,offset};
  });
}

// Decisions share the publication-first lock order with requests. The publication
// lock serializes competing acceptances before checking live reservations.
export async function decideOperation(db, id, actorId, input) {
  const decision = input.decision === 'cancel' ? { decision: 'cancel', ...parseCancellation({ reason: input.reason }) } : parseDecision(input);
  if (!z.uuid().safeParse(id).success) throw invalid();
  return transaction(db, async client => {
    const reference = (await client.query('SELECT publication_id FROM operations WHERE id=$1 AND (demandante_id=$2 OR oferente_id=$2)', [id, actorId])).rows[0];
    if (!reference) throw missing();
    const publication = (await client.query('SELECT * FROM publications WHERE id=$1 FOR UPDATE', [reference.publication_id])).rows[0];
    const row = (await client.query('SELECT * FROM operations WHERE id=$1 FOR UPDATE', [id])).rows[0];
    const users = (await client.query('SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE', [[row.demandante_id, row.oferente_id]])).rows;
    requireCurrentUser(users.find(user => user.id === actorId));
    if (decision.decision === 'accept') {
      users.forEach(requireCurrentUser);
    }
    const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    if(decision.decision==='cancel' && (await client.query('SELECT operation_id FROM operation_handoffs WHERE operation_id=$1 AND (owner_delivered_at IS NOT NULL OR requester_received_at IS NOT NULL)',[id])).rowCount) {
      throw new AppError({status:409,code:'OPERATION_CONFLICT',message:'Ya se declaró una entrega. No se puede liberar el artículo mediante cancelación; revisa la entrega con la otra persona.'});
    }
    const target = { accept: 'Aceptada', reject: 'Rechazada', cancel: 'Cancelada' }[decision.decision];
    const actorKind = decision.decision === 'cancel' ? 'requester' : 'owner';
    const precondition = decision.decision === 'accept' ? 'request_available' :
      decision.decision === 'cancel' && row.accepted_at ? 'pre_economic' : 'pending_request';
    const rule = (await client.query(`SELECT * FROM operation_transition_rules WHERE from_status=$1 AND to_status=$2 AND actor_kind=$3 AND precondition_key=$4`,
      [row.status, target, actorKind, precondition])).rows[0];
    if (!rule) throw new AppError({ status: 409, code: 'OPERATION_CONFLICT', message: 'Esta solicitud ya fue atendida o no admite esa acción. Actualiza tus operaciones.' });
    const reserved = await client.query(`SELECT id FROM reservations WHERE publication_id=$1 AND status IN ('Bloqueo Provisional','Reservada/Bloqueada','Activa/En uso')
      AND ($2::timestamptz IS NULL OR start_date IS NULL OR (status='Activa/En uso' AND end_date<=clock_timestamp()) OR (start_date<$3::timestamptz AND end_date>$2::timestamptz)) LIMIT 1`,
      [row.publication_id, row.start_date, row.end_date]);
    const movements = decision.decision === 'cancel' && row.accepted_at ?
      await client.query('SELECT id FROM transactions WHERE operation_id=$1 LIMIT 1', [id]) : { rowCount: 0 };
    const effects = authorizeTransition(rule, { operation: row, publication, actorId, now,
      reservationConflict: reserved.rowCount > 0, hasEconomicMovement: movements.rowCount > 0 });
    let updated;
    if (decision.decision === 'accept') {
      const snapshot = buildContractSnapshot(publication, row, now);
      if (row.offered_price != null) snapshot.pricing = publicationPricing({ ...publication, price: row.offered_price }).owner;
      updated = (await client.query(`UPDATE operations SET status='Aceptada',contract_snapshot=$2,accepted_at=$3,decided_at=$3,decided_by=$4,updated_at=$3 WHERE id=$1 RETURNING *`,
        [id, snapshot, now, actorId])).rows[0];
    } else if (decision.decision === 'reject') {
      updated = (await client.query(`UPDATE operations SET status='Rechazada',decided_at=$2,decided_by=$3,decision_reason=$4,updated_at=$2 WHERE id=$1 RETURNING *`,
        [id, now, actorId, decision.reason])).rows[0];
    } else {
      updated = (await client.query(`UPDATE operations SET status='Cancelada',cancelled_at=$2,cancelled_by=$3,cancellation_reason=$4,updated_at=$2 WHERE id=$1 RETURNING *`,
        [id, now, actorId, decision.reason])).rows[0];
    }
    if (effects.createReservation) await client.query(`INSERT INTO reservations(publication_id,operation_id,start_date,end_date,status) VALUES($1,$2,$3,$4,'Reservada/Bloqueada')`,
      [row.publication_id, id, row.start_date, row.end_date]);
    if (effects.releaseReservation) await client.query(`UPDATE reservations SET status='Disponible',released_at=$2,release_reason=$3 WHERE operation_id=$1 AND status IN ('Bloqueo Provisional','Reservada/Bloqueada','Activa/En uso')`,
      [id, now, decision.reason]);
    const eventType = { accept: 'operation.accepted', reject: 'operation.rejected', cancel: 'operation.cancelled' }[decision.decision];
    await appendConversationEvent(client,updated,actorId,{type:eventType,key:eventType,body:{accept:'Aceptó el trato. Pueden coordinar la entrega por chat o usar el calendario opcional.',reject:'Rechazó la solicitud. No hay un trato confirmado.',cancel:'Canceló la operación. Ya no se puede continuar con su pago ni entrega.'}[decision.decision]});
    await appendAudit(client, { actorId, action: eventType, entityType: 'operation', entityId: id,
      oldValues: { status: row.status }, newValues: { status: updated.status, ...(row.offered_price != null ? { offered_price: row.offered_price } : {}) } });
    await enqueueOutboxEvent(client, { aggregateType: 'operation', aggregateId: id, eventType,
      payload: { operationId: id, ownerId: row.oferente_id, requesterId: row.demandante_id }, deduplicationKey: `${eventType}:${id}` });
    return { operation: await project(client, updated, actorId) };
  });
}
