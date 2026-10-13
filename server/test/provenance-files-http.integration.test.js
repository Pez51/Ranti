import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import jwt from 'jsonwebtoken';import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';
const enabled=process.env.RANTI_EPHEMERAL_DB==='1'&&!!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('private provenance files',()=>{
  let database,db,app,owner,other,admin,directory;
  const auth=id=>({Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`});
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM9sAAAAASUVORK5CYII=','base64');
  const body={title:'Equipo académico',description:'Equipo cuidado',category:'Tecnología',condition:'Buen estado',condition_rating:3,modality:'Venta',price:'1200',guarantee_amount:'0',images:['https://example.org/photo.png']};
  beforeAll(async()=>{
    directory=await mkdtemp(path.join(os.tmpdir(),'ranti-private-proof-'));process.env.RANTI_PROVENANCE_DIR=directory;
    database=await createDisposableDatabase();db=database.db;await(await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules();vi.doMock('../src/config/database.js',()=>({default:db}));app=(await import('../src/app.js')).default;
    async function user(role='Egresado'){return(await db.query(`INSERT INTO users(email,password_hash,role,status,verification_status)VALUES($1,'unused',$2,'Activa','Verificado')RETURNING id`,[`${randomUUID()}@ucsm.edu.pe`,role])).rows[0].id;}
    owner=await user();other=await user();admin=await user('Administrador');
  });
  afterAll(async()=>{vi.doUnmock('../src/config/database.js');delete process.env.RANTI_PROVENANCE_DIR;if(database)await database.close();if(directory)await rm(directory,{recursive:true,force:true});});
  async function upload(bytes=pdf,mime='application/pdf'){
    const response=await request(app).post('/api/publications/provenance').set(auth(owner)).set('Content-Type',mime).send(bytes);
    expect(response.status,JSON.stringify(response.body)).toBe(201);return response.body.ref;
  }
  it('uploads PDF and photos, restricts reads and attachment ownership, supports review, and hides the reference publicly',async()=>{
    const ref=await upload();await upload(png,'image/png');
    expect((await request(app).get(ref)).status).toBe(401);
    expect((await request(app).get(ref).set(auth(other))).status).toBe(404);
    expect((await request(app).get(ref).set(auth(admin))).status).toBe(404);
    const ownerRead=await request(app).get(ref).set(auth(owner));expect(ownerRead.status).toBe(200);expect(ownerRead.headers['content-disposition']).toContain('attachment');expect(ownerRead.headers['cache-control']).toContain('no-store');
    expect((await request(app).post('/api/publications').set(auth(other)).send({...body,provenance_evidence_ref:ref})).status).toBe(403);
    const create=await request(app).post('/api/publications').set(auth(owner)).send({...body,provenance_evidence_ref:ref});expect(create.status,JSON.stringify(create.body)).toBe(201);const id=create.body.publication.id;
    const submitted=await request(app).post(`/api/publications/${id}/submit`).set(auth(owner));expect(submitted.status,JSON.stringify(submitted.body)).toBe(200);
    const adminRead=await request(app).get(ref).set(auth(admin));expect(adminRead.status).toBe(200);
    expect((await db.query("SELECT id FROM audit_logs WHERE actor_id=$1 AND action='publication.evidence.downloaded'",[admin])).rowCount).toBe(1);
    const decision=await request(app).post(`/api/admin/publications/${id}/review`).set(auth(admin)).send({decision:'approve',reason:'Boleta revisada',submittedAt:submitted.body.submitted_at});expect(decision.status,JSON.stringify(decision.body)).toBe(200);
    expect((await request(app).get(`/api/publications/${id}`)).body).not.toHaveProperty('provenance_evidence_ref');
    expect((await request(app).get('/api/publications')).body.find(row=>row.id===id)).not.toHaveProperty('provenance_evidence_ref');
  });
  it('rejects unsupported types, spoofed MIME, oversize files, invalid identifiers and unverified accounts',async()=>{
    expect((await request(app).post('/api/publications/provenance').set(auth(owner)).set('Content-Type','application/pdf').send(Buffer.from('<html>bad</html>'))).status).toBe(400);
    expect((await request(app).post('/api/publications/provenance').set(auth(owner)).set('Content-Type','image/png').send(pdf)).status).toBe(400);
    expect((await request(app).post('/api/publications/provenance').set(auth(owner)).set('Content-Type','application/pdf').send(Buffer.alloc(5*1024*1024+1))).status).toBe(413);
    expect((await request(app).get('/api/publications/provenance/not-a-uuid').set(auth(owner))).status).toBe(404);
    await db.query("UPDATE users SET verification_status='No verificado' WHERE id=$1",[other]);
    expect((await request(app).post('/api/publications/provenance').set(auth(other)).set('Content-Type','application/pdf').send(pdf)).status).toBe(403);
  });
  it('does not return document bytes when audit registration fails',async()=>{
    const ref=await upload();
    await db.query(`CREATE FUNCTION reject_provenance_read_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='publication.evidence.downloaded' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_provenance_read_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_provenance_read_audit()`);
    try{
      const response=await request(app).get(ref).set(auth(owner));expect(response.status).toBe(500);
      expect(response.headers['content-type']).toContain('application/json');expect(response.headers['content-disposition']).toBeUndefined();
    }finally{await db.query('DROP TRIGGER reject_provenance_read_audit ON audit_logs; DROP FUNCTION reject_provenance_read_audit()');}
  });
});
