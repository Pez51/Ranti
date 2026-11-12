import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll,beforeEach,afterAll,afterEach,describe,it,expect,vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';
const enabled=process.env.RANTI_EPHEMERAL_DB==='1'&&!!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('closed operation reviews and role reputation privacy',()=>{
 let database,db,app,buyer,owner,other,ownerEmail;
 const auth=id=>({Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`});
 const get=(path,user=buyer)=>request(app).get(path).set(auth(user));
 const post=(path,body,user=buyer)=>request(app).post(path).set(auth(user)).send(body);
 const body={person_rating:4,person_comment:'Comentario PERSONAL reservado para el oferente',product_rating:2,product_comment:'Reseña PRODUCTO distinta de la persona'};
 beforeAll(async()=>{
  database=await createDisposableDatabase();db=database.db;await(await import('../src/db/migrate.js')).runMigrations(db);
  const create=async()=>{const email=`${randomUUID()}@ucsm.edu.pe`;const id=(await db.query("INSERT INTO users(email,password_hash,role,status,verification_status,display_name,reputation_score) VALUES($1,$2,'Egresado','Activa','Verificado','Participante',4.99) RETURNING id",[email,bcrypt.hashSync('Fixture-Reviews2026!',4)])).rows[0].id;return {id,email};};
  buyer=(await create()).id;const o=await create();owner=o.id;ownerEmail=o.email;other=(await create()).id;
 });
 beforeEach(async()=>{vi.resetModules();vi.doMock('../src/config/database.js',()=>({default:db}));app=(await import('../src/app.js')).default;});
 afterEach(()=>vi.unstubAllEnvs());
 afterAll(async()=>{vi.doUnmock('../src/config/database.js');await database?.close();});
 async function operation(modality='Venta',closed=true,ownerId=owner,buyerId=buyer){
  const p=(await db.query(`INSERT INTO publications(owner_id,title,description,category,condition,modality,price,guarantee_amount,status,available_from,available_until)
   VALUES($1,'Artículo evaluable','Equipo cuidado','Tecnología','Bueno',$2,$3,0,'Activa',$4,$5) RETURNING id`,[ownerId,modality,modality==='Préstamo'?0:40,modality==='Venta'?null:new Date(Date.now()+86400000),modality==='Venta'?null:new Date(Date.now()+10*86400000)])).rows[0];
  const dates=modality==='Venta'?{}:{start_date:new Date(Date.now()+2*86400000).toISOString(),end_date:new Date(Date.now()+3*86400000).toISOString()};
  const r=await post('/api/operations',{publication_id:p.id,requested_price:modality==='Préstamo'?'0.00':'40.00',requested_guarantee_amount:'0.00',requested_contract_version:1,...dates},buyerId);
  expect(r.status,JSON.stringify(r.body)).toBe(201);const id=r.body.operation.id;
  expect((await post(`/api/operations/${id}/accept`,{},ownerId)).status).toBe(200);
  if(closed){
   await db.query(`INSERT INTO operation_handoffs(operation_id,revision,proposed_by,agreed_by,meeting_at,location,owner_delivered_at,requester_received_at,owner_returned_at,requester_returned_at)
    VALUES($1,1,$2,$3,now(),'Biblioteca UCSM',now(),now(),$4,$4)`,[id,ownerId,buyerId,modality==='Venta'?null:new Date()]);
   if(modality!=='Préstamo')await db.query('INSERT INTO operation_payment_simulations(operation_id,requester_id,amount,unit_count)VALUES($1,$2,40,1)',[id,buyerId]);
   await db.query("UPDATE operations SET status='Cerrada' WHERE id=$1",[id]);
  }
  return {id,publicationId:p.id};
 }
 async function evaluate(id,data=body,user=buyer){return post(`/api/operations/${id}/review`,data,user);}
 async function historical(op,days){
  const at=new Date(Date.now()-days*86400000);
  const row=(await db.query(`INSERT INTO operations(publication_id,demandante_id,oferente_id,modality,status,start_date,end_date,contract_snapshot,
   accepted_at,decided_at,decided_by,requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at,requested_rental_unit,closed_at)
   SELECT publication_id,demandante_id,oferente_id,modality,'Cerrada',start_date,end_date,contract_snapshot||jsonb_build_object('accepted_at',$2::timestamptz-interval '1 day'),
   $2::timestamptz-interval '1 day',$2::timestamptz-interval '1 day',decided_by,requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at,requested_rental_unit,$2
   FROM operations WHERE id=$1 RETURNING id`,[op.id,at])).rows[0];
  await db.query(`INSERT INTO operation_handoffs(operation_id,revision,proposed_by,agreed_by,meeting_at,location,owner_delivered_at,requester_received_at)
   VALUES($1,1,$2,$3,$4,'Biblioteca UCSM',$4,$4)`,[row.id,owner,buyer,at]);
  await db.query('INSERT INTO operation_payment_simulations(operation_id,requester_id,amount,unit_count)VALUES($1,$2,40,1)',[row.id,buyer]);return row.id;
 }
 it('keeps all review content hidden until mutual evaluation and separates person scores from product reviews',async()=>{
  const op=await operation();const first=await evaluate(op.id);expect(first.status).toBe(200);expect(first.body).toMatchObject({submitted:true,published:false});
  const endpoints=[`/api/operations/${op.id}/review`,`/api/users/${owner}/reviews`,`/api/users/${owner}/profile`,`/api/publications/${op.publicationId}/reviews`];
  for(const url of endpoints){const r=await get(url);expect(r.status).toBe(200);expect(JSON.stringify(r.body)).not.toContain('PERSONAL reservado');expect(JSON.stringify(r.body)).not.toContain('PRODUCTO distinta');expect(r.body).not.toHaveProperty('person_rating');}
  expect((await get(`/api/publications/${op.publicationId}/reviews`)).body).toMatchObject({count:0,score:null,items:[]});
  const before=await get(`/api/users/${owner}/reviews`);const ownerCount=before.body.reputation.as_owner.count;
  vi.stubEnv('REVIEW_PUBLICATION_DAYS','1');
  const frozen=await get(`/api/operations/${op.id}/review`,owner);
  expect(frozen.body.publish_after).toBe(first.body.publish_after);expect(frozen.body.publication_days).toBe(7);
  const second=await evaluate(op.id,{person_rating:3,person_comment:'Comentario recibido por quien compró'},owner);
  expect(second.status).toBe(200);expect(second.body.published).toBe(true);
  expect(second.body.publish_after).toBe(first.body.publish_after);
  const product=(await get(`/api/publications/${op.publicationId}/reviews`)).body;
  expect(product).toMatchObject({count:1,score:2});expect(product.items[0]).toMatchObject({rating:2,comment:body.product_comment});
  expect(JSON.stringify(product)).not.toContain(body.person_comment);expect(JSON.stringify(product)).not.toContain('person_rating');
  const foreign=(await get(`/api/users/${owner}/reviews`)).body;
  expect(foreign.reputation.as_owner.count).toBe(ownerCount+1);expect(foreign.received_comments).toEqual([]);
  const own=(await get(`/api/users/${owner}/reviews`,owner)).body;
  expect(own.received_comments.some(c=>c.comment===body.person_comment)).toBe(true);
  expect(own.reputation.as_owner).not.toHaveProperty('score');expect(own.received_comments.every(c=>!Object.hasOwn(c,'rating'))).toBe(true);
 });
 it('publishes a single evaluation when the deadline from closure has expired, without a background job',async()=>{
  const op=await operation(),past=await historical(op,2);vi.stubEnv('REVIEW_PUBLICATION_DAYS','1');
  const r=await evaluate(past);expect(r.status).toBe(200);expect(r.body.published).toBe(true);
  expect((await get(`/api/users/${owner}/reviews`,owner)).body.received_comments.some(c=>c.comment===body.person_comment)).toBe(true);
  const product=(await get(`/api/publications/${op.publicationId}/reviews`)).body;expect(product.count).toBe(1);expect(product.score).toBe(2);
 });
 it('rejects duplicate reviews, foreign operations, unverified users and forged roles',async()=>{
  const op=await operation();expect((await evaluate(op.id,body,other)).status).toBe(404);
  expect((await request(app).get(`/api/operations/${op.id}/review`)).status).toBe(401);
  expect((await evaluate(op.id,{...body,subject_id:other})).status).toBe(400);
  expect((await evaluate(op.id,body,owner)).status).toBe(400);
  expect((await evaluate(op.id)).status).toBe(200);expect((await evaluate(op.id)).status).toBe(409);
  await db.query("UPDATE users SET verification_status='No verificado' WHERE id=$1",[owner]);
  expect((await evaluate(op.id,{person_rating:5},owner)).status).toBe(403);
  await db.query("UPDATE users SET verification_status='Verificado' WHERE id=$1",[owner]);
 });
 it('excludes rejected, abandoned, cancelled, merely accepted, undelivered and unpaid operations',async()=>{
  const op=await operation('Venta',false);
  expect((await evaluate(op.id)).status).toBe(409);
  await db.query("UPDATE operations SET status='Cerrada' WHERE id=$1",[op.id]);expect((await evaluate(op.id)).status).toBe(409);
  const unpaid=await operation();await db.query('DELETE FROM operation_payment_simulations WHERE operation_id=$1',[unpaid.id]);expect((await evaluate(unpaid.id)).status).toBe(409);
  const cancel=await operation('Venta',false);expect((await post(`/api/operations/${cancel.id}/cancel`,{reason:'No se concretó'})).status).toBe(200);expect((await evaluate(cancel.id)).status).toBe(409);
  const pending=(await db.query(`INSERT INTO operations(publication_id,demandante_id,oferente_id,modality,status,requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at)
    VALUES($1,$2,$3,'Venta','Pendiente',40,0,1,now()+interval '1 day') RETURNING id`,[op.publicationId,buyer,owner])).rows[0].id;
  expect((await evaluate(pending)).status).toBe(409);
  expect((await post(`/api/operations/${pending}/reject`,{reason:'No disponible'},owner)).status).toBe(200);expect((await evaluate(pending)).status).toBe(409);
 });
 it('requires rental return and preserves incidence and payment rules',async()=>{
  const rental=await operation('Alquiler');
  await db.query('UPDATE operation_handoffs SET owner_returned_at=NULL,requester_returned_at=NULL WHERE operation_id=$1',[rental.id]);
  expect((await evaluate(rental.id)).status).toBe(409);
  await db.query('UPDATE operation_handoffs SET owner_returned_at=now(),requester_returned_at=now() WHERE operation_id=$1',[rental.id]);
  const incident=await post(`/api/operations/${rental.id}/incidences`,{reason:'damage',description:'Un problema pendiente después del cierre.'});expect(incident.status).toBe(200);
  expect((await evaluate(rental.id)).status).toBe(409);
  expect((await get(`/api/operations/${rental.id}/finance`)).body.transfer.eligible).toBe(false);
  const loan=await operation('Préstamo');expect((await evaluate(loan.id)).status).toBe(200);
 });
 it('never exposes a person own score through login, own/member profiles, user review API or public publication',async()=>{
  const op=await operation();await evaluate(op.id);await evaluate(op.id,{person_rating:5},owner);
  for(const url of ['/api/users/me',`/api/users/${owner}/profile`,`/api/users/${owner}/reviews`]){
   const r=await get(url,owner);expect(r.status).toBe(200);
   const text=JSON.stringify(r.body);expect(text).not.toMatch(/"(?:score|rating|person_rating|reputation_score)"/);
  }
  const login=await request(app).post('/api/auth/login').send({email:ownerEmail,password:'Fixture-Reviews2026!'});expect(login.status).toBe(200);expect(login.body.user).not.toHaveProperty('reputation');
  const pub=await request(app).get(`/api/publications/${op.publicationId}`);expect(pub.status).toBe(200);expect(pub.body).not.toHaveProperty('owner_reputation_score');expect(pub.body.owner).not.toHaveProperty('reputation_score');
  expect((await get(`/api/users/${owner}/reviews`,other)).body.reputation.as_owner.score).not.toBeNull();
 });
 it('separates reputation as owner/requester and represents zero evaluations as null rather than zero',async()=>{
  const fresh=await get(`/api/users/${other}/reviews`);expect(fresh.body.reputation).toEqual({as_owner:{count:0,score:null},as_requester:{count:0,score:null}});
  const first=await operation('Venta',true,other,buyer);await evaluate(first.id,{person_rating:5});await evaluate(first.id,{person_rating:2},other);
  const second=await operation('Alquiler',true,owner,other);await evaluate(second.id,{person_rating:4},other);await evaluate(second.id,{person_rating:1},owner);
  const r=(await get(`/api/users/${other}/reviews`)).body;
  expect(r.reputation).toEqual({as_owner:{count:1,score:5},as_requester:{count:1,score:1}});
 });
 it('serializes competing submissions and records no rating in chat or audit metadata',async()=>{
  const op=await operation();const results=await Promise.all([evaluate(op.id),evaluate(op.id)]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  const messages=(await db.query('SELECT body FROM conversation_messages WHERE operation_id=$1',[op.id])).rows;
  const audits=(await db.query('SELECT new_values FROM audit_logs WHERE entity_id=$1',[op.id])).rows;
  expect(JSON.stringify([...messages,...audits])).not.toContain(body.person_comment);expect(JSON.stringify([...messages,...audits])).not.toContain(body.product_comment);
  await expect(db.query('DELETE FROM operation_reviews WHERE operation_id=$1',[op.id])).rejects.toThrow(/append-only/);
 });
 it('changes a hidden evaluation to published on expiry without another submission or mutation',async()=>{
  const op=await operation();
  await db.query(`INSERT INTO operation_reviews(operation_id,author_id,subject_id,subject_role,publication_id,modality,person_rating,person_comment,product_rating,product_comment,publish_after)
   VALUES($1,$2,$3,'owner',$4,'Venta',1,'Comentario inicialmente oculto',5,'Producto publicado por vencimiento',clock_timestamp()+interval '2 seconds')`,[op.id,buyer,owner,op.publicationId]);
  expect((await get(`/api/publications/${op.publicationId}/reviews`)).body.count).toBe(0);
  expect((await get(`/api/operations/${op.id}/review`)).body.published).toBe(false);
  await new Promise(resolve=>setTimeout(resolve,2100));
  const product=(await get(`/api/publications/${op.publicationId}/reviews`)).body;expect(product.count).toBe(1);expect(product.items[0].comment).toBe('Producto publicado por vencimiento');
  expect((await get(`/api/operations/${op.id}/review`)).body.published).toBe(true);
  expect((await db.query('SELECT id FROM operation_reviews WHERE operation_id=$1',[op.id])).rowCount).toBe(1);
 });
});
