import { createHash } from 'node:crypto';
import { baselineContract,historicalBaselineChecksum } from './baseline-contract.js';
import { validateBaseline } from './validate-baseline.js';

const extendedChecksum='c96d5740906b873b8bb10a6ab712dadc3292910eeab814d820886940bc9eecf0';
const digest=value=>createHash('sha256').update(value).digest('hex');
// Explicit recovery only. Normal startup still rejects all schema/checksum drift.
export async function repairManualBaseline(db,bytes){
  const sql=bytes.toString('utf8'),marker='\n-- =================================================================\n-- TABLA: outbox';
  const boundary=sql.indexOf(marker);
  if(digest(bytes)!==extendedChecksum||boundary<0||digest(sql.slice(0,boundary).trimEnd())!==historicalBaselineChecksum)throw new Error('Unsupported baseline bytes. Recovery refused.');
  const c=await db.connect();let locked=false;
  try{
    await c.query('SELECT pg_advisory_lock($1,$2)',[1380011604,1]);locked=true;await c.query('BEGIN');
    if((await c.query('SELECT name FROM schema_migrations')).rowCount)throw new Error('Migration history is not empty. Recovery refused.');
    const changes=[];
    for(const [name,expected] of Object.entries(baselineContract.enums)){
      const actual=(await c.query(`SELECT e.enumlabel FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
        JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' AND t.typname=$1 ORDER BY e.enumsortorder`,[name])).rows.map(row=>row.enumlabel);
      if(actual.length!==expected.length)throw new Error(`Unexpected enum ${name}. Recovery refused.`);
      for(let i=0;i<expected.length;i++){
        if(actual[i]===expected[i])continue;
        if(actual[i]!==Buffer.from(expected[i],'utf8').toString('latin1'))throw new Error(`Unexpected label in ${name}. Recovery refused.`);
        changes.push({name,old:actual[i],label:expected[i]});
      }
    }
    // All identifiers and labels come from the frozen contract and exact encoding comparison.
    for(const change of changes)await c.query(`ALTER TYPE public."${change.name}" RENAME VALUE '${change.old.replaceAll("'","''")}' TO '${change.label.replaceAll("'","''")}'`);
    await validateBaseline(c,{allowCareerColumn:true});
    if((await c.query("SELECT to_regclass('public.outbox') AS table")).rows[0].table)throw new Error('Existing legacy outbox requires separate validation. Recovery refused.');
    await c.query(sql.slice(boundary));
    await c.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',['001_init.sql',extendedChecksum]);
    await c.query('COMMIT');return {repairedLabels:changes.length,baseline:'001_init.sql'};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{if(locked)await c.query('SELECT pg_advisory_unlock($1,$2)',[1380011604,1]);c.release();}
}
