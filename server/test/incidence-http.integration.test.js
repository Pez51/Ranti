import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll,afterEach,beforeAll,beforeEach,describe,it,expect,vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';
const enabled=process.env.RANTI_EPHEMERAL_DB==='1'&&!!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('private operation incidence workflow',()=>{
 let database,db,app,buyer,owner,admin,outsider;
 const auth=id=>({Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`});
 const get=(path,user=buyer)=>request(app).get(path).set(auth(user));
 const post=(path,body,user=buyer)=>request(app).post(path).set(auth(user)).send(body);
 const upload=(id,bytes,type='image/png',user=buyer)=>request(app).post(`/api/incidences/${id}/evidence`).set(auth(user)).set('Content-Type',type).set('X-File-Name',encodeURIComponent('Evidencia privada.png')).send(bytes);
 const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
 beforeAll(async()=>{
  database=await createDisposableDatabase();db=database.db;await(await import('../src/db/migrate.js')).runMigrations(db);
  const user=async role=>(await db.query("INSERT INTO users(email,password_hash,role,status,verification_status,display_name)VALUES($1,'unused',$2,'Activa','Verificado',$3) RETURNING id",[`${randomUUID()}@ucsm.edu.pe`,role,role==='Administrador'?'Administración':'Participante'])).rows[0].id;
  buyer=await user('Egresado');owner=await user('Egresado');admin=await user('Administrador');outsider=await user('Egresado');
 });
 beforeEach(async()=>{vi.resetModules();vi.doMock('../src/config/database.js',()=>({default:db}));app=(await import('../src/app.js')).default;});
 afterEach(()=>vi.unstubAllEnvs());
 afterAll(async()=>{vi.doUnmock('../src/config/database.js');await database?.close();});
 async function operation(modality='Venta'){
  const p=(await db.query(`INSERT INTO publications(owner_id,title,description,category,condition,modality,price,guarantee_amount,status,available_from,available_until)
   VALUES($1,'Artículo de prueba','Equipo cuidado','Tecnología','Bueno',$2,40,0,'Activa',$3,$4) RETURNING *`,[owner,modality,modality==='Venta'?null:new Date(Date.now()+86400000),modality==='Venta'?null:new Date(Date.now()+10*86400000)])).rows[0];
  const dates=modality==='Venta'?{}:{start_date:new Date(Date.now()+2*86400000).toISOString(),end_date:new Date(Date.now()+3*86400000).toISOString()};
  const r=await post('/api/operations',{publication_id:p.id,requested_price:'40.00',requested_guarantee_amount:'0.00',requested_contract_version:1,...dates});expect(r.status,JSON.stringify(r.body)).toBe(201);
  const id=r.body.operation.id;expect((await post(`/api/operations/${id}/accept`,{},owner)).status).toBe(200);return id;
 }
 async function report(id,user=buyer,reason='meeting'){
  const r=await post(`/api/operations/${id}/incidences`,{reason,description:'La entrega no pudo realizarse según lo acordado.'},user);
  expect(r.status,JSON.stringify(r.body)).toBe(200);return r.body;
 }
 async function action(c,action,extra={}){
  return post(`/api/admin/incidences/${c.case.id}/actions`,{action,revision:c.case.revision,body:'Actuación administrativa documentada para este caso.',...extra},admin);
 }
 it('lets both parties report, links the chat to the operation and blocks disbursement until all cases are resolved',async()=>{
  const id=await operation(),first=await report(id),second=await report(id,owner);
  expect(first.case.reporter_id).toBe(buyer);expect(second.case.reporter_id).toBe(owner);expect(second.effect.pending_count).toBe(2);
  const chat=await post(`/api/conversations/operation/${id}`,{});
  expect(chat.status).toBe(200);
  expect((await db.query('SELECT conversation_id FROM operation_conversation_links WHERE operation_id=$1',[id])).rows[0].conversation_id).toBe(chat.body.id);
  const messages=await get(`/api/conversations/${chat.body.id}/messages`);
  expect(messages.body.items.some(m=>m.operation_id===id&&m.event_type?.startsWith('incidence.'))).toBe(true);
  expect((await get(`/api/operations/${id}/finance`)).body.transfer).toMatchObject({eligible:false,blocked_reason:'Incidencias pendientes'});
  expect((await post(`/api/operations/${id}/cancel`,{reason:'Cancelar solicitud'})).status).toBe(409);
  const resolved=await action(first,'resolve',{decision:'continue_operation'});expect(resolved.status).toBe(200);
  expect(resolved.body.effect.pending_count).toBe(1);expect(resolved.body.effect.disbursement_blocked).toBe(true);
  const last=await action(second,'resolve',{decision:'record_only'});expect(last.status).toBe(200);expect(last.body.effect.pending_count).toBe(0);
  expect((await db.query('SELECT status FROM operations WHERE id=$1',[id])).rows[0].status).toBe('Aceptada');
  expect((await db.query('SELECT * FROM operation_finance_transfers WHERE operation_id=$1',[id])).rowCount).toBe(0);
 });
 it('denies anonymous users, outsiders and unilateral participant resolutions',async()=>{
  const id=await operation(),c=await report(id),url=`/api/incidences/${c.case.id}`;
  expect((await request(app).get(url)).status).toBe(401);
  for(const path of [url,`/api/operations/${id}/incidences`])expect((await get(path,outsider)).status).toBe(404);
  expect((await post(`/api/operations/${id}/incidences`,{reason:'meeting',description:'Un reporte no autorizado.'},outsider)).status).toBe(404);
  expect((await post(`${url}/replies`,{revision:1,body:'Información ajena'},outsider)).status).toBe(404);
  expect((await post(`/api/admin/incidences/${c.case.id}/actions`,{action:'resolve',revision:1,body:'Resolver mi propio problema.',decision:'record_only'})).status).toBe(403);
  expect((await post(`${url}/replies`,{revision:1,body:'Intento de resolver',status:'Resuelta'})).status).toBe(400);
  await db.query("UPDATE users SET role='Administrador' WHERE id=$1",[buyer]);
  expect((await post(`/api/admin/incidences/${c.case.id}/actions`,{action:'resolve',revision:1,body:'Resolver mi propio problema.',decision:'record_only'})).status).toBe(403);
  await db.query("UPDATE users SET role='Egresado' WHERE id=$1",[buyer]);
 });
 it('accepts private photos/PDF, enforces file limits and prevents unrelated downloads',async()=>{
  const id=await operation(),c=await report(id),caseId=c.case.id;
  expect((await upload(caseId,png,'image/png',outsider)).status).toBe(404);
  const photo=await upload(caseId,png);expect(photo.status).toBe(200);
  const pdf=await upload(caseId,Buffer.from('%PDF-1.4\nfixture\n%%EOF'),'application/pdf',owner);expect(pdf.status).toBe(200);
  const url=`/api/incidences/${caseId}/evidence/${photo.body.id}`;
  expect((await get(url,owner)).status).toBe(200);expect((await get(url,outsider)).status).toBe(404);
  expect((await get(`/api/admin/incidences/${caseId}/evidence/${photo.body.id}`,admin)).status).toBe(200);
  expect((await upload(caseId,Buffer.from('not an image'))).status).toBe(400);
  expect((await upload(caseId,Buffer.concat([png,Buffer.alloc(2*1024*1024)]))).status).toBe(400);
  for(let n=0;n<3;n++)expect((await upload(caseId,png)).status).toBe(200);
  expect((await upload(caseId,png)).status).toBe(409);
  const read=await get(`/api/incidences/${caseId}`,owner);expect(read.body.evidence).toHaveLength(5);expect(JSON.stringify(read.body)).not.toContain('"bytes"');
  await expect(db.query('DELETE FROM incidence_events WHERE incidence_id=$1',[caseId])).rejects.toThrow(/append-only/);
 });
 it('tracks review, targeted information requests, replies and revision-safe administrative resolution',async()=>{
  const id=await operation(),opened=await report(id);
  const review=await action(opened,'review');expect(review.status).toBe(200);expect(review.body.case.status).toBe('En revisión');
  const waiting=await action(review.body,'request_information',{target_id:buyer});expect(waiting.status).toBe(200);expect(waiting.body.case.status).toBe('Esperando respuesta');
  const otherReply=await post(`/api/incidences/${opened.case.id}/replies`,{revision:waiting.body.case.revision,body:'Aporto el horario que propuse.'},owner);
  expect(otherReply.body.case.status).toBe('Esperando respuesta');
  const answer=await post(`/api/incidences/${opened.case.id}/replies`,{revision:otherReply.body.case.revision,body:'Adjunto la información solicitada.'});expect(answer.body.case.status).toBe('En revisión');
  expect((await action(waiting.body,'resolve',{decision:'record_only'})).status).toBe(409);
  const result=await action(answer.body,'resolve',{decision:'record_only'});expect(result.status).toBe(200);expect(result.body.case.resolved_by).toBe(admin);
  expect(result.body.events.map(e=>e.kind)).toEqual(['opened','review','request_information','reply','reply','resolved']);
  expect((await action(result.body,'review')).status).toBe(409);
  expect((await post(`/api/incidences/${opened.case.id}/replies`,{revision:result.body.case.revision,body:'Cambiar un caso resuelto'})).status).toBe(409);
  expect((await upload(opened.case.id,png)).status).toBe(409);
  expect((await get('/api/admin/incidences',admin)).body.items.some(i=>i.id===opened.case.id)).toBe(true);
 });
 it('guards closure and transfer at database level while pending, then changes only the chosen cancellation',async()=>{
  const id=await operation(),c=await report(id);
  await expect(db.query("UPDATE operations SET status='Cerrada' WHERE id=$1",[id])).rejects.toThrow(/Pending incidence/);
  await expect(db.query("INSERT INTO operation_finance_transfers(operation_id,status) VALUES($1,'pending')",[id])).rejects.toThrow(/Pending incidence/);
  await expect(db.query("INSERT INTO operation_finance_transfers(operation_id,status,mechanism,external_reference,confirmed_at) VALUES($1,'confirmed','fixture',$2,now())",[id,randomUUID()])).rejects.toThrow(/Pending incidence/);
  const resolved=await action(c,'resolve',{decision:'cancel_operation'});expect(resolved.status,JSON.stringify(resolved.body)).toBe(200);
  const op=(await db.query('SELECT * FROM operations WHERE id=$1',[id])).rows[0];expect(op.status).toBe('Cancelada');expect(op.cancelled_by).toBe(admin);expect(op.incidence_cancelled_by).toBe(admin);
  expect((await db.query("SELECT id FROM reservations WHERE operation_id=$1 AND status='Reservada/Bloqueada'",[id])).rowCount).toBe(0);
 });
 it('blocks rental return closure and never cancels a delivered operation through a resolution',async()=>{
  const id=await operation('Alquiler');
  await db.query("UPDATE operations SET status='Entregada/Activa' WHERE id=$1",[id]);
  await db.query("INSERT INTO operation_handoffs(operation_id,revision,proposed_by,agreed_by,meeting_at,location,owner_delivered_at,requester_received_at) VALUES($1,1,$2,$3,now(),'Biblioteca UCSM',now(),now())",[id,owner,buyer]);
  const c=await report(id,owner,'return');
  expect((await post(`/api/operations/${id}/handoff`,{action:'confirm-return',revision:1},owner)).status).toBe(409);
  expect((await action(c,'resolve',{decision:'cancel_operation'})).status).toBe(409);
  expect((await get(`/api/incidences/${c.case.id}`)).body.case.status).toBe('Abierta');
  expect((await action(c,'resolve',{decision:'continue_operation'})).status).toBe(200);
  expect((await db.query('SELECT status FROM operations WHERE id=$1',[id])).rows[0].status).toBe('Entregada/Activa');
 });
 it('accepts a post-close report, preserves a recorded transfer and rejects expired reports',async()=>{
  const id=await operation();await db.query("UPDATE operations SET status='Cerrada' WHERE id=$1",[id]);
  await db.query("INSERT INTO operation_finance_transfers(operation_id,status,mechanism,external_reference,confirmed_at) VALUES($1,'confirmed','fixture-not-a-real-transfer',$2,now())",[id,randomUUID()]);
  const c=await report(id,buyer,'damage');expect(c.case.stage_at_report).toBe('closed');expect(c.effect.transfer.status).toBe('confirmed');expect(c.effect.money_notice).toMatch(/no lo revierte automáticamente/);
  const result=await action(c,'resolve',{decision:'record_only'});expect(result.status).toBe(200);
  expect((await db.query('SELECT status FROM operation_finance_transfers WHERE operation_id=$1',[id])).rows[0].status).toBe('confirmed');
  const expired=(await db.query(`INSERT INTO operations(publication_id,demandante_id,oferente_id,modality,status,contract_snapshot,accepted_at,decided_at,decided_by,
   requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at,closed_at)
   SELECT publication_id,demandante_id,oferente_id,modality,'Cerrada',contract_snapshot,accepted_at,decided_at,decided_by,
   requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at,now()-interval '8 days' FROM operations WHERE id=$1 RETURNING id`,[id])).rows[0].id;
  expect((await post(`/api/operations/${expired}/incidences`,{reason:'damage',description:'Un reporte posterior al plazo configurado.'})).status).toBe(409);
  vi.stubEnv('INCIDENCE_REPORT_WINDOW_DAYS','10');
  expect((await post(`/api/operations/${expired}/incidences`,{reason:'damage',description:'Un reporte dentro del nuevo plazo configurado.'})).status).toBe(200);
 });
 it('rejects reasons from a different modality or stage without creating a case',async()=>{
  const id=await operation();
  for(const reason of ['return','damage','unknown'])expect((await post(`/api/operations/${id}/incidences`,{reason,description:'Este motivo no corresponde a esta etapa.'})).status).toBe(400);
  expect((await get(`/api/operations/${id}/incidences`)).body.items).toHaveLength(0);
 });
 it('blocks an otherwise eligible paid sale and never refunds, cancels or disburses implicitly',async()=>{
  const id=await operation(),url=`/api/operations/${id}`;
  expect((await post(`${url}/handoff`,{action:'propose',revision:0,meeting_at:new Date(Date.now()+3600000).toISOString(),location:'Biblioteca UCSM'},owner)).status).toBe(200);
  expect((await post(`${url}/handoff`,{action:'agree',revision:1})).status).toBe(200);
  const q=(await post(`${url}/finance/quotes`,{method:'simulated'})).body;
  expect((await post(`${url}/finance/payments`,{quote_id:q.id,idempotency_key:randomUUID(),accepted_total:q.buyer.total,confirm_test:true})).status).toBe(200);
  await db.query("UPDATE operation_handoffs SET meeting_at=now()-interval '1 hour' WHERE operation_id=$1",[id]);
  expect((await post(`${url}/handoff`,{action:'confirm-delivery',revision:1},owner)).status).toBe(200);
  expect((await post(`${url}/handoff`,{action:'confirm-delivery',revision:1})).status).toBe(200);
  expect((await get(`${url}/finance`)).body.transfer.eligible).toBe(true);
  const c=await report(id,buyer,'damage');
  expect((await get(`${url}/finance`)).body.transfer).toMatchObject({eligible:false,blocked_reason:'Incidencias pendientes'});
  expect((await action(c,'resolve',{decision:'cancel_operation'})).status).toBe(409);
  expect((await action(c,'resolve',{decision:'continue_operation'})).status).toBe(200);
  const finance=(await get(`${url}/finance`)).body;
  expect(finance.transfer).toMatchObject({eligible:true,status:'not_enabled',confirmed_at:null});expect(finance.payment.status).toBe('simulated_succeeded');
  expect((await db.query('SELECT status FROM operations WHERE id=$1',[id])).rows[0].status).toBe('Entregada/Activa');
  expect((await db.query('SELECT id FROM operation_finance_losses WHERE payment_id=$1',[finance.payment.id])).rowCount).toBe(0);
 });
 it('serializes competing administrative decisions without duplicating the history',async()=>{
  const id=await operation(),c=await report(id);
  const results=await Promise.all([action(c,'resolve',{decision:'record_only'}),action(c,'resolve',{decision:'continue_operation'})]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  const successful=results.find(r=>r.status===200);
  const read=await get(`/api/incidences/${c.case.id}`);
  expect(read.body.case.resolution_action).toBe(successful.body.case.resolution_action);
  expect(read.body.events.filter(e=>e.kind==='resolved')).toHaveLength(1);
 });
});
