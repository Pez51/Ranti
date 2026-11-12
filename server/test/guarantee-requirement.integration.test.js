import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,it,expect } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';
import { writePublication } from '../src/modules/publications/publication-write.service.js';
import { buildContractSnapshot,publicOperation } from '../src/modules/operations/operation.policy.js';
import { createPublicationSchema } from '../src/modules/publications/publication.schema.js';
const enabled=process.env.RANTI_EPHEMERAL_DB==='1'&&!!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('guarantee requirement persistence and contract versions',()=>{
 let database,db,owner;
 beforeAll(async()=>{
  database=await createDisposableDatabase();db=database.db;
  await(await import('../src/db/migrate.js')).runMigrations(db);
  owner=(await db.query("INSERT INTO users(email,password_hash,role,status,verification_status) VALUES($1,'unused','Egresado','Activa','Verificado') RETURNING id",[`${randomUUID()}@ucsm.edu.pe`])).rows[0].id;
 });
 afterAll(async()=>{await database?.close();});
 it('defaults to referential, persists changes, bumps contract version and freezes the accepted condition',async()=>{
  const draft=await writePublication(db,owner,null,{title:'Router',modality:'Alquiler',price:'40',guarantee_amount:'100'});
  expect(draft.guarantee_required).toBe(false);
  const required=await writePublication(db,owner,draft.id,{guarantee_required:true});
  expect(required.guarantee_required).toBe(true);expect(Number(required.contract_version)).toBe(Number(draft.contract_version)+1);
  const unchanged=await writePublication(db,owner,draft.id,{guarantee_required:true});
  expect(unchanged.contract_version).toBe(required.contract_version);
  const snapshot=buildContractSnapshot(required,{demandante_id:'buyer',oferente_id:owner},new Date());
  expect(snapshot.guarantee_required).toBe(true);
  expect(publicOperation({demandante_id:'buyer',oferente_id:owner,accepted_at:new Date(),contract_snapshot:snapshot},owner).contract_snapshot.guarantee_required).toBe(true);
  const referential=await writePublication(db,owner,draft.id,{guarantee_required:false});
  expect(referential.guarantee_required).toBe(false);expect(Number(referential.contract_version)).toBe(Number(required.contract_version)+1);
  expect(snapshot.guarantee_required).toBe(true);
 });
 it('rejects required guarantees without an amount and clears the flag for sale',async()=>{
  await expect(writePublication(db,owner,null,{modality:'Préstamo',guarantee_required:true,guarantee_amount:'0'})).rejects.toThrow(/importe mayor a cero/);
  const sale=await writePublication(db,owner,null,{modality:'Venta',guarantee_required:true,guarantee_amount:'100'});
  expect(sale.guarantee_required).toBe(false);
  expect(createPublicationSchema.partial().safeParse({guarantee_required:'false'}).success).toBe(false);
 });
});
