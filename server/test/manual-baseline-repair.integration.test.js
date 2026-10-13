import { readFile } from 'node:fs/promises';
import { describe,it,expect } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';
import { repairManualBaseline } from '../src/db/repair-manual-baseline.js';
import { runMigrations } from '../src/db/migrate.js';
const enabled=process.env.RANTI_EPHEMERAL_DB==='1'&&!!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('explicit manual baseline recovery',()=>{
  async function setup(){
    const database=await createDisposableDatabase();
    const bytes=await readFile(new URL('../src/db/migrations/001_init.sql',import.meta.url));
    const original=bytes.toString('utf8').split('\n-- =================================================================\n-- TABLA: outbox')[0].trimEnd();
    await database.db.query(Buffer.from(original,'utf8').toString('latin1'));
    await database.db.query('ALTER TABLE users ADD COLUMN career VARCHAR(100); CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    return {database,db:database.db,bytes};
  }
  it('repairs exact mojibake, preserves users and allows normal migration/startup',async()=>{
    const {database,db,bytes}=await setup();
    try{
      await db.query("INSERT INTO users(email,password_hash,role,status,verification_status,career)VALUES('repair-test@ucsm.edu.pe','unused','Egresado','Activa','Verificado','Prueba')");
      expect((await repairManualBaseline(db,bytes)).repairedLabels).toBe(14);
      const migrated=await runMigrations(db);expect(migrated.applied).toContain('022_chat_workflow_events.sql');
      expect((await db.query('SELECT career FROM users')).rows).toEqual([{career:'Prueba'}]);
      expect((await runMigrations(db)).applied).toEqual([]);
      await expect(repairManualBaseline(db,bytes)).rejects.toThrow('history is not empty');
    }finally{await database.close();}
  });
  it('rolls back label repairs if any unknown schema drift is present',async()=>{
    const {database,db,bytes}=await setup();
    try{
      await db.query('ALTER TABLE users ADD COLUMN unknown_field text');
      await expect(repairManualBaseline(db,bytes)).rejects.toThrow('columns of users differ');
      const labels=(await db.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=enumtypid WHERE typname='modality_type'")).rows.map(row=>row.enumlabel);
      expect(labels).toContain(Buffer.from('Préstamo','utf8').toString('latin1'));
      expect((await db.query('SELECT name FROM schema_migrations')).rowCount).toBe(0);
    }finally{await database.close();}
  });
});
