import { readFile } from 'node:fs/promises';
import db from '../server/src/config/database.js';
import { env } from '../server/src/config/env.js';
import { repairManualBaseline } from '../server/src/db/repair-manual-baseline.js';
import { runMigrations } from '../server/src/db/migrate.js';
try{
  const url=new URL(env.DATABASE_URL);
  if(env.NODE_ENV!=='development'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/ranti_db')throw new Error('This recovery tool is restricted to local development ranti_db.');
  if(!process.argv.includes('--backup-confirmed'))throw new Error('Back up the configured database first, then pass --backup-confirmed.');
  console.log(await repairManualBaseline(db,await readFile(new URL('../server/src/db/migrations/001_init.sql',import.meta.url))));
  console.log(await runMigrations(db));
}catch(e){console.error('Recovery stopped:',e.message);process.exitCode=1;}finally{await db.end();}
