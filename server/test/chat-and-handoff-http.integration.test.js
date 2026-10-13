import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';
const enabled=process.env.RANTI_EPHEMERAL_DB==='1'&&!!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('private conversations, availability and pilot handoffs',()=>{
  let database,db,app,owner,buyer,other;
  const auth=id=>({Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`});
  beforeAll(async()=>{
    database=await createDisposableDatabase();db=database.db;await(await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules();vi.doMock('../src/config/database.js',()=>({default:db}));app=(await import('../src/app.js')).default;
    const user=async()=>(await db.query("INSERT INTO users(email,password_hash,role,status,verification_status)VALUES($1,'unused','Egresado','Activa','Verificado') RETURNING id",[`${randomUUID()}@ucsm.edu.pe`])).rows[0].id;
    owner=await user();buyer=await user();other=await user();
  });
  afterAll(async()=>{vi.doUnmock('../src/config/database.js');if(database)await database.close();});
  // Each scenario owns a fresh limiter store; never weaken the real API limits
  // just because the combined integration suite exceeds 100 HTTP requests.
  beforeEach(async()=>{vi.resetModules();app=(await import('../src/app.js')).default;});
  async function publication(modality='Venta'){
    return(await db.query(`INSERT INTO publications(owner_id,title,description,category,condition,modality,price,guarantee_amount,status,available_from,available_until)
      VALUES($1,'Artículo de prueba','Descripción','Tecnología','Bueno',$2,$3,0,'Activa',$4,$5) RETURNING *`,[owner,modality,modality==='Préstamo'?0:40,modality==='Venta'?null:new Date(Date.now()+86400000),modality==='Venta'?null:new Date(Date.now()+10*86400000)])).rows[0];
  }
  async function accepted(modality='Venta'){
    const p=await publication(modality),dates=modality==='Venta'?{}:{start_date:new Date(Date.now()+2*86400000).toISOString(),end_date:new Date(Date.now()+3*86400000).toISOString()};
    const r=await request(app).post('/api/operations').set(auth(buyer)).send({publication_id:p.id,requested_price:p.price,requested_guarantee_amount:p.guarantee_amount,requested_contract_version:Number(p.contract_version),...dates});
    expect(r.status,JSON.stringify(r.body)).toBe(201);
    const a=await request(app).post(`/api/operations/${r.body.operation.id}/accept`).set(auth(owner)).send({});expect(a.status).toBe(200);
    return {p,id:r.body.operation.id};
  }
  const action=(id,user,body)=>request(app).post(`/api/operations/${id}/handoff`).set(auth(user)).send(body);
  const propose=(id,user,revision=0)=>action(id,user,{action:'propose',revision,location:'Biblioteca UCSM',meeting_at:new Date(Date.now()+3600000).toISOString(),notes:'Entrada principal'});
  const pay=(id,user=buyer)=>request(app).post(`/api/operations/${id}/payment-simulation`).set(auth(user)).send({confirm_simulation:true});
  it('lets verified administrators audit all chat history read-only, without granting participant access',async()=>{
    const {id}=await accepted();
    const chat=await request(app).post(`/api/conversations/operation/${id}`).set(auth(buyer)).send({});
    const admin=(await db.query("INSERT INTO users(email,password_hash,role,status,verification_status)VALUES($1,'unused','Administrador','Activa','Verificado') RETURNING id",[`${randomUUID()}@ucsm.edu.pe`])).rows[0].id;
    const url=`/api/admin/conversations/${chat.body.id}/messages`;
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set(auth(other))).status).toBe(403);
    expect((await request(app).get('/api/admin/conversations').set(auth(other))).status).toBe(403);
    const sent=await request(app).post(`/api/conversations/${chat.body.id}/messages`).set(auth(buyer)).send({body:'Consulta privada de prueba',client_id:randomUUID()});expect(sent.status).toBe(200);
    const list=await request(app).get('/api/admin/conversations?offset=0').set(auth(admin));
    expect(list.status).toBe(200);expect(list.body.read_only).toBe(true);expect(list.body.items.some(item=>item.id===chat.body.id)).toBe(true);
    const read=await request(app).get(url).set(auth(admin));expect(read.status).toBe(200);expect(read.headers['cache-control']).toContain('no-store');
    expect(read.body.items.some(message=>message.body==='Consulta privada de prueba')).toBe(true);
    expect(read.body.read_only).toBe(true);expect(JSON.stringify(read.body)).not.toContain('password_hash');
    const audits=(await db.query("SELECT * FROM audit_logs WHERE actor_id=$1 AND action='admin.conversation.read' AND entity_id=$2",[admin,chat.body.id])).rows;
    expect(audits).toHaveLength(1);expect(JSON.stringify(audits)).not.toContain('Consulta privada de prueba');
    expect((await request(app).get(`/api/conversations/${chat.body.id}/messages`).set(auth(admin))).status).toBe(404);
    expect((await request(app).post(`/api/conversations/${chat.body.id}/messages`).set(auth(admin)).send({body:'Intervenir',client_id:randomUUID()})).status).toBe(404);
    expect((await request(app).post(url).set(auth(admin)).send({body:'No permitido'})).status).toBe(404);
    expect((await request(app).get(`${url}?before=not-an-id`).set(auth(admin))).status).toBe(400);
    expect((await request(app).get('/api/admin/conversations?offset=-1').set(auth(admin))).status).toBe(400);
    await db.query(`CREATE FUNCTION fail_admin_chat_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='admin.conversation.read' THEN RAISE EXCEPTION 'Test-only audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_admin_chat_audit_test BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_admin_chat_audit_test()`);
    try{
      const failed=await request(app).get(url).set(auth(admin));expect(failed.status).toBe(500);expect(JSON.stringify(failed.body)).not.toContain('Consulta privada de prueba');
    }finally{await db.query('DROP TRIGGER fail_admin_chat_audit_test ON audit_logs; DROP FUNCTION fail_admin_chat_audit_test()');}
    await db.query("UPDATE users SET role='Egresado' WHERE id=$1",[admin]);
    expect((await request(app).get(url).set(auth(admin))).status).toBe(403);
    await db.query("UPDATE users SET role='Administrador',verification_status='No verificado' WHERE id=$1",[admin]);
    expect((await request(app).get(url).set(auth(admin))).status).toBe(403);
    await db.query("UPDATE users SET verification_status='Verificado',status='Suspendida' WHERE id=$1",[admin]);
    expect((await request(app).get(url).set(auth(admin))).status).toBe(403);
    expect((await db.query("SELECT id FROM audit_logs WHERE actor_id=$1 AND action='admin.conversation.read'",[admin])).rowCount).toBe(1);
  });
  it('persists the workflow timeline for both participants and exposes payment only after the current agreement',async()=>{
    const {id}=await accepted();
    const chat=await request(app).post(`/api/conversations/operation/${id}`).set(auth(buyer)).send({});
    const url=`/api/conversations/${chat.body.id}/messages`;
    const read=user=>request(app).get(url).set(auth(user));
    const next=Math.ceil(Date.now()/1800000)*1800000+1800000;
    const availability={revision:0,slots:[new Date(next).toISOString()],skipped:false,location_preference:'Biblioteca UCSM'};
    expect((await request(app).post(`/api/operations/${id}/calendar`).set(auth(owner)).send(availability)).status).toBe(200);
    expect((await request(app).post(`/api/operations/${id}/calendar`).set(auth(buyer)).send(availability)).status).toBe(200);
    expect((await propose(id,owner)).status).toBe(200);
    const before=await read(buyer);expect(before.body.deals[0].payment_available).toBe(false);
    expect(before.body.items.filter(m=>m.event_type==='calendar.saved')).toHaveLength(2);
    expect(before.body.items.find(m=>m.event_type==='handoff.propose').body).toContain('Biblioteca UCSM');
    const forged=await request(app).post(url).set(auth(buyer)).send({kind:'workflow_event',operation_id:id,client_id:randomUUID(),body:'Pago completado'});
    expect(forged.status).toBe(400);
    expect((await action(id,buyer,{action:'agree',revision:1})).status).toBe(200);
    expect((await read(buyer)).body.deals[0].payment_available).toBe(true);
    expect((await propose(id,owner,1)).status).toBe(200);
    expect((await read(buyer)).body.deals[0].payment_available).toBe(false);
    expect((await pay(id)).status).toBe(409);
    expect((await action(id,buyer,{action:'agree',revision:2})).status).toBe(200);
    expect((await pay(id)).status).toBe(200);expect((await pay(id)).status).toBe(200);
    const requesterRead=await read(buyer),ownerRead=await read(owner);
    expect(requesterRead.body.deals[0].payment_available).toBe(false);
    expect(requesterRead.body.items.map(m=>m.id)).toEqual(ownerRead.body.items.map(m=>m.id));
    const paid=requesterRead.body.items.filter(m=>m.event_type==='payment.simulated');
    expect(paid).toHaveLength(1);expect(paid[0].mine).toBe(true);expect(paid[0].body).toContain('No se cobró dinero');
    expect((await read(other)).status).toBe(404);
  });
  it('rolls back the workflow change when its chat notice cannot be persisted',async()=>{
    const {id}=await accepted();
    await db.query(`CREATE FUNCTION fail_chat_event_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='handoff.propose' THEN RAISE EXCEPTION 'Test-only event failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_chat_event_test BEFORE INSERT ON conversation_messages FOR EACH ROW EXECUTE FUNCTION fail_chat_event_test()`);
    try{
      expect((await propose(id,owner)).status).toBe(500);
      expect((await db.query('SELECT revision FROM operation_handoffs WHERE operation_id=$1',[id])).rowCount).toBe(0);
      expect((await db.query("SELECT id FROM conversation_messages WHERE operation_id=$1 AND event_type='handoff.propose'",[id])).rowCount).toBe(0);
    }finally{await db.query('DROP TRIGGER fail_chat_event_test ON conversation_messages; DROP FUNCTION fail_chat_event_test()');}
  });
  it.each(['Alquiler','Préstamo'])('limits %s delivery proposals and calendar slots to before the requested start',async modality=>{
    const {id}=await accepted(modality);
    const op=(await db.query('SELECT * FROM operations WHERE id=$1',[id])).rows[0];
    const endpoint=`/api/operations/${id}/calendar`;
    const initial=await request(app).get(endpoint).set(auth(owner));
    expect(new Date(initial.body.window_end).getTime()).toBe(op.start_date.getTime());
    expect(new Date(initial.body.delivery_before).getTime()).toBe(op.start_date.getTime());
    const late=new Date(Math.ceil(op.start_date.getTime()/1800000)*1800000).toISOString();
    expect((await request(app).post(endpoint).set(auth(owner)).send({revision:0,slots:[late],skipped:false,location_preference:'Biblioteca UCSM'})).status).toBe(400);
    const rejected=await action(id,owner,{action:'propose',revision:0,location:'Biblioteca UCSM',meeting_at:op.start_date.toISOString()});
    expect(rejected.status).toBe(409);
    expect((await propose(id,owner)).status).toBe(200);
    // Legacy proposals must not bypass the new rule at confirmation.
    await db.query('UPDATE operation_handoffs SET meeting_at=$2 WHERE operation_id=$1',[id,op.start_date]);
    expect((await action(id,buyer,{action:'agree',revision:1})).status).toBe(409);
    expect((await propose(id,buyer,1)).status).toBe(200);
    expect((await action(id,owner,{action:'agree',revision:2})).status).toBe(200);
  });
  it('persists calendar invitations only for accepted deals in the same chat, and deduplicates retries',async()=>{
    const {p,id}=await accepted();
    const chat=await request(app).post(`/api/conversations/operation/${id}`).set(auth(owner)).send({});
    const url=`/api/conversations/${chat.body.id}/messages`;
    const body={kind:'calendar_invitation',operation_id:id,client_id:randomUUID()};
    const sent=await request(app).post(url).set(auth(owner)).send(body);expect(sent.status,JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.message).toMatchObject({kind:'calendar_invitation',operation_id:id,body:expect.stringMatching(/confirmada por ambos/)});
    expect((await request(app).post(url).set(auth(owner)).send(body)).body.message.id).toBe(sent.body.message.id);
    const read=await request(app).get(url).set(auth(buyer));expect(read.body.items.find(message=>message.kind==='calendar_invitation')).toMatchObject({kind:'calendar_invitation',operation_id:id,mine:false});
    const unrelated=await accepted();expect((await request(app).post(url).set(auth(owner)).send({...body,client_id:randomUUID(),operation_id:unrelated.id})).status).toBe(409);
    expect((await request(app).post(url).set(auth(other)).send({...body,client_id:randomUUID()})).status).toBe(404);
    await request(app).post(`/api/operations/${id}/cancel`).set(auth(buyer)).send({reason:'No asistiré'});
    expect((await request(app).post(url).set(auth(buyer)).send({...body,client_id:randomUUID()})).status).toBe(409);
    expect((await db.query("SELECT count(*)::int AS n FROM conversation_messages WHERE conversation_id=$1 AND kind='calendar_invitation'",[chat.body.id])).rows[0].n).toBe(1);
    expect((await db.query('SELECT id FROM transactions WHERE operation_id=$1',[id])).rowCount).toBe(0);
    expect(p.id).toBeTruthy();
  });
  it('compares private half-hour slots in the seven-day acceptance window, supports skip and rejects stale or malformed schedules',async()=>{
    const {id}=await accepted();
    const endpoint=`/api/operations/${id}/calendar`;
    expect((await request(app).get(endpoint).set(auth(other))).status).toBe(404);
    const initial=await request(app).get(endpoint).set(auth(owner));expect(initial.status).toBe(200);
    expect(new Date(initial.body.window_end)-new Date(initial.body.accepted_at)).toBe(7*86400000);
    const next=Math.ceil(Date.now()/1800000)*1800000+1800000;
    const a=new Date(next).toISOString(),b=new Date(next+1800000).toISOString(),c=new Date(next+3600000).toISOString();
    const body=slots=>({revision:0,slots,skipped:false,location_preference:'Biblioteca UCSM'});
    const save=(user,value)=>request(app).post(endpoint).set(auth(user)).send(value);
    expect((await save(owner,body([c,a]))).status).toBe(200);
    const common=await save(buyer,body([b,a,c]));expect(common.status,JSON.stringify(common.body)).toBe(200);
    expect(common.body.recommendations.map(slot=>slot.start)).toEqual([a,c]);expect(common.body.location_suggestion).toBe('Biblioteca UCSM');
    expect((await save(owner,body([b]))).status).toBe(409);
    expect((await save(owner,{...body([new Date(next+1000).toISOString()]),revision:1})).status).toBe(400);
    expect((await save(owner,{...body([new Date(Date.now()+8*86400000).toISOString()]),revision:1})).status).toBe(400);
    const skipped=await save(owner,{...body([]),revision:1,skipped:true});expect(skipped.status).toBe(200);expect(skipped.body.recommendations).toEqual([]);
    expect((await request(app).get(endpoint).set(auth(buyer))).body.other_skipped).toBe(true);
    const pendingPub=await publication();
    const pending=await request(app).post('/api/operations').set(auth(buyer)).send({publication_id:pendingPub.id,requested_price:pendingPub.price,requested_guarantee_amount:pendingPub.guarantee_amount,requested_contract_version:1});
    expect((await request(app).get(`/api/operations/${pending.body.operation.id}/calendar`).set(auth(buyer))).status).toBe(409);
  });
  it('allows simulated payment only for the requester after a bilateral meeting agreement, and deduplicates retries',async()=>{
    const {id}=await accepted();
    expect((await pay(id)).status).toBe(409);
    await propose(id,owner);await action(id,buyer,{action:'agree',revision:1});
    expect((await pay(id,owner)).status).toBe(404);
    expect((await request(app).post(`/api/operations/${id}/payment-simulation`).set(auth(buyer)).send({confirm_simulation:true,amount:'0.01'})).status).toBe(400);
    const paid=await pay(id);expect(paid.status,JSON.stringify(paid.body)).toBe(200);expect(paid.body.operation.status).toBe('Lista para entrega');
    expect(paid.body.operation.payment_simulation).toMatchObject({completed:true,simulated:true,amount:'40.00',unit_count:1,guarantee_held:false});
    expect((await pay(id)).status).toBe(200);
    expect((await db.query('SELECT operation_id FROM operation_payment_simulations WHERE operation_id=$1',[id])).rowCount).toBe(1);
    expect((await db.query('SELECT id FROM transactions WHERE operation_id=$1',[id])).rowCount).toBe(0);
    const cancelled=await request(app).post(`/api/operations/${id}/cancel`).set(auth(buyer)).send({reason:'No puedo asistir'});expect(cancelled.status,JSON.stringify(cancelled.body)).toBe(200);
  });
  it('creates one private chat, persists messages, rejects outsiders, anonymous reads and spoofed senders',async()=>{
    const p=await publication();
    const start=()=>request(app).post(`/api/conversations/publication/${p.id}`).set(auth(buyer)).send({});
    const a=await start();expect(a.status,JSON.stringify(a.body)).toBe(200);expect((await start()).body.id).toBe(a.body.id);
    const id=a.body.id,url=`/api/conversations/${id}/messages`;
    expect((await request(app).get(url)).status).toBe(401);expect((await request(app).get(url).set(auth(other))).status).toBe(404);
    const body={body:'¿Está disponible? <script>alert(1)</script>',client_id:randomUUID()};
    const m=await request(app).post(url).set(auth(buyer)).send(body);expect(m.status).toBe(200);
    expect((await request(app).post(url).set(auth(buyer)).send(body)).body.message.id).toBe(m.body.message.id);
    expect((await request(app).post(url).set(auth(buyer)).send({...body,sender_id:owner})).status).toBe(400);
    expect((await request(app).post(url).set(auth(other)).send(body)).status).toBe(404);
    expect((await request(app).post(url).set(auth(owner)).send({body:' ',client_id:randomUUID()})).status).toBe(400);
    expect((await request(app).post(url).set(auth(owner)).send({body:'x'.repeat(1001),client_id:randomUUID()})).status).toBe(400);
    const read=await request(app).get(url).set(auth(owner));expect(read.body.items).toHaveLength(1);expect(read.body.items[0]).toMatchObject({body:body.body,mine:false});
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect((await request(app).get('/api/conversations').set(auth(owner))).body.items.some(row=>row.id===id)).toBe(true);
    const owned=(await request(app).get('/api/conversations').set(auth(owner))).body.items.find(row=>row.id===id);
    expect(owned).toMatchObject({is_my_product:true,counterpart_id:buyer,last_message:body.body});
    const wanted=(await request(app).get('/api/conversations').set(auth(buyer))).body.items.find(row=>row.id===id);
    expect(wanted).toMatchObject({is_my_product:false,counterpart_id:owner});
    expect(read.body).toMatchObject({is_my_product:true,counterpart:{id:buyer}});
    expect((await request(app).get(`/api/publications/${p.id}`)).body).not.toHaveProperty('messages');
  });
  it('paginates old messages without losing or repeating them',async()=>{
    const p=await publication(),c=await request(app).post(`/api/conversations/publication/${p.id}`).set(auth(buyer)).send({});
    await db.query("INSERT INTO conversation_messages(conversation_id,sender_id,client_id,body) SELECT $1,$2,uuid_generate_v4(),'mensaje '||n FROM generate_series(1,55) n",[c.body.id,buyer]);
    const latest=await request(app).get(`/api/conversations/${c.body.id}/messages`).set(auth(buyer));expect(latest.body.items).toHaveLength(50);expect(latest.body.before).toBeTruthy();
    const older=await request(app).get(`/api/conversations/${c.body.id}/messages?before=${latest.body.before}`).set(auth(buyer));expect(older.body.items).toHaveLength(5);expect(older.body.before).toBeNull();
    expect(new Set([...older.body.items,...latest.body.items].map(row=>row.id)).size).toBe(55);
  });
  it('allows either participant to propose and the other to agree, rejects stale/self/third-party confirmations',async()=>{
    const {id}=await accepted();
    const proposal=await propose(id,buyer);expect(proposal.status,JSON.stringify(proposal.body)).toBe(200);expect(proposal.body.operation.handoff.proposed_by_you).toBe(true);
    expect((await action(id,buyer,{action:'agree',revision:1})).status).toBe(409);
    expect((await action(id,other,{action:'agree',revision:1})).status).toBe(404);
    expect((await action(id,owner,{action:'request-change',revision:1})).status).toBe(200);
    expect((await action(id,owner,{action:'agree',revision:1})).status).toBe(409);
    expect((await propose(id,owner,1)).status).toBe(200);
    expect((await action(id,buyer,{action:'agree',revision:1})).status).toBe(409);
    expect((await action(id,buyer,{action:'agree',revision:2})).body.operation.handoff.agreed).toBe(true);
    expect((await action(id,owner,{action:'confirm-delivery',revision:2})).status).toBe(409); // Future meeting.
    const chat=await request(app).post(`/api/conversations/operation/${id}`).set(auth(owner)).send({});expect(chat.status).toBe(200);
    expect((await request(app).post(`/api/conversations/operation/${id}`).set(auth(buyer)).send({})).body.id).toBe(chat.body.id);
    expect((await request(app).post(`/api/conversations/operation/${id}`).set(auth(other)).send({})).status).toBe(404);
  });
  it.each(['Venta','Alquiler','Préstamo'])('keeps %s reserved until both confirm physical delivery, and releases a rental/loan only after both confirm return',async modality=>{
    const {p,id}=await accepted(modality);
    await propose(id,owner);await action(id,buyer,{action:'agree',revision:1});
    expect((await pay(id)).status).toBe(200);
    await db.query("UPDATE operation_handoffs SET meeting_at=now()-interval '1 minute' WHERE operation_id=$1",[id]);
    const first=await action(id,owner,{action:'confirm-delivery',revision:1});expect(first.status,JSON.stringify(first.body)).toBe(200);expect(first.body.operation.status).toBe('Lista para entrega');
    expect((await request(app).post(`/api/operations/${id}/cancel`).set(auth(buyer)).send({reason:'Cancelar'})).status).toBe(409);
    expect((await propose(id,buyer,1)).status).toBe(409);
    const both=await action(id,buyer,{action:'confirm-delivery',revision:1});expect(both.status,JSON.stringify(both.body)).toBe(200);expect(both.body.operation.status).toBe('Entregada/Activa');
    const detail=await request(app).get(`/api/publications/${p.id}`);expect(detail.body.availability.state).toBe(modality==='Venta'?'sold':modality==='Alquiler'?'rented':'loaned');
    expect(detail.body).not.toHaveProperty('handoff');expect(JSON.stringify(detail.body)).not.toContain('Biblioteca UCSM');
    if(modality==='Venta'){
      expect((await request(app).get('/api/publications')).body.some(row=>row.id===p.id)).toBe(false);
      expect((await action(id,owner,{action:'confirm-return',revision:1})).status).toBe(409);
    }else{
      const firstReturn=await action(id,buyer,{action:'confirm-return',revision:1});expect(firstReturn.body.operation.status).toBe('Entregada/Activa');
      const returned=await action(id,owner,{action:'confirm-return',revision:1});expect(returned.status,JSON.stringify(returned.body)).toBe(200);expect(returned.body.operation.status).toBe('Cerrada');
      expect((await db.query('SELECT status FROM reservations WHERE operation_id=$1',[id])).rows[0].status).toBe('Disponible');
      expect((await request(app).get(`/api/publications/${p.id}`)).body.availability.state).toBe('available');
    }
    expect((await db.query('SELECT id FROM transactions WHERE operation_id=$1',[id])).rowCount).toBe(0);
    expect((await request(app).post(`/api/operations/${id}/confirm`).set(auth(owner)).send({otp_code:'123456'})).status).toBe(409);
  });
  it('shows reservation and denied-request counts independently from editorial Active status',async()=>{
    const {p}=await accepted();
    const own=await request(app).get('/api/publications/mine').set(auth(owner));
    const row=own.body.find(item=>item.id===p.id);expect(row.status).toBe('Activa');expect(row.availability.state).toBe('reserved');expect(row.operation_counts.Aceptada).toBe(1);
    expect((await request(app).post(`/api/publications/${p.id}/withdraw`).set(auth(owner)).send({})).status).toBe(409);
  });
  it('exposes contact details only through authenticated member profiles, never in public publication or chat summaries',async()=>{
    await db.query("UPDATE users SET display_name='Oferente de prueba',contact_number='999123456' WHERE id=$1",[owner]);
    const p=await publication();
    const publicPage=await request(app).get(`/api/publications/${p.id}`);
    expect(publicPage.body.owner).toMatchObject({id:owner,display_name:'Oferente de prueba'});
    expect(publicPage.body.owner).not.toHaveProperty('email');expect(publicPage.body.owner).not.toHaveProperty('contact_number');expect(publicPage.body).not.toHaveProperty('email');
    expect((await request(app).get(`/api/users/${owner}/profile`)).status).toBe(401);
    const profile=await request(app).get(`/api/users/${owner}/profile`).set(auth(buyer));
    expect(profile.status,JSON.stringify(profile.body)).toBe(200);expect(profile.body).toMatchObject({id:owner,display_name:'Oferente de prueba',contact_number:'999123456',email:expect.stringMatching(/@ucsm.edu.pe$/)});
    expect(profile.body).not.toHaveProperty('password_hash');expect(profile.body).not.toHaveProperty('verification_status');expect(profile.headers['cache-control']).toBe('private, no-store');
    await db.query("UPDATE users SET status='Suspendida' WHERE id=$1",[other]);
    expect((await request(app).get(`/api/users/${owner}/profile`).set(auth(other))).status).toBe(403);
    expect((await request(app).get(`/api/users/${other}/profile`).set(auth(buyer))).status).toBe(404);
  });
});
