import { pathToFileURL } from 'node:url';
import pool from '../config/database.js';
import { closeUnansweredReturns, expireOperationRequests, openOverdueReturns } from '../modules/operations/workflow-jobs.js';

export async function expireOldOperations(db = pool) {
  const results = await Promise.allSettled([expireOperationRequests(db), closeUnansweredReturns(db), openOverdueReturns(db)]);
  const failures = results.filter(result => result.status === 'rejected');
  if (results[0].status === 'fulfilled') console.log(`[Job] Expired ${results[0].value.length} operation requests.`);
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Operation deadlines could not be processed.');
  return results.map(result => result.status === 'fulfilled' ? result.value : []);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await expireOldOperations(); }
  catch (error) { console.error(error); process.exitCode = 1; }
  finally { await pool.end(); }
}
