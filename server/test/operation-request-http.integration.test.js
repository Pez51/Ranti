import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';
const enabled=process.env.RANTI_EPHEMERAL_DB==='1'&&!!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('operation request HTTP regression',()=>{
  let database,db,app,owner,buyer,stranger;
  const auth=id=>({Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`});
  beforeAll(async()=>{
    database=await createDisposableDatabase();db=database.db;await(await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules();vi.doMock('../src/config/database.js',()=>({default:db}));app=(await import('../src/app.js')).default;
    async function user(){return(await db.query(`INSERT INTO users(email,password_hash,role,status,verification_status)VALUES($1,'unused','Egresado','Activa','Verificado')RETURNING id`,[`${randomUUID()}@ucsm.edu.pe`])).rows[0].id;}
    owner=await user();buyer=await user();stranger=await user();
  });
  afterAll(async()=>{vi.doUnmock('../src/config/database.js');if(database)await database.close();});
  async function publication(modality='Venta'){
    return(await db.query(`INSERT INTO publications(owner_id,title,description,category,condition,modality,price,guarantee_amount,status,available_from,available_until)
      VALUES($1,'Artículo','Descripción','Tecnología','Buen estado',$2,$3,0,'Activa',$4,$5)RETURNING *`,[owner,modality,modality==='Préstamo'?0:5,
      modality==='Venta'?null:new Date(Date.now()+86400000),modality==='Venta'?null:new Date(Date.now()+7*86400000)])).rows[0];
  }
  const terms=p=>({publication_id:p.id,requested_price:p.price,requested_guarantee_amount:p.guarantee_amount,requested_contract_version:Number(p.contract_version)});
  const offer = async (pub, value='4.00', user=buyer, dates={}) => request(app).post('/api/operations').set(auth(user)).send({...terms(pub),offered_price:value,...dates});
  it('routes legacy acceptance, rejection and cancellation entry points through complete state transitions',async()=>{
    const legacy=await import('../src/modules/operations/operation.service.js');
    const create=async()=>request(app).post('/api/operations').set(auth(buyer)).send(terms(await publication()));
    const a=await create(),b=await create(),c=await create();
    const accepted=await legacy.acceptOperation(a.body.operation.id,owner);
    expect(accepted.operation.status).toBe('Aceptada');
    const row=(await db.query('SELECT accepted_at,decided_at,decided_by,contract_snapshot FROM operations WHERE id=$1',[a.body.operation.id])).rows[0];
    expect(row.accepted_at).toBeInstanceOf(Date);expect(row.decided_at).toBeInstanceOf(Date);expect(row.decided_by).toBe(owner);expect(row.contract_snapshot.agreed_price).toBe('5.00');
    expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1',[a.body.operation.id])).rowCount).toBe(1);
    expect((await legacy.rejectOperation(b.body.operation.id,owner,'No disponible')).operation.status).toBe('Rechazada');
    expect((await legacy.cancelOperation(c.body.operation.id,buyer,'Ya no lo necesito')).operation.status).toBe('Cancelada');
  });
  it('stores a private offer without changing the listing, freezes the agreed price and reserves only on owner acceptance', async()=>{
    const pub=await publication();
    const created=await offer(pub);expect(created.status,JSON.stringify(created.body)).toBe(201);
    const id=created.body.operation.id;
    expect(created.body.operation).toMatchObject({offered_price:'4.00',requested_price:'5.00',status:'Pendiente'});
    expect(created.body.operation).not.toHaveProperty('offer_pricing');
    expect((await offer(pub)).body.operation.id).toBe(id);
    const regular=await request(app).post('/api/operations').set(auth(buyer)).send(terms(pub));
    expect(regular.body.operation.id).not.toBe(id);
    expect((await offer(pub)).body.operation.id).toBe(id);
    const received=await request(app).get(`/api/operations/${id}`).set(auth(owner));
    expect(received.body.operation.offer_pricing).toMatchObject({gross_amount:'4.00',service_fee:'0.40',owner_net:'3.60'});
    expect((await request(app).post(`/api/operations/${id}/accept`).set(auth(buyer)).send({})).status).toBe(403);
    expect((await request(app).post(`/api/operations/${id}/accept`).set(auth(stranger)).send({})).status).toBe(404);
    expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1',[id])).rowCount).toBe(0);
    const accepted=await request(app).post(`/api/operations/${id}/accept`).set(auth(owner)).send({});
    expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.operation).toMatchObject({status:'Aceptada',contract_snapshot:{agreed_price:'4.00',published_price:'5.00',offer_accepted:true}});
    expect((await db.query('SELECT price FROM publications WHERE id=$1',[pub.id])).rows[0].price).toBe('5.00');
    expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1',[id])).rowCount).toBe(1);
    expect((await db.query('SELECT id FROM transactions WHERE operation_id=$1',[id])).rowCount).toBe(0);
    expect((await request(app).post(`/api/operations/${id}/accept`).set(auth(owner)).send({})).status).toBe(409);
    await expect(db.query('UPDATE operations SET offered_price=3 WHERE id=$1',[id])).rejects.toThrow(/immutable/);
    const cancelled=await request(app).post(`/api/operations/${id}/cancel`).set(auth(buyer)).send({reason:'Ya no lo necesito'});
    expect(cancelled.status,JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.operation.contract_snapshot.agreed_price).toBe('4.00');
    expect((await db.query('SELECT status FROM reservations WHERE operation_id=$1',[id])).rows[0].status).toBe('Disponible');
  });
  it('rejects invalid offers, free-loan negotiation and guarantee tampering', async()=>{
    const pub=await publication();
    for(const value of ['0','-1','5.00','6.00','1.001',null]) {
      expect([400,422]).toContain((await offer(pub,value)).status);
    }
    expect((await offer(pub,'4.00',owner)).status).toBe(422);
    expect((await request(app).post('/api/operations').set(auth(buyer)).send({...terms(pub),offered_price:'4.00',requested_guarantee_amount:'1.00'})).status).toBe(422);
    const loan=await publication('Préstamo');
    expect((await offer(loan,'1.00',buyer,{start_date:new Date(Date.now()+2*86400000).toISOString(),end_date:new Date(Date.now()+3*86400000).toISOString()})).status).toBe(422);
  });
  it('requires a reason to reject and never reserves a rejected offer',async()=>{
    const created=await offer(await publication());const id=created.body.operation.id;
    expect((await request(app).post(`/api/operations/${id}/reject`).set(auth(owner)).send({})).status).toBe(400);
    expect((await request(app).post(`/api/operations/${id}/reject`).set(auth(buyer)).send({reason:'No'})).status).toBe(403);
    const rejected=await request(app).post(`/api/operations/${id}/reject`).set(auth(owner)).send({reason:'  El precio no me conviene  '});
    expect(rejected.status,JSON.stringify(rejected.body)).toBe(200);
    expect(rejected.body.operation).toMatchObject({status:'Rechazada',decision_reason:'El precio no me conviene',contract_snapshot:null});
    expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1',[id])).rowCount).toBe(0);
    expect((await request(app).get(`/api/operations/${id}`).set(auth(buyer))).body.operation.status).toBe('Rechazada');
  });
  it('serializes competing acceptances and does not create two sale reservations',async()=>{
    const pub=await publication();const a=await offer(pub),b=await offer(pub,'3.00',stranger);
    const responses=await Promise.all([a,b].map(result=>request(app).post(`/api/operations/${result.body.operation.id}/accept`).set(auth(owner)).send({})));
    expect(responses.map(result=>result.status).sort()).toEqual([200,409]);
    expect((await db.query("SELECT id FROM reservations WHERE publication_id=$1 AND status='Reservada/Bloqueada'",[pub.id])).rowCount).toBe(1);
  });
  it('rejects stale or expired offers on acceptance without creating a reservation',async()=>{
    const pub=await publication();const a=await offer(pub);const id=a.body.operation.id;
    await db.query('UPDATE publications SET price=6 WHERE id=$1',[pub.id]);
    expect((await request(app).post(`/api/operations/${id}/accept`).set(auth(owner)).send({})).status).toBe(422);
    const b=await offer(await publication());const second=b.body.operation.id;
    await db.query("UPDATE operations SET request_expires_at=now()-interval '1 second' WHERE id=$1",[second]);
    expect((await request(app).post(`/api/operations/${second}/accept`).set(auth(owner)).send({})).status).toBe(409);
    expect((await db.query('SELECT id FROM reservations WHERE operation_id=ANY($1::uuid[])',[[id,second]])).rowCount).toBe(0);
  });
  it('accepts a rental offer per hour, preserving guarantee, finite dates and billing unit',async()=>{
    const initial=await publication('Alquiler');
    const pub=(await db.query("UPDATE publications SET rental_unit='hour',guarantee_amount=30 WHERE id=$1 RETURNING *",[initial.id])).rows[0];
    const dates={requested_rental_unit:'hour',start_date:new Date(Date.now()+2*86400000).toISOString(),end_date:new Date(Date.now()+2*86400000+3600000).toISOString()};
    const created=await offer(pub,'4.00',buyer,dates);expect(created.status).toBe(201);
    const accepted=await request(app).post(`/api/operations/${created.body.operation.id}/accept`).set(auth(owner)).send({});
    expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.operation.contract_snapshot).toMatchObject({agreed_price:'4.00',guarantee_amount:'30.00',rental_unit:'hour',start_date:dates.start_date,end_date:dates.end_date});
  });
  it('still accepts a normal request at its published price',async()=>{
    const pub=await publication();const created=await request(app).post('/api/operations').set(auth(buyer)).send(terms(pub));
    const result=await request(app).post(`/api/operations/${created.body.operation.id}/accept`).set(auth(owner)).send({});
    expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.body.operation.contract_snapshot.agreed_price).toBe('5.00');
  });
  it('rolls back acceptance and reservation if its audit record cannot be saved',async()=>{
    const created=await offer(await publication());const id=created.body.operation.id;
    await db.query(`CREATE FUNCTION fail_offer_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='operation.accepted' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_offer_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_offer_audit();`);
    try {
      expect((await request(app).post(`/api/operations/${id}/accept`).set(auth(owner)).send({})).status).toBe(500);
      expect((await db.query('SELECT status,contract_snapshot FROM operations WHERE id=$1',[id])).rows[0]).toMatchObject({status:'Pendiente',contract_snapshot:null});
      expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1',[id])).rowCount).toBe(0);
      expect((await db.query("SELECT id FROM outbox_events WHERE aggregate_id=$1 AND event_type='operation.accepted'",[id])).rowCount).toBe(0);
    } finally { await db.query('DROP TRIGGER test_offer_audit_failure ON audit_logs; DROP FUNCTION fail_offer_audit();'); }
  });
  it('creates the confirmed S/5 request as Pending with version and expiry, no charge, OTP or reservation',async()=>{
    const pub=await publication();const response=await request(app).post('/api/operations').set(auth(buyer)).send(terms(pub));
    expect(response.status,JSON.stringify(response.body)).toBe(201);const operation=response.body.operation;
    expect(operation).toMatchObject({status:'Pendiente',requested_price:'5.00',requested_contract_version:'1',contract_snapshot:null,allowed_actions:['cancel']});
    expect(operation).not.toHaveProperty('otp_code');
    const row=(await db.query('SELECT * FROM operations WHERE id=$1',[operation.id])).rows[0];
    expect(row.otp_code).toBeNull();expect(row.accepted_at).toBeNull();expect(row.request_expires_at).toBeInstanceOf(Date);
    expect((await db.query('SELECT id FROM reservations WHERE operation_id=$1',[operation.id])).rowCount).toBe(0);
    expect((await db.query('SELECT id FROM transactions WHERE operation_id=$1',[operation.id])).rowCount).toBe(0);
    const repeat=await request(app).post('/api/operations').set(auth(buyer)).send(terms(pub));expect(repeat.body.operation.id).toBe(operation.id);
    expect((await db.query('SELECT id FROM audit_logs WHERE entity_id=$1',[operation.id])).rowCount).toBe(1);
    expect((await db.query('SELECT id FROM outbox_events WHERE aggregate_id=$1',[operation.id])).rowCount).toBe(1);
    expect((await request(app).get('/api/operations/mine?side=requested').set(auth(buyer))).body.items[0].id).toBe(operation.id);
    expect((await request(app).get('/api/operations/mine?side=received').set(auth(owner))).body.items[0].id).toBe(operation.id);
    expect((await request(app).get(`/api/operations/${operation.id}`).set(auth(stranger))).status).toBe(404);
  });
  it('rejects missing/stale version, altered prices, own publications and inactive listings without insertion',async()=>{
    const pub=await publication();const body=terms(pub);
    expect((await request(app).post('/api/operations').set(auth(buyer)).send({publication_id:pub.id})).status).toBe(400);
    expect((await request(app).post('/api/operations').set(auth(buyer)).send({...body,requested_contract_version:2})).status).toBe(422);
    expect((await request(app).post('/api/operations').set(auth(buyer)).send({...body,requested_price:'1.00'})).status).toBe(422);
    expect((await request(app).post('/api/operations').set(auth(owner)).send(body)).status).toBe(422);
    await db.query("UPDATE publications SET status='Pausada' WHERE id=$1",[pub.id]);
    expect((await request(app).post('/api/operations').set(auth(buyer)).send(body)).status).toBe(422);
    expect((await db.query('SELECT id FROM operations WHERE publication_id=$1',[pub.id])).rowCount).toBe(0);
  });
  it.each(['Alquiler','Préstamo'])('accepts requested dates for %s without reserving early',async modality=>{
    const pub=await publication(modality);const body={...terms(pub),start_date:new Date(Date.now()+2*86400000).toISOString(),end_date:new Date(Date.now()+3*86400000).toISOString()};
    const response=await request(app).post('/api/operations').set(auth(buyer)).send(body);expect(response.status,JSON.stringify(response.body)).toBe(201);
    expect(response.body.operation.status).toBe('Pendiente');expect((await db.query('SELECT id FROM reservations WHERE publication_id=$1',[pub.id])).rowCount).toBe(0);
  });
  it('preserves an hourly rental unit and rejects confirming a different unit',async()=>{
    const initial=await publication('Alquiler');
    const pub=(await db.query("UPDATE publications SET rental_unit='hour' WHERE id=$1 RETURNING *",[initial.id])).rows[0];
    expect(Number(pub.contract_version)).toBe(Number(initial.contract_version)+1);
    const body={...terms(pub),requested_rental_unit:'hour',start_date:new Date(Date.now()+2*86400000).toISOString(),end_date:new Date(Date.now()+2*86400000+3600000).toISOString()};
    expect((await request(app).post('/api/operations').set(auth(buyer)).send({...body,requested_rental_unit:'day'})).status).toBe(422);
    const response=await request(app).post('/api/operations').set(auth(buyer)).send(body);
    expect(response.status,JSON.stringify(response.body)).toBe(201);expect(response.body.operation.requested_rental_unit).toBe('hour');
    expect((await db.query('SELECT requested_rental_unit FROM operations WHERE id=$1',[response.body.operation.id])).rows[0].requested_rental_unit).toBe('hour');
  });
  it('allows dated requests beyond an unbounded rental listing, but still requires a finite request end',async()=>{
    const original=await publication('Alquiler');
    const pub=(await db.query('UPDATE publications SET available_until=NULL WHERE id=$1 RETURNING *',[original.id])).rows[0];
    const body={...terms(pub),start_date:new Date(Date.now()+100*86400000).toISOString(),end_date:new Date(Date.now()+101*86400000).toISOString()};
    const response=await request(app).post('/api/operations').set(auth(buyer)).send(body);
    expect(response.status,JSON.stringify(response.body)).toBe(201);
    expect((await request(app).post('/api/operations').set(auth(buyer)).send({...body,end_date:undefined})).status).toBe(422);
  });
});
