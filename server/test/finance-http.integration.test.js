import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';
import { simulatedTariff } from '../src/modules/operations/finance.policy.js';
const enabled=process.env.RANTI_EPHEMERAL_DB==='1'&&!!process.env.TEST_DATABASE_URL;
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
describe.skipIf(!enabled)('operation finance and private documents',()=>{
 let database,db,app,buyer,owner,admin,other;
 const auth=id=>({Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`});
 const get=(path,user=buyer)=>request(app).get(path).set(auth(user));
 const post=(path,body,user=buyer)=>request(app).post(path).set(auth(user)).send(body);
 beforeAll(async()=>{
  database=await createDisposableDatabase();db=database.db;await(await import('../src/db/migrate.js')).runMigrations(db);
  const user=async role=>(await db.query("INSERT INTO users(email,password_hash,role,status,verification_status,display_name)VALUES($1,'unused',$2,'Activa','Verificado','Cuenta de prueba') RETURNING id",[`${randomUUID()}@ucsm.edu.pe`,role])).rows[0].id;
  buyer=await user('Egresado');owner=await user('Egresado');admin=await user('Administrador');other=await user('Egresado');
 });
 beforeEach(async()=>{vi.resetModules();vi.doMock('../src/config/database.js',()=>({default:db}));app=(await import('../src/app.js')).default;});
 afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
 afterAll(async()=>{vi.doUnmock('../src/config/database.js');await database?.close();});
 async function operation(modality='Venta', guaranteeRequired=false){
  const p=(await db.query(`INSERT INTO publications(owner_id,title,description,category,condition,modality,price,guarantee_amount,status,available_from,available_until,guarantee_required)
    VALUES($1,'Artículo financiero','Prueba','Tecnología','Bueno',$2,40,$3,'Activa',$4,$5,$6) RETURNING *`,[owner,modality,modality==='Venta'?0:100,modality==='Venta'?null:new Date(Date.now()+86400000),modality==='Venta'?null:new Date(Date.now()+10*86400000),guaranteeRequired])).rows[0];
  const dates=modality==='Venta'?{}:{start_date:new Date(Date.now()+2*86400000).toISOString(),end_date:new Date(Date.now()+3*86400000).toISOString()};
  const r=await post('/api/operations',{publication_id:p.id,requested_price:'40.00',requested_guarantee_amount:String(p.guarantee_amount),requested_contract_version:1,...dates});expect(r.status,JSON.stringify(r.body)).toBe(201);
  const id=r.body.operation.id;
  expect((await post(`/api/operations/${id}/accept`,{},owner)).status).toBe(200);
  expect((await post(`/api/operations/${id}/handoff`,{action:'propose',revision:0,location:'Biblioteca UCSM',meeting_at:new Date(Date.now()+3600000).toISOString()},owner)).status).toBe(200);
  expect((await post(`/api/operations/${id}/handoff`,{action:'agree',revision:1})).status).toBe(200);
  return id;
 }
 async function quote(id,method='simulated'){const r=await post(`/api/operations/${id}/finance/quotes`,{method});expect(r.status,JSON.stringify(r.body)).toBe(200);return r.body;}
 const payload=q=>({quote_id:q.id,idempotency_key:randomUUID(),accepted_total:q.buyer.total,confirm_test:true});
 it('preserves the tiered income, prevents duplicate charges and protects both documents and internal allocation',async()=>{
  vi.stubEnv('RANTI_PROCESSOR_TARIFFS',JSON.stringify({fixture:{...simulatedTariff,version:'fixture-not-real',percentage_ppm:50000,fixed_cents:100}}));
  const id=await operation(),q=await quote(id,'fixture'),url=`/api/operations/${id}/finance`;
  expect(q.buyer).toMatchObject({price:'36.00',service_charge:'7.16',total:'43.16'});
  expect((await get(url,other)).status).toBe(404);expect((await post(`${url}/quotes`,{method:'simulated'},owner)).status).toBe(404);
  const body=payload(q),paid=await post(`${url}/payments`,body);expect(paid.status,JSON.stringify(paid.body)).toBe(200);expect(paid.body.payment.status).toBe('simulated_succeeded');
  expect((await post(`${url}/payments`,body)).body.payment.id).toBe(paid.body.payment.id);
  expect((await post(`${url}/payments`,{...body,idempotency_key:randomUUID()})).status).toBe(409);
  expect((await post(`/api/operations/${id}/payment-simulation`,{confirm_simulation:true})).status).toBe(409);
  expect((await db.query('SELECT id FROM transactions WHERE operation_id=$1',[id])).rowCount).toBe(0);
  const buyerDoc=await get(`${url}/documents/buyer`),ownerDoc=await get(`${url}/documents/owner`,owner);
  expect(buyerDoc.body.total_paid).toBe('43.16');expect(ownerDoc.body.amounts.net_amount).toBe('36.00');expect(ownerDoc.body.transfer.status).toBe('blocked');
  expect((await get(`${url}/documents/owner`)).status).toBe(404);expect((await get(`${url}/documents/buyer`,owner)).status).toBe(404);
  for(const result of [paid.body,buyerDoc.body,ownerDoc.body,(await get(url,owner)).body]){
   const text=JSON.stringify(result);expect(text).not.toContain('processor_expected_cents');expect(text).not.toContain('ranti_expected_cents');expect(text).not.toContain('tariff_snapshot');
  }
  expect((await get('/api/admin/finance')).status).toBe(403);
  const internal=(await get('/api/admin/finance',admin)).body.items.find(item=>item.id===q.id);expect(internal.economics.ranti_expected_cents).toBe('400');
  const reconciled=await post(`/api/admin/finance/${id}/reconciliation`,{reference:'fixture-statement',actual_cost_cents:'316'},admin);
  expect(reconciled.status).toBe(200);expect(reconciled.body.ranti_actual_cents).toBe('400');expect(reconciled.body.margin_shortfall).toBe(false);
  const loss=await post(`/api/admin/finance/${id}/reconciliation`,{reference:'fixture-statement',actual_cost_cents:'316',loss:{kind:'chargeback_cost',amount_cents:'150',reference:'fixture-chargeback'}},admin);
  expect(loss.body.margin_shortfall).toBe(true);expect(loss.body.no_additional_customer_charge).toBe(true);expect(loss.body.nonrecoverable_cents).toBe('150');
  expect((await post(`/api/admin/finance/${id}/reconciliation`,{reference:'fixture-statement',actual_cost_cents:'316',loss:{kind:'chargeback_cost',amount_cents:'150',reference:'fixture-chargeback'}},admin)).body.nonrecoverable_cents).toBe('150');
  await expect(db.query("UPDATE operation_finance_quotes SET economics='{}' WHERE id=$1",[q.id])).rejects.toThrow(/immutable/);
 });
 it.each(['failed','pending'])('keeps %s payments distinct from completed operations and never issues a paid receipt',async scenario=>{
  const id=await operation(),q=await quote(id),url=`/api/operations/${id}/finance`;
  const r=await post(`${url}/payments`,{...payload(q),scenario});expect(r.status).toBe(200);expect(r.body.payment.status).toBe(scenario);
  expect((await get(`${url}/documents/buyer`)).body.total_paid).toBe('0.00');expect(r.body.transfer.eligible).toBe(false);
  if(scenario==='pending')expect((await post(`/api/operations/${id}/cancel`,{reason:'No liberar reserva con pago incierto'})).status).toBe(409);
 });
 it('requires renewed acceptance after changing method or the quoted total',async()=>{
  const id=await operation(),q=await quote(id),url=`/api/operations/${id}/finance`;
  expect((await post(`${url}/quotes`,{method:'unknown'})).status).toBe(409);
  expect((await post(`${url}/payments`,{...payload(q),accepted_total:'0.01'})).status).toBe(409);
  await quote(id);expect((await post(`${url}/payments`,payload(q))).status).toBe(409);
  expect((await get(url)).body.payment).toBeNull();
 });
 it('requires rental return and no pending incidence before release eligibility, never confirms a transfer',async()=>{
  const id=await operation('Alquiler'),q=await quote(id),url=`/api/operations/${id}/finance`;
  const r=await post(`${url}/payments`,payload(q));expect(r.status).toBe(200);expect(q.buyer.guarantee_declared).toBe('100.00');expect(q.buyer.guarantee_charged).toBe('0.00');
  await db.query("UPDATE operation_handoffs SET owner_delivered_at=now(),requester_received_at=now() WHERE operation_id=$1",[id]);
  expect((await get(url,owner)).body.transfer.eligible).toBe(false);
  await db.query("UPDATE operation_handoffs SET owner_returned_at=now(),requester_returned_at=now() WHERE operation_id=$1",[id]);
  expect((await get(url,owner)).body.transfer).toMatchObject({eligible:true,status:'not_enabled',reference:null});
  await db.query("INSERT INTO incidences(reporter_id,operation_id,type,description,status)VALUES($1,$2,'Prueba','Incidencia de prueba','Abierta')",[buyer,id]);
  expect((await get(url,owner)).body.transfer).toMatchObject({eligible:false,blocked_reason:'Incidencias pendientes'});
 });
 it('verifies sandbox notifications server-side and ignores duplicate notifications without retrying a charge',async()=>{
  vi.stubEnv('CULQI_TEST_SECRET_KEY','sk_test_NOT_A_REAL_KEY');vi.stubEnv('RANTI_PROCESSOR_TARIFFS',JSON.stringify({sandbox_fixture:{...simulatedTariff,environment:'sandbox',version:'sandbox-fixture-not-contracted'}}));
  const {culqiSandbox}=await import('../src/modules/operations/culqi-sandbox.adapter.js');
  const create=vi.spyOn(culqiSandbox,'create').mockRejectedValue(new Error('Ambiguous timeout'));
  const id=await operation(),q=await quote(id,'sandbox_fixture'),url=`/api/operations/${id}/finance`,body={...payload(q),source_id:'tkn_test_fixture'};
  const pending=await post(`${url}/payments`,body);expect(pending.body.payment.status).toBe('pending');
  await post(`${url}/payments`,body);expect(create).toHaveBeenCalledTimes(1);
  const charge={id:'chr_test_fixture',amount:Number(q.buyer.total.replace('.','')),currency:'PEN',state:'Exitosa',response_code:'venta_exitosa',metadata:{finance_payment_id:pending.body.payment.id,finance_quote_id:q.id},fee_details:[{total_amount:0,currency_code:'PEN'}]};
  vi.spyOn(culqiSandbox,'event').mockResolvedValue({id:'evt_test_fixture',data:{id:charge.id}});vi.spyOn(culqiSandbox,'charge').mockResolvedValue(charge);
  expect((await request(app).post('/api/finance/events/culqi').send({id:'evt_test_fixture',state:'fake'})).status).toBe(200);
  expect((await request(app).post('/api/finance/events/culqi').send({id:'evt_test_fixture'})).status).toBe(200);
  expect((await get(url)).body.payment.status).toBe('sandbox_succeeded');expect(create).toHaveBeenCalledTimes(1);
  expect((await db.query('SELECT operation_id FROM operation_payment_simulations WHERE operation_id=$1',[id])).rowCount).toBe(1);
 });
 it('applies the agreed methods, protects the OTP, and settles a disputed guarantee only once',async()=>{
  const settings=(user,body)=>request(app).patch('/api/users/me/payment-profile').set(auth(user)).send(body);
  expect((await settings(owner,{action:'accepted',methods:['tarjeta_prueba']})).status).toBe(409);
  expect((await settings(owner,{action:'destination',channel:'banco_prueba'})).status).toBe(200);
  expect((await settings(owner,{action:'accepted',methods:['tarjeta_prueba']})).body.owner_ready).toBe(true);
  expect((await settings(buyer,{action:'buyer',method:'tarjeta_prueba'})).status).toBe(200);
  const id=await operation('Alquiler',true),url=`/api/operations/${id}`;
  const act=(action,user=buyer,fields={})=>post(`${url}/handoff`,{action,revision:1,...fields},user);
  await settings(owner,{action:'destination',channel:'plin_prueba'});
  await settings(owner,{action:'accepted',methods:['plin_prueba']});
  expect((await get(`${url}/finance`,owner)).body.payout.channel).toBe('banco_prueba');
  expect((await post(`${url}/finance/quotes`,{method:'plin_prueba'})).status).toBe(409);
  expect((await act('generate-delivery-code')).status).toBe(409);
  const q=await quote(id,'tarjeta_prueba');
  expect(q.buyer).toMatchObject({guarantee_charged:'100.00',total:'140.00'});
  expect((await post(`${url}/payment-simulation`,{confirm_simulation:true})).status).toBe(409);
  expect((await post(`${url}/finance/payments`,payload(q))).body.payment.status).toBe('simulated_succeeded');
  await db.query("UPDATE operation_handoffs SET meeting_at=now()-interval '1 minute' WHERE operation_id=$1",[id]);
  expect((await act('confirm-delivery',owner)).status).toBe(409);
  const generated=await act('generate-delivery-code');
  expect(generated.status,JSON.stringify(generated.body)).toBe(200);
  const code=generated.body.operation.handoff.delivery_code;
  expect(code).toMatch(/^\d{6}$/);
  expect((await get(url,owner)).body.operation.handoff.delivery_code).toBeNull();
  const wrong=await act('verify-delivery-code',owner,{code:code==='123456'?'123457':'123456'});
  expect(wrong.body.handoff_error).toMatch(/incorrecto/);
  expect((await db.query('SELECT delivery_otp_attempts FROM operation_handoffs WHERE operation_id=$1',[id])).rows[0].delivery_otp_attempts).toBe(1);
  expect((await act('verify-delivery-code',owner,{code})).body.operation.status).toBe('Entregada/Activa');
  expect((await act('record-return',buyer,{notes:'Devuelto en biblioteca con accesorios.'})).status).toBe(200);
  expect((await act('inspect-return',owner,{notes:'Se encontró un daño.',retention_cents:'4000'})).status).toBe(409);
  const photo=await request(app).post(`${url}/return-evidence`).set(auth(owner))
   .set('Content-Type','image/png').set('X-File-Name','estado.png').send(png);
  expect(photo.status,JSON.stringify(photo.body)).toBe(200);
  const evidenceUrl=`${url}/return-evidence/${photo.body.evidence[0].id}`;
  expect((await get(evidenceUrl,other)).status).toBe(404);
  expect((await get(evidenceUrl,buyer)).status).toBe(200);
  const inspection=await act('inspect-return',owner,{notes:'Revisión del artículo y accesorios.',retention_cents:'4000'});
  expect(inspection.body.operation.return_settlement.proposed).toMatchObject({buyer:'60.00',owner:'40.00'});
  expect((await get(`${url}/finance`,owner)).body.transfer.eligible).toBe(false);
  const opened=await post(`${url}/incidences`,{reason:'guarantee',description:'No estoy de acuerdo con la inspección.'});
  expect(opened.status,JSON.stringify(opened.body)).toBe(200);
  expect((await act('accept-inspection')).status).toBe(409);
  const decision={action:'resolve',revision:opened.body.case.revision,decision:'settle_guarantee',
   retention_cents:'3000',body:'El análisis respalda retener solo treinta soles.'};
  const resolve=()=>post(`/api/admin/incidences/${opened.body.case.id}/actions`,decision,admin);
  const resolved=await resolve();
  expect(resolved.status,JSON.stringify(resolved.body)).toBe(200);
  expect(resolved.body.return_settlement.decided).toMatchObject({buyer:'70.00',owner:'30.00'});
  expect((await resolve()).status).toBe(409);
  expect((await act('confirm-return-receipt')).body.operation.return_settlement.received_at).toBeTruthy();
  expect((await get(url,owner)).body.operation.return_settlement.received_at).toBeNull();
  expect((await act('confirm-return-receipt',owner)).body.operation.return_settlement.received_at).toBeTruthy();
  expect((await get(`${url}/finance/documents/buyer`)).body.return_settlement.amount).toBe('70.00');
  expect((await get(`${url}/finance/documents/owner`,owner)).body.return_settlement.amount).toBe('30.00');
  expect((await db.query('SELECT id FROM transactions WHERE operation_id=$1',[id])).rowCount).toBe(0);
 });
 it.each(['Venta','Alquiler'])('resolves an explicit %s refund while preserving the original payment and protecting receipt confirmation',async modality=>{
  const settings=(user,body)=>request(app).patch('/api/users/me/payment-profile').set(auth(user)).send(body);
  await settings(owner,{action:'destination',channel:'banco_prueba'});
  await settings(owner,{action:'accepted',methods:['yape_prueba']});
  await settings(buyer,{action:'buyer',method:'yape_prueba'});
  const sale=modality==='Venta';
  const id=await operation(modality,!sale),url=`/api/operations/${id}`,finance=`${url}/finance`;
  const q=await quote(id,'yape_prueba');
  const paid=await post(`${finance}/payments`,payload(q));
  expect(paid.status,JSON.stringify(paid.body)).toBe(200);
  if(sale){
   await db.query("UPDATE operation_handoffs SET meeting_at=now()-interval '1 minute' WHERE operation_id=$1",[id]);
   const issued=await post(`${url}/handoff`,{action:'generate-delivery-code',revision:1});
   const delivered=await post(`${url}/handoff`,{action:'verify-delivery-code',revision:1,code:issued.body.operation.handoff.delivery_code},owner);
   expect(delivered.body.operation.status).toBe('Cerrada');
   expect((await post(`${finance}/receipts/payout`,{},owner)).body.transfer.received_at).toBeTruthy();
  }
  const opened=await post(`${url}/incidences`,{reason:sale?'not_as_described':'meeting',description:'Solicito revisar la devolución del pago.'});
  expect(opened.status,JSON.stringify(opened.body)).toBe(200);
  const caseUrl=`/api/admin/incidences/${opened.body.case.id}`;
  const report=await get(caseUrl,admin);
  expect(report.body.refund_options.before_delivery).toBe(!sale);
  const resolve={action:'resolve',revision:opened.body.case.revision,decision:'refund_payment',body:'Reembolso revisado y aprobado en la simulación.'};
  expect((await post(`${caseUrl}/actions`,{...resolve,refund_cents:'99999999'},admin)).status).toBe(409);
  if(!sale)expect((await post(`${caseUrl}/actions`,{...resolve,refund_cents:'1000'},admin)).status).toBe(409);
  const result=await post(`${caseUrl}/actions`,{...resolve,refund_cents:sale?'1000':'14000'},admin);
  expect(result.status,JSON.stringify(result.body)).toBe(200);
  expect(result.body.operation.status).toBe(sale?'Cerrada':'Cancelada');
  expect(result.body.refund.amount).toBe(sale?'10.00':'140.00');
  expect((await post(`${finance}/receipts/refund`,{},owner)).status).toBe(404);
  expect((await post(`${finance}/receipts/refund`,{})).body.refund.received_at).toBeTruthy();
  expect((await get(finance)).body.payment.id).toBe(paid.body.payment.id);
  expect((await get(`${finance}/documents/buyer`)).body.refund.amount).toBe(result.body.refund.amount);
  expect((await post(`/api/admin/finance/${id}/documents/buyer`,{reason:'Revisión de la devolución'},other)).status).toBe(403);
  const adminDoc=await post(`/api/admin/finance/${id}/documents/buyer`,{reason:'Revisión de la devolución'},admin);
  expect(adminDoc.status,JSON.stringify(adminDoc.body)).toBe(200);
  expect(adminDoc.body).toMatchObject({kind:'buyer',refund:{amount:result.body.refund.amount}});
  expect((await db.query('SELECT id FROM transactions WHERE operation_id=$1',[id])).rowCount).toBe(0);
 });
 it('expires unpaid reservations, protects an uncertain payment, and closes only an undisputed silent return',async()=>{
  const settings=(user,body)=>request(app).patch('/api/users/me/payment-profile').set(auth(user)).send(body);
  await settings(owner,{action:'destination',channel:'banco_prueba'});
  await settings(owner,{action:'accepted',methods:['tarjeta_prueba']});
  await settings(buyer,{action:'buyer',method:'tarjeta_prueba'});
  const {expireOperationRequests,closeUnansweredReturns,openOverdueReturns}=await import('../src/modules/operations/workflow-jobs.js');
  const unpaid=await operation(),uncertain=await operation();
  const pendingQuote=await quote(uncertain,'tarjeta_prueba');
  expect((await post(`/api/operations/${uncertain}/finance/payments`,{...payload(pendingQuote),scenario:'pending'})).body.payment.status).toBe('pending');
  await db.query("UPDATE operations SET payment_expires_at=clock_timestamp()-interval '1 minute' WHERE id=ANY($1::uuid[])",[[unpaid,uncertain]]);
  expect(await expireOperationRequests(db)).toContain(unpaid);
  expect((await get(`/api/operations/${unpaid}`)).body.operation.expiry_reason).toBe('payment_deadline_expired');
  expect((await get(`/api/operations/${uncertain}`)).body.operation.status).toBe('Pendiente de pago/garantía');
  expect((await db.query('SELECT status FROM reservations WHERE operation_id=$1',[unpaid])).rows[0].status).toBe('Disponible');
  const id=await operation('Alquiler',true),url=`/api/operations/${id}`;
  const charge=await quote(id,'tarjeta_prueba');
  expect((await post(`${url}/finance/payments`,payload(charge))).body.payment.status).toBe('simulated_succeeded');
  await db.query("UPDATE operation_handoffs SET meeting_at=now()-interval '1 minute' WHERE operation_id=$1",[id]);
  const act=(action,user=buyer,fields={})=>post(`${url}/handoff`,{action,revision:1,...fields},user);
  const first=await act('generate-delivery-code');
  const again=await act('regenerate-delivery-code');
  expect(again.body.operation.handoff.delivery_code).not.toBe(first.body.operation.handoff.delivery_code);
  expect((await act('verify-delivery-code',owner,{code:again.body.operation.handoff.delivery_code})).body.operation.status).toBe('Entregada/Activa');
  const end=(await db.query('SELECT end_date FROM operations WHERE id=$1',[id])).rows[0].end_date;
  const late=new Date(end.getTime()+25*3600000);
  expect(await openOverdueReturns(db,{now:late})).toContain(id);
  expect(await openOverdueReturns(db,{now:late})).not.toContain(id);
  expect((await act('record-return',buyer,{notes:'Devuelto conforme en el campus.',return_location:'Biblioteca UCSM',accessories_confirmed:true})).status).toBe(200);
  await db.query("UPDATE operation_return_settlements SET inspection_due_at=now()-interval '1 minute' WHERE operation_id=$1",[id]);
  expect(await closeUnansweredReturns(db)).not.toContain(id);
  const pending=(await db.query("SELECT id,revision FROM incidences WHERE operation_id=$1 AND system_generated",[id])).rows[0];
  expect((await post(`/api/admin/incidences/${pending.id}/actions`,{action:'resolve',revision:pending.revision,
   decision:'continue_operation',body:'Se registró la devolución del equipo.'},admin)).status).toBe(200);
  const closed=await closeUnansweredReturns(db,{now:new Date(Date.now()+80*3600000)});
  expect(closed).toContain(id);
  expect(await closeUnansweredReturns(db,{now:new Date(Date.now()+80*3600000)})).not.toContain(id);
  const settled=(await get(url)).body.operation.return_settlement;
  expect(settled).toMatchObject({closed_by_silence:true,decided:{buyer:'100.00',owner:'0.00'},received_at:null});
  expect((await get(`${url}/review`)).body.eligible).toBe(true);
  const reported=await post(`${url}/incidences`,{reason:'money_not_received',movement_reference:settled.reference,
   occurred_at:new Date().toISOString(),description:'No veo el movimiento en el medio original.'});
  expect(reported.status,JSON.stringify(reported.body)).toBe(200);
  expect(reported.body.movement.kind).toBe('guarantee');
  expect((await post(`${url}/incidences`,{reason:'money_not_received',movement_reference:settled.reference,
   occurred_at:new Date().toISOString(),description:'Sigue pendiente el mismo movimiento.'})).status).toBe(409);
  const auditUrl=`/api/admin/audit?entity=operation&reference=${id}&action=return_settled`;
  expect((await get(auditUrl,buyer)).status).toBe(403);
  const audit=await get(auditUrl,admin);
  expect(audit.status,JSON.stringify(audit.body)).toBe(200);
  expect(audit.body.items).toMatchObject([{action:'finance.return_settled_by_silence',actor_id:null,
    after:{buyer:'100.00',owner:'0.00'}}]);
  expect((await get(`/api/admin/audit/export?entity=operation&reference=${id}`,admin)).headers['content-disposition']).toMatch(/ranti-bitacora/);
 });
});
