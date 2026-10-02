import pool from '../config/database.js';
import { expirePendingOperations } from '../modules/operations/operation.service.js';

try {
  const expired = await expirePendingOperations(pool, {
    now: new Date(), limit: 100, workerId: `expire-operations:${process.pid}`,
  });
  console.log(`Expired ${expired.length} operation requests.`);
} catch (error) {
  console.error('Operation request expiry failed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
