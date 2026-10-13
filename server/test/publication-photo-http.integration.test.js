import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('publication photo upload and persistence', () => {
  let database,db,app,owner,other,admin,directory;
  const auth = id => ({Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`});
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM9sAAAAASUVORK5CYII=','base64');
  const body = {title:'Calculadora',description:'Equipo cuidado para clases',category:'Tecnología',category_other:null,condition:'Buen estado',condition_rating:3,modality:'Venta',price:'600',guarantee_amount:'0',images:[],available_from:null,available_until:null,provenance_evidence_ref:null};
  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(),'ranti-publication-photos-')); process.env.RANTI_PUBLICATION_PHOTO_DIR=directory;
    database=await createDisposableDatabase(); db=database.db;
    await (await import('../src/db/migrate.js')).runMigrations(db);
    vi.resetModules(); vi.doMock('../src/config/database.js',()=>({default:db}));
    app=(await import('../src/app.js')).default;
    async function user(role='Egresado') { return (await db.query(`INSERT INTO users (email,password_hash,role,status,verification_status)
      VALUES ($1,'unused',$2,'Activa','Verificado') RETURNING id`,[`${randomUUID()}@ucsm.edu.pe`,role])).rows[0].id; }
    owner=await user(); other=await user(); admin=await user('Administrador');
  });
  afterAll(async () => {
    vi.doUnmock('../src/config/database.js'); delete process.env.RANTI_PUBLICATION_PHOTO_DIR;
    if (database) await database.close(); if (directory) await rm(directory,{recursive:true,force:true});
  });
  async function upload() {
    const response=await request(app).post('/api/publications/photos').set(auth(owner)).set('Content-Type','image/png').send(png);
    expect(response.status,JSON.stringify(response.body)).toBe(201); return response.body.url;
  }
  it('uploads photos, saves and edits their ordering, reloads and sends the draft for review',async () => {
    const first=await upload(),second=await upload();
    const extra=[]; for(let i=0;i<5;i++) extra.push(await upload());
    const read=await request(app).get(first); expect(read.status).toBe(200); expect(read.headers['content-type']).toContain('image/png'); expect(read.body).toEqual(png);
    const create=await request(app).post('/api/publications').set(auth(owner)).send({...body,images:[first,second,...extra]});
    expect(create.status,JSON.stringify(create.body)).toBe(201);
    const pub=create.body.publication; expect(pub.status).toBe('Borrador'); expect(pub.images).toEqual([first,second,...extra]);
    expect(pub.condition_rating).toBe(3);
    const quote=await request(app).get(`/api/publications/${pub.id}/pricing`).set(auth(owner));
    expect(quote.status,JSON.stringify(quote.body)).toBe(200);
    expect(quote.body).toMatchObject({service_fee:'30.00',owner_net:'570.00',simulated:true});
    expect(quote.body).not.toHaveProperty('platform');expect(quote.body).not.toHaveProperty('card_fee');
    expect((await request(app).get(`/api/publications/${pub.id}/pricing`).set(auth(other))).status).toBe(404);
    expect((await request(app).get('/api/publications/mine').set(auth(owner))).body[0].images).toEqual([first,second,...extra]);
    const edited=await request(app).patch(`/api/publications/${pub.id}`).set(auth(owner)).send({images:[second,first,...extra]});
    expect(edited.status,JSON.stringify(edited.body)).toBe(200); expect(edited.body.images).toEqual([second,first,...extra]);
    expect((await db.query('SELECT position FROM publication_images WHERE publication_id=$1 ORDER BY position',[pub.id])).rows.map(row=>row.position)).toEqual([0,1,2,3,4,5,6]);
    expect((await db.query('SELECT image_url FROM publication_images WHERE publication_id=$1 AND is_primary',[pub.id])).rows[0].image_url).toBe(second);
    const submitted=await request(app).post(`/api/publications/${pub.id}/submit`).set(auth(owner));
    expect(submitted.status,JSON.stringify(submitted.body)).toBe(200); expect(submitted.body.status).toBe('Pendiente de revisión');
    const review=await request(app).post(`/api/admin/publications/${pub.id}/review`).set(auth(admin)).send({decision:'approve',reason:'Fotos y datos revisados',submittedAt:submitted.body.submitted_at});
    expect(review.status,JSON.stringify(review.body)).toBe(200); expect(review.body.status).toBe('Activa');
    const catalog=await request(app).get('/api/publications'); expect(catalog.body.find(item=>item.id===pub.id).primary_image).toBe(second);
  });
  it('rejects unauthenticated uploads, invalid bytes, MIME mismatch, oversize images and traversal',async () => {
    expect((await request(app).post('/api/publications/photos').set('Content-Type','image/png').send(png)).status).toBe(401);
    expect((await request(app).post('/api/publications/photos').set(auth(owner)).set('Content-Type','image/png').send(Buffer.from('not a photo'))).status).toBe(400);
    expect((await request(app).post('/api/publications/photos').set(auth(owner)).set('Content-Type','image/jpeg').send(png)).status).toBe(400);
    expect((await request(app).post('/api/publications/photos').set(auth(owner)).set('Content-Type','image/png').send(Buffer.alloc(2*1024*1024+1))).status).toBe(413);
    expect((await request(app).get('/api/publications/photos/not-a-uuid')).status).toBe(404);
  });
  it('rejects another owner’s photo and more than seven photos without creating publications',async () => {
    const url=await upload();
    const foreign=await request(app).post('/api/publications').set(auth(other)).send({...body,images:[url]});
    expect(foreign.status,JSON.stringify(foreign.body)).toBe(403);
    expect((await request(app).post('/api/publications').set(auth(owner)).send({...body,images:Array(8).fill(url)})).status).toBe(400);
    expect((await db.query('SELECT id FROM publications WHERE owner_id=$1',[other])).rowCount).toBe(0);
  });
  it('stores Other details and validates characters, stars and server-controlled pricing',async()=>{
    const create=await request(app).post('/api/publications').set(auth(owner)).send({...body,category:'Otros',category_other:'Maquetas',condition_rating:5});
    expect(create.status,JSON.stringify(create.body)).toBe(201);
    expect(create.body.publication).toMatchObject({category:'Otros',category_other:'Maquetas',condition_rating:5,condition:'Como nuevo'});
    expect((await request(app).post('/api/publications').set(auth(owner)).send({...body,description:'a'.repeat(1001)})).status).toBe(400);
    expect((await request(app).post('/api/publications').set(auth(owner)).send({...body,description:'a'.repeat(1000)})).status).toBe(201);
    expect((await request(app).post('/api/publications').set(auth(owner)).send({...body,condition_rating:6})).status).toBe(400);
    expect((await request(app).post('/api/publications').set(auth(owner)).send({...body,service_fee:'0'})).status).toBe(400);
  });
  it('saves and publishes a rental without an availability end but rejects end-before-start',async()=>{
    const from=new Date(Date.now()+86400000).toISOString();
    const payload={...body,modality:'Alquiler',rental_unit:'hour',price:'40',available_from:from,available_until:null,images:['https://example.org/item.png']};
    const create=await request(app).post('/api/publications').set(auth(owner)).send(payload);
    expect(create.status,JSON.stringify(create.body)).toBe(201);const pub=create.body.publication;
    expect(pub.available_until).toBeNull();expect(pub.rental_unit).toBe('hour');
    const submit=await request(app).post(`/api/publications/${pub.id}/submit`).set(auth(owner));
    expect(submit.status,JSON.stringify(submit.body)).toBe(200);expect(submit.body.status).toBe('Activa');
    expect((await request(app).patch(`/api/publications/${pub.id}`).set(auth(owner)).send({available_until:new Date(Date.now()).toISOString()})).status).toBe(400);
  });
});
