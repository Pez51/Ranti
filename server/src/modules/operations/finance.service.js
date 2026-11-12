import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { demoPaymentMethods, readPaymentProfile } from '../users/payment-profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';
import { appendConversationEvent } from './conversation-events.js';
import { configuredMethods,calculateFinance,economicBasis,buyerQuote,ownerQuote,financeError,formatCents,canRetryFinancePayment } from './finance.policy.js';
import { culqiSandbox,verifySandboxCharge } from './culqi-sandbox.adapter.js';
import { findReturnSettlement, returnSettlementView, confirmReturnReceipt } from './return-settlement.js';
import { testRefundView } from './test-money-movements.js';
import { paymentDeadlinePassed } from './workflow-timing.js';
import { updateDemoChargeback } from './finance-chargebacks.js';
import { financeDocumentKinds,financeDocumentVariants } from './finance-documents.js';
import { inspectLedgerMovement,ledgerEntriesQuery,ledgerMovements } from './finance-ledger.js';
const missing=()=>new AppError({status:404,code:'FINANCE_NOT_FOUND',message:'Operación económica no encontrada.',details:null});
const idCheck=id=>{if(!z.uuid().safeParse(id).success)throw missing();};
export async function financeTx(db,work){const c=await db.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function access(c,id,actor,admin=false){
 idCheck(id);
 const ref=(await c.query('SELECT publication_id FROM operations WHERE id=$1',[id])).rows[0];if(!ref)throw missing();
 const publication=(await c.query('SELECT id,guarantee_required FROM publications WHERE id=$1 FOR UPDATE',[ref.publication_id])).rows[0];
 const op=(await c.query('SELECT * FROM operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
 op.guarantee_required=publication.guarantee_required;
 if(!['Venta','Alquiler'].includes(op.modality))throw financeError('Esta base económica está habilitada solo para ventas y alquileres.');
 const user=(await c.query('SELECT * FROM users WHERE id=$1 FOR SHARE',[actor])).rows[0];requireCurrentUser(user);
 if(admin?user.role!=='Administrador':actor!==op.oferente_id&&actor!==op.demandante_id)throw missing();
 return {op,user};
}
export async function transferEligibility(c,op,payment){
 const registered=(await c.query('SELECT status,mechanism,confirmed_at,external_reference,participant_received_at FROM operation_finance_transfers WHERE operation_id=$1',[op.id])).rows[0];
 if(registered?.status==='confirmed')return {status:'confirmed',eligible:false,
   condition:registered.mechanism==='simulated'?'Abono registrado en la simulación.':'Desembolso registrado.',
   blocked_reason:null,confirmed_at:registered.confirmed_at,reference:registered.external_reference,real_money:false,
   simulated:registered.mechanism==='simulated',received_at:registered.participant_received_at};
 const h=(await c.query('SELECT * FROM operation_handoffs WHERE operation_id=$1',[op.id])).rows[0];
 const incidents=(await c.query("SELECT id FROM incidences WHERE operation_id=$1 AND status NOT IN ('Resuelta','Desestimada') LIMIT 1",[op.id])).rowCount;
 const closed=op.modality==='Venta'?Boolean(h?.owner_delivered_at&&h?.requester_received_at):Boolean(h?.owner_returned_at&&h?.requester_returned_at);
 const success=['simulated_succeeded','sandbox_succeeded'].includes(payment?.status);
 const complete=closed&&(!op.contract_snapshot?.workflow_payment||op.status==='Cerrada');
 const eligible=success&&complete&&!incidents&&!['Cancelada','Rechazada','Expirada'].includes(op.status);
 return {status:eligible?'not_enabled':'blocked',eligible,condition:op.modality==='Venta'?'Recepción conforme por ambos, pago confirmado y sin incidencias pendientes.':'Devolución conforme por ambos, pago confirmado y sin incidencias pendientes.',blocked_reason:incidents?'Incidencias pendientes':!success?'Pago sin confirmar':!complete?'Falta cierre conforme':!eligible?'Operación cancelada':'No existe mecanismo de transferencia contratado/configurado',confirmed_at:null,reference:null,real_money:false};
}
async function latest(c,id){return (await c.query('SELECT * FROM operation_finance_quotes WHERE operation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[id])).rows[0];}
async function paymentOf(c,id){return (await c.query('SELECT * FROM operation_finance_payments WHERE operation_id=$1 AND superseded_at IS NULL',[id])).rows[0];}
function paymentPublic(p,q){return p?{id:p.id,status:p.status,mode:p.mode,reference:p.provider_reference,
 created_at:p.created_at,confirmed_at:p.confirmed_at,authorization_required:p.demo_authorization_required,
 failure_reason:p.failure_reason,
 ...(q?{method:q.method,amount:formatCents(q.economics.total_cents),expires_at:q.expires_at}:{}),real_money:false}:null;}
const methodLabel=(id,t)=>id==='simulated'?'Simulación local — procesamiento ficticio cero':t.environment==='sandbox'?`${id} — Culqi sandbox`:`${id} — simulación local, tarifa ficticia`;
function operationMethods(op, tariffs) {
  const preferences = op.contract_snapshot?.workflow_payment;
  const guaranteeRequired=op.modality==='Alquiler'&&(op.contract_snapshot?.guarantee_required??op.guarantee_required)===true;
  const methods = Object.entries(tariffs).filter(([id, tariff]) =>
    (!guaranteeRequired||tariff.environment!=='sandbox')&&(!preferences || id !== 'simulated' && tariff.environment === 'sandbox' &&
      preferences.accepted_methods.includes('tarjeta_prueba') && process.env.CULQI_TEST_SECRET_KEY?.startsWith('sk_test_') &&
      tariff.guarantee_policy === 'not_collected'));
  for (const id of preferences?.accepted_methods ?? Object.keys(demoPaymentMethods)) {
    const tariff = preferences && op.modality === 'Alquiler' ? {
      ...tariffs.simulated,
      version: 'simulation-only-refundable-guarantee-v1',
      guarantee_policy: 'charge_refundable',
    } : tariffs.simulated;
    methods.push([id, tariff]);
  }
  return Object.fromEntries(methods);
}
async function view(c,op,actor){
 const p=await paymentOf(c,op.id);
 const paidQuote=p?(await c.query('SELECT * FROM operation_finance_quotes WHERE id=$1',[p.quote_id])).rows[0]:null;
 const retry=canRetryFinancePayment(op,p,paymentDeadlinePassed(op,new Date()));
 const q=!p||retry?await latest(c,op.id):paidQuote;
 const tariffs=configuredMethods(),owner=actor===op.oferente_id;
 const profile=owner?null:await readPaymentProfile(c,actor);
 const transfer=await transferEligibility(c,op,p);
 const refund=await testRefundView(c,op,!owner);
 let refundCase=null;
 if(op.contract_snapshot?.workflow_payment){
  refundCase=(await c.query(`SELECT i.id,i.type,i.status,i.created_at,
    EXISTS (SELECT 1 FROM operation_test_refunds r WHERE r.incidence_id=i.id) AS issued
   FROM incidences i WHERE i.operation_id=$1 AND (
    EXISTS (SELECT 1 FROM operation_test_refunds r WHERE r.incidence_id=i.id) OR
    i.type='paid_cancellation')
   ORDER BY issued DESC,i.created_at DESC,i.id LIMIT 1`,[op.id])).rows[0]??null;
 }
 const payout=op.contract_snapshot?.workflow_payment?.payout??null;
 const settlement=op.modality==='Alquiler'&&op.contract_snapshot?.workflow_payment?
   returnSettlementView(await findReturnSettlement(c,op.id),op,actor):null;
 const documents=financeDocumentVariants({quote:paidQuote,payment:p,transfer,refund,settlement,payout})
  .filter(doc=>doc.side===(owner?'owner':'buyer'))
  .map(({kind,title,issued_at,amount,status})=>({kind,title,issued_at,amount,status}));
 return {operation_id:op.id,operation_status:op.status,modality:op.modality,payment:paymentPublic(p,paidQuote),
   payment_deadline:op.payment_expires_at,payment_deadline_passed:paymentDeadlinePassed(op,new Date()),can_retry_payment:!owner&&retry,
   attempted_quote_id:p?.quote_id,recipient:owner?null:q?.public_snapshot?.requester?.name,
   guarantee_registered:p?.status==='simulated_succeeded'&&q&&BigInt(q.economics.guarantee_charged_cents)>0n?
     formatCents(q.economics.guarantee_charged_cents):null,
   transfer:owner?transfer:{...transfer,received_at:null},refund,refund_case:refundCase,documents,settlement,
   ...(owner?{owner_estimate:ownerQuote(calculateFinance(op,tariffs.simulated)),payout}:{preferred_method:profile.buyer_method}),
   quote:q?{id:q.id,method:q.method,mode:q.mode,expires_at:q.expires_at,accepted_at:q.accepted_at,...(owner?{owner:ownerQuote(q.economics)}:{buyer:buyerQuote(q.economics)})}:null,
   methods:Object.entries(operationMethods(op,tariffs)).map(([id,t])=>({id,label:demoPaymentMethods[id]??methodLabel(id,t),mode:t.environment==='sandbox'?'culqi_sandbox':'simulated'}))};
}
export async function readFinance(db,id,actor){return financeTx(db,async c=>{const {op}=await access(c,id,actor);return view(c,op,actor);});}
export async function confirmFinanceReceipt(db,id,actor,kind){
 return financeTx(db,async c=>{
  const {op}=await access(c,id,actor);
  if(!op.contract_snapshot?.workflow_payment)throw missing();
  const owner=actor===op.oferente_id;
  if(kind==='guarantee'){
   if(op.modality!=='Alquiler')throw missing();
   await confirmReturnReceipt(c,op,await findReturnSettlement(c,id),owner,actor);
   return view(c,op,actor);
  }
  if(kind!==(owner?'payout':'refund'))throw missing();
  const result=owner?await c.query(`UPDATE operation_finance_transfers SET participant_received_at=clock_timestamp()
    WHERE operation_id=$1 AND status='confirmed' AND mechanism='simulated' AND participant_received_at IS NULL`,[id]):
   await c.query(`UPDATE operation_test_refunds SET received_at=clock_timestamp()
    WHERE operation_id=$1 AND received_at IS NULL`,[id]);
  const response=await view(c,op,actor);
  if(!(owner?response.transfer.received_at:response.refund?.received_at))throw financeError('Aún no hay un movimiento de prueba para confirmar.');
  if(result.rowCount)await appendAudit(c,{actorId:actor,action:`finance.receipt.${kind}`,entityType:'operation',entityId:id});
  return response;
 });
}
export async function quoteFinance(db,id,actor,input){
 const parsed=z.object({method:z.string().min(1).max(100)}).strict().safeParse(input);if(!parsed.success)throw financeError('Selecciona un medio de pago.');
 return financeTx(db,async c=>{
  const {op}=await access(c,id,actor);if(actor!==op.demandante_id)throw missing();
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
  const current=await paymentOf(c,id),expired=paymentDeadlinePassed(op,now);
  if(expired||!['Pendiente','Aceptada','Pendiente de pago/garantía'].includes(op.status)||
    (current&&!canRetryFinancePayment(op,current,expired)))throw financeError('La reserva venció o el intento existente aún debe conciliarse.');
  const tariffs=operationMethods(op,configuredMethods());
  const t=Object.hasOwn(tariffs,parsed.data.method)?tariffs[parsed.data.method]:null;
  if(!t)throw financeError('El medio de pago no está disponible para esta operación.');
  if(t.environment==='sandbox'&&(!process.env.CULQI_TEST_SECRET_KEY?.startsWith('sk_test_')||t.guarantee_policy!=='not_collected'))throw financeError('Falta la llave sandbox o la capacidad de tratar garantías. No se habilita custodia.');
  const economics=calculateFinance(op,t),mode=t.environment==='sandbox'?'culqi_sandbox':'simulated';
  const title=(await c.query('SELECT title FROM publications WHERE id=$1',[op.publication_id])).rows[0].title;
  const names=(await c.query('SELECT id,display_name FROM users WHERE id=ANY($1::uuid[])',[[op.oferente_id,op.demandante_id]])).rows;
  const q=(await c.query(`INSERT INTO operation_finance_quotes(operation_id,requester_id,method,mode,terms_key,tariff_version,tariff_snapshot,economics,public_snapshot,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()+interval '10 minutes') RETURNING *`,[id,actor,parsed.data.method,mode,economics.terms_key,t.version,t,economics,{title:op.contract_snapshot?.title||title,owner:{id:op.oferente_id,name:names.find(u=>u.id===op.oferente_id)?.display_name||'Oferente UCSM'},requester:{id:op.demandante_id,name:names.find(u=>u.id===op.demandante_id)?.display_name||'Participante UCSM'},modality:op.modality,start_date:op.start_date,end_date:op.end_date}])).rows[0];
  await appendAudit(c,{actorId:actor,action:'finance.quoted',entityType:'operation',entityId:id,newValues:{quote_id:q.id,mode}});
  return {id:q.id,method:q.method,mode,expires_at:q.expires_at,buyer:buyerQuote(economics),recipient:q.public_snapshot.requester.name};
 });
}
async function applyOutcome(c,op,p,q,status,reference,eventKey,failureReason='declined'){
 const old=await paymentOf(c,op.id);
 if(old?.id!==p.id||['simulated_succeeded','sandbox_succeeded'].includes(old.status)||
    (old.status==='failed'&&(old.mode==='simulated'||status==='pending')))return;
 const event=await c.query('INSERT INTO operation_finance_events(payment_id,event_key,kind) VALUES($1,$2,$3) ON CONFLICT(event_key) DO NOTHING',[p.id,eventKey,status]);
 if(!event.rowCount)return;
 await c.query(`UPDATE operation_finance_payments SET status=$2,provider_reference=COALESCE($3,provider_reference),
   confirmed_at=CASE WHEN $2 IN ('simulated_succeeded','sandbox_succeeded') THEN clock_timestamp() ELSE NULL END,
   demo_authorization_required=CASE WHEN $2='pending' THEN demo_authorization_required ELSE false END,
   failure_reason=CASE WHEN $2='failed' THEN $4 ELSE NULL END WHERE id=$1`,[p.id,status,reference,failureReason]);
 if(['simulated_succeeded','sandbox_succeeded'].includes(status)){
  // Bridge only test success into the existing academic handoff flow; no real transaction.
  await c.query('INSERT INTO operation_payment_simulations(operation_id,requester_id,amount,unit_count) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[op.id,op.demandante_id,formatCents(q.economics.total_cents),q.economics.unit_count]);
  if(!['Cancelada','Rechazada','Expirada'].includes(op.status))await c.query("UPDATE operations SET status='Lista para entrega',updated_at=clock_timestamp() WHERE id=$1",[op.id]);
 }
 await appendConversationEvent(c,op,op.demandante_id,{type:`finance.${status}`,key:`finance:${eventKey}`,body:status==='pending'?'Pago de prueba pendiente de confirmación. No confirma un cobro real.':status==='failed'?'El pago de prueba falló. No se confirmó ningún cobro.':'Pago de prueba confirmado. No se cobró dinero real; la transferencia al oferente aún no está habilitada.'});
}
export async function payFinance(db,id,actor,input){
 const parsed=z.object({quote_id:z.uuid(),idempotency_key:z.uuid(),accepted_total:z.string().regex(/^\d+\.\d{2}$/),confirm_test:z.literal(true),source_id:z.string().max(100).optional(),scenario:z.enum(['success','failed','pending','authorization']).default('success')}).strict().safeParse(input);
 if(!parsed.success)throw financeError('Acepta el total exacto y confirma que es una prueba sin dinero real.');
 const data=parsed.data;
 // Persist an at-most-once attempt before contacting the external provider.
 const attempt=await financeTx(db,async c=>{
  const {op,user}=await access(c,id,actor);if(op.demandante_id!==actor)throw missing();
  const repeated=(await c.query('SELECT operation_id,quote_id FROM operation_finance_payments WHERE idempotency_key=$1',[data.idempotency_key])).rows[0];
  if(repeated){
   if(repeated.operation_id!==id||repeated.quote_id!==data.quote_id)throw financeError('La clave ya corresponde a otro intento.');
   return {existing:true};
  }
  const existing=await paymentOf(c,id);
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now,expired=paymentDeadlinePassed(op,now);
  if(expired)throw financeError('La reserva de pago venció.');
  if(existing&&!canRetryFinancePayment(op,existing,expired))throw financeError('Ya existe un intento. Consulta su estado antes de intentar otro cobro.');
  if((await c.query('SELECT id FROM transactions WHERE operation_id=$1 LIMIT 1',[id])).rowCount||(await c.query('SELECT operation_id FROM operation_payment_simulations WHERE operation_id=$1',[id])).rowCount)throw financeError('La operación ya usa otro flujo de pago; no se duplicará.');
  const h=(await c.query('SELECT * FROM operation_handoffs WHERE operation_id=$1',[id])).rows[0];
  if(op.status!=='Pendiente de pago/garantía'||!h?.agreed_by||h.change_requested)throw financeError('Primero ambos deben confirmar el lugar y horario.');
  const q=(await c.query('SELECT * FROM operation_finance_quotes WHERE id=$1 AND operation_id=$2',[data.quote_id,id])).rows[0];
  const current=await latest(c,id);
  if(!q||current?.id!==q.id||q.accepted_at||q.expires_at<=now||q.terms_key!==economicBasis(op).terms_key||data.accepted_total!==formatCents(q.economics.total_cents))throw financeError('La cotización cambió o venció. Revisa y acepta nuevamente el total.');
  if(q.mode==='culqi_sandbox'&&(!/^tkn_test_[A-Za-z0-9]+$/.test(data.source_id||'')||data.scenario!=='success'))throw financeError('Sandbox requiere un token de prueba; los resultados los confirma Culqi.');
  if(data.scenario==='authorization'&&q.method!=='tarjeta_prueba')throw financeError('La autorización simulada solo se aplica a la tarjeta de prueba.');
  if(existing)await c.query('UPDATE operation_finance_payments SET superseded_at=clock_timestamp() WHERE id=$1',[existing.id]);
  await c.query('UPDATE operation_finance_quotes SET accepted_at=clock_timestamp() WHERE id=$1',[q.id]);
  const p=(await c.query(`INSERT INTO operation_finance_payments(operation_id,quote_id,mode,status,idempotency_key,demo_authorization_required)
    VALUES($1,$2,$3,'pending',$4,$5) RETURNING *`,[id,q.id,q.mode,data.idempotency_key,data.scenario==='authorization'])).rows[0];
  await appendAudit(c,{actorId:actor,action:'finance.payment.attempt-created',entityType:'operation',entityId:id,newValues:{payment_id:p.id,quote_id:q.id,mode:q.mode}});
  await c.query('INSERT INTO operation_finance_transfers(operation_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
  return {op,q,p,email:user.email};
 });
 if(attempt.existing)return readFinance(db,id,actor);
 let status='pending',reference=null;
 if(attempt.q.mode==='simulated'){
  status={success:'simulated_succeeded',failed:'failed',pending:'pending',authorization:'pending'}[data.scenario];reference=`sim_${attempt.p.id}`;
 }else{
  try{const charge=await culqiSandbox.create(attempt.p,attempt.q,data.source_id,attempt.email);reference=/^chr_test_[A-Za-z0-9]+$/.test(charge.id||'')?charge.id:null;const confirmed=await culqiSandbox.charge(reference);status=verifySandboxCharge(confirmed,attempt.p,attempt.q);}catch{status='pending';}
 }
 await financeTx(db,async c=>{const {op}=await access(c,id,actor);await applyOutcome(c,op,attempt.p,attempt.q,status,reference,`attempt:${attempt.p.id}`);await appendAudit(c,{actorId:actor,action:'finance.payment.updated',entityType:'operation',entityId:id,newValues:{payment_id:attempt.p.id,status,mode:attempt.q.mode}});});
 return readFinance(db,id,actor);
}
export async function authorizeDemoPayment(db,id,actor,attemptId,input){
 idCheck(attemptId);
 const parsed=z.strictObject({decision:z.enum(['approve','reject','expired'])}).safeParse(input);
 if(!parsed.success)throw financeError('Elige el resultado de la autorización de prueba.');
 return financeTx(db,async c=>{
  const {op}=await access(c,id,actor);
  if(actor!==op.demandante_id)throw missing();
  const payment=await paymentOf(c,id);
  if(payment?.id!==attemptId||payment.mode!=='simulated')throw missing();
  if(!payment.demo_authorization_required)return view(c,op,actor);
  if(!payment.provider_reference)throw financeError('Espera a que se registre el intento de prueba.');
  const quote=(await c.query('SELECT * FROM operation_finance_quotes WHERE id=$1',[payment.quote_id])).rows[0];
  const decision=paymentDeadlinePassed(op,new Date())?'expired':parsed.data.decision;
  await c.query('UPDATE operation_finance_payments SET demo_authorization_required=false WHERE id=$1',[attemptId]);
  if(decision!=='approve')await applyOutcome(c,op,payment,quote,'failed',payment.provider_reference,
   `authorization:${attemptId}`,decision==='expired'?'authorization_expired':'authorization_rejected');
  await appendAudit(c,{actorId:actor,action:'finance.demo.authorization',entityType:'operation',entityId:id,newValues:{payment_id:attemptId,decision}});
  return view(c,op,actor);
 });
}

export async function inspectFinancePayment(db,id,actor,attemptId,adminInput){
 idCheck(attemptId);
 const admin=adminInput!==undefined;
 const parsed=admin?z.strictObject({
  evidence:z.string().trim().min(5).max(500),
  outcome:z.enum(['confirmed','not_executed','unknown']).optional()
 }).safeParse(adminInput):null;
 if(admin&&!parsed.success)throw financeError('Registra la evidencia de consulta del intento original.');
 return financeTx(db,async c=>{
  const {op}=await access(c,id,actor,admin);
  if(!admin&&actor!==op.demandante_id)throw missing();
  const payment=await paymentOf(c,id);
  if(payment?.id!==attemptId)throw missing();
  if(payment.status==='pending'){
   const quote=(await c.query('SELECT * FROM operation_finance_quotes WHERE id=$1',[payment.quote_id])).rows[0];
   if(payment.mode==='culqi_sandbox'){
    if(parsed?.data?.outcome)throw financeError('El resultado de Culqi se consulta al proveedor.');
    if(payment.provider_reference){
     const charge=await culqiSandbox.charge(payment.provider_reference);
     const status=verifySandboxCharge(charge,payment,quote);
     if(status!=='pending')await applyOutcome(c,op,payment,quote,status,charge.id,`lookup:${attemptId}:${status}`);
    }
   }else if(parsed?.data?.outcome&&parsed.data.outcome!=='unknown'){
    if(parsed.data.outcome==='confirmed'&&(payment.demo_authorization_required||!payment.provider_reference)){
     throw financeError('Para confirmar este intento primero debe quedar registrada su autorización de prueba.');
    }
    const status=parsed.data.outcome==='confirmed'?'simulated_succeeded':'failed';
    await applyOutcome(c,op,payment,quote,status,payment.provider_reference??`sim_${attemptId}`,`demo-review:${attemptId}`,'not_executed');
   }
  }
  const current=await paymentOf(c,id);
  if(admin){
   await appendAudit(c,{actorId:actor,action:'finance.attempt.inspected',entityType:'operation',entityId:id,
    newValues:{payment_id:attemptId,evidence:parsed.data.evidence,result:current.status}});
   return {payment:paymentPublic(current)};
  }
  return view(c,op,actor);
 });
}
export async function processCulqiEvent(db,eventId){
 const event=await culqiSandbox.event(eventId);
 if(event.id!==eventId)throw financeError('Evento no verificable.');
 let data=event.data;try{if(typeof data==='string')data=JSON.parse(data);}catch{throw financeError('Evento inválido.');}
 const charge=await culqiSandbox.charge(data?.id);
 if(!z.uuid().safeParse(charge.metadata?.finance_payment_id).success)throw financeError('El evento no pertenece a Ranti.');
 return financeTx(db,async c=>{
  const ref=(await c.query("SELECT operation_id FROM operation_finance_payments WHERE id=$1 AND mode='culqi_sandbox'",[charge.metadata?.finance_payment_id])).rows[0];if(!ref)throw missing();
  const opRef=(await c.query('SELECT publication_id FROM operations WHERE id=$1',[ref.operation_id])).rows[0];
  await c.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE',[opRef.publication_id]);
  const op=(await c.query('SELECT * FROM operations WHERE id=$1 FOR UPDATE',[ref.operation_id])).rows[0],p=await paymentOf(c,op.id);
  const q=(await c.query('SELECT * FROM operation_finance_quotes WHERE id=$1',[p.quote_id])).rows[0];
  if(p.provider_reference&&p.provider_reference!==charge.id)throw financeError('Referencia de cargo diferente.');
  const status=verifySandboxCharge(charge,p,q);
  await applyOutcome(c,op,p,q,status,charge.id,`culqi:${eventId}`);
  if(!['simulated_succeeded','sandbox_succeeded'].includes(p.status))await appendAudit(c,{actorId:null,action:'finance.provider.verified',entityType:'operation',entityId:op.id,newValues:{payment_id:p.id,status}});
  return {received:true};
 });
}
export async function recordFinanceChargeback(db,id,actor,input){
 return financeTx(db,async c=>{
  const {op}=await access(c,id,actor,true);
  return updateDemoChargeback(c,op,await paymentOf(c,id),actor,input);
 });
}
export async function reviewFinanceMovement(db,id,actor,key,input){
 return financeTx(db,async c=>{
  const {op}=await access(c,id,actor,true);
  return inspectLedgerMovement(c,op,await paymentOf(c,id),actor,key,input);
 });
}
export async function readAdminFinance(db,actor,offset=0,search=''){
 if(!Number.isInteger(offset)||offset<0||offset>10000)throw financeError('Página inválida.');
 const term=z.string().trim().max(120).safeParse(search);
 if(!term.success)throw financeError('Revisa el texto de búsqueda.');
 return financeTx(db,async c=>{
  const user=(await c.query('SELECT * FROM users WHERE id=$1 FOR SHARE',[actor])).rows[0];requireCurrentUser(user);if(user.role!=='Administrador')throw missing();
  const rows=(await c.query(`${ledgerEntriesQuery}
    WHERE $2='' OR position(lower($2) in lower(concat_ws(' ',q.id,q.operation_id,p.id,p.provider_reference,
      t.external_reference,'REEMBOLSO-PRUEBA-'||r.reference,'DEV-PRUEBA-'||s.reference,cb.external_reference,
      q.public_snapshot->>'title',q.public_snapshot#>>'{owner,name}',q.public_snapshot#>>'{requester,name}'))) > 0
    ORDER BY q.created_at DESC,q.id LIMIT 20 OFFSET $1`,[offset,term.data])).rows;
  await appendAudit(c,{actorId:actor,action:'finance.admin.read',entityType:'admin-finance',entityId:actor,newValues:{returned_count:rows.length,offset}});
  return {items:rows.map(row=>({...row,movements:ledgerMovements(row)})),offset};
 });
}
async function reconcileRow(c,p,q,cost,reference){
 const losses=(await c.query('SELECT COALESCE(sum(amount_cents),0)::text AS total FROM operation_finance_losses WHERE payment_id=$1',[p.id])).rows[0].total;
 const actual=BigInt(q.economics.total_cents)-BigInt(q.economics.owner_cents)-BigInt(q.economics.guarantee_charged_cents)-BigInt(cost)-BigInt(losses);
 const value={actual_processor_cents:String(cost),nonrecoverable_cents:String(losses),ranti_actual_cents:String(actual),margin_shortfall:actual<BigInt(q.economics.ranti_expected_cents),difference_cents:String(actual-BigInt(q.economics.ranti_expected_cents)),reference,reconciled_at:new Date().toISOString(),no_additional_customer_charge:true};
 await c.query('UPDATE operation_finance_payments SET reconciliation=$2 WHERE id=$1',[p.id,value]);return value;
}
export async function reconcileFinance(db,id,actor,input){
 const data=z.object({reference:z.string().trim().min(3).max(100),actual_cost_cents:z.string().regex(/^\d{1,10}$/).optional(),loss:z.object({kind:z.enum(['refund_cost','chargeback_cost']),amount_cents:z.string().regex(/^\d{1,10}$/),reference:z.string().trim().min(3).max(100)}).strict().optional()}).strict().safeParse(input);
 if(!data.success)throw financeError('Revisa la referencia y el costo en céntimos.');
 return financeTx(db,async c=>{
  await access(c,id,actor,true);
  const p=await paymentOf(c,id);if(!p||!['simulated_succeeded','sandbox_succeeded'].includes(p.status))throw financeError('Primero debe existir un pago confirmado de prueba.');
  const q=(await c.query('SELECT * FROM operation_finance_quotes WHERE id=$1',[p.quote_id])).rows[0];
  let cost;
  if(p.mode==='culqi_sandbox'){
   if(data.data.actual_cost_cents!==undefined)throw financeError('El costo sandbox se consulta al proveedor, no al navegador.');
   const charge=await culqiSandbox.charge(p.provider_reference);if(verifySandboxCharge(charge,p,q)!=='sandbox_succeeded')throw financeError('Culqi no confirmó el pago.');
   if(!Array.isArray(charge.fee_details)||!charge.fee_details.length||charge.fee_details.some(f=>f.currency_code!=='PEN'||!Number.isSafeInteger(f.total_amount)||f.total_amount<0))throw financeError('El proveedor aún no informa el costo conciliable.');
   cost=charge.fee_details.reduce((sum,f)=>sum+BigInt(f.total_amount),0n);
  }else{if(data.data.actual_cost_cents===undefined)throw financeError('Indica el costo ficticio para la conciliación de prueba.');cost=BigInt(data.data.actual_cost_cents);}
  if(data.data.loss){
   const loss=data.data.loss,old=(await c.query('SELECT * FROM operation_finance_losses WHERE reference=$1',[loss.reference])).rows[0];
   if(old&&(old.payment_id!==p.id||old.kind!==loss.kind||String(old.amount_cents)!==loss.amount_cents))throw financeError('Esa referencia de pérdida ya existe con otro contenido.');
   if(!old)await c.query('INSERT INTO operation_finance_losses(payment_id,kind,amount_cents,reference) VALUES($1,$2,$3,$4)',[p.id,loss.kind,loss.amount_cents,loss.reference]);
  }
  const result=await reconcileRow(c,p,q,cost,data.data.reference);
  await appendAudit(c,{actorId:actor,action:'finance.reconciled',entityType:'operation',entityId:id,newValues:{payment_id:p.id,margin_shortfall:result.margin_shortfall}});
  return result;
 });
}
export async function financeDocument(db,id,actor,kind,adminInput){
 const summary=['buyer','owner'].includes(kind);
 if(!summary&&!Object.hasOwn(financeDocumentKinds,kind))throw missing();
 const admin=adminInput!==undefined;
 const reason=admin?z.strictObject({reason:z.string().trim().min(5).max(300),
  action:z.enum(['preview','download']).default('download')}).safeParse(adminInput):null;
 if(admin&&!reason.success)throw financeError('Indica el motivo de consulta de la constancia.');
 return financeTx(db,async c=>{
  const {op}=await access(c,id,actor,admin);
  const side=summary?kind:financeDocumentKinds[kind].side;
  const recipient=side==='buyer'?op.demandante_id:op.oferente_id;
  if(!admin&&actor!==recipient)throw missing();
  const p=await paymentOf(c,id);if(!p)throw financeError('Aún no existe un registro de pago.');
  const q=(await c.query('SELECT * FROM operation_finance_quotes WHERE id=$1',[p.quote_id])).rows[0];
  const audit=()=>appendAudit(c,{actorId:actor,action:`finance.document.${admin?'admin.':''}${kind}`,entityType:'operation',
   entityId:id,newValues:{quote_id:q.id,...(admin?{reason:reason.data.reason,access:reason.data.action,recipient}:{})}});
  if(!summary){
   const transfer=await transferEligibility(c,op,p),refund=await testRefundView(c,op,side==='buyer');
   const settlement=op.modality==='Alquiler'&&op.contract_snapshot?.workflow_payment?
    returnSettlementView(await findReturnSettlement(c,id),op,recipient):null;
   const payout=op.contract_snapshot?.workflow_payment?.payout;
   const variant=financeDocumentVariants({quote:q,payment:p,transfer,refund,settlement,payout}).find(item=>item.kind===kind);
   if(!variant)throw financeError('Este documento sigue pendiente de emisión.');
   await audit();
   return variant;
  }
  const document={kind,operation_id:id,quote_id:q.id,issued_at:q.created_at,...q.public_snapshot,currency:'PEN',payment:paymentPublic(p),test_notice:'CONSTANCIA OPERATIVA DE PRUEBA. No acredita dinero real ni es boleta o factura tributaria.',
   ...(kind==='buyer'?{amounts:buyerQuote(q.economics),total_paid:['simulated_succeeded','sandbox_succeeded'].includes(p.status)?formatCents(q.economics.total_cents):'0.00',explanation:'Precio base para el oferente + un único cargo de servicio + garantía cobrada, si aplica. El cargo ya integra todos los conceptos del servicio; no se añade otra comisión. El total pagado es exclusivamente de prueba.'}:{amounts:ownerQuote(q.economics),transfer:await transferEligibility(c,op,p)})};
  if(op.modality==='Alquiler'&&op.contract_snapshot?.workflow_payment){
   const settlement=returnSettlementView(await findReturnSettlement(c,id),op,recipient);
   if(settlement?.decided)document.return_settlement={amount:kind==='owner'?settlement.decided.owner:settlement.decided.buyer,reference:settlement.reference,received_at:settlement.received_at};
  }
  const refund=await testRefundView(c,op,kind==='buyer');
  if(refund)document.refund=refund;
  await audit();
  return document;
 });
}
