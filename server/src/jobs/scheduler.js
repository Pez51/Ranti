import cron from 'node-cron';
import { processOutbox } from '../modules/outbox/outbox.worker.js';
import { expireOldOperations } from './expire-operations.js';

export const startCronJobs = () => {
  // Se ejecuta cada 2 minutos para procesar correos o eventos en el outbox
  cron.schedule('*/2 * * * *', async () => {
    try {
      console.log('🔄 [CRON] Procesando cola de eventos (Outbox)...');
      await processOutbox();
    } catch (error) {
      console.error('❌ [CRON Error] Fallo en processOutbox:', error.message);
    }
  });

  cron.schedule('* * * * *', async () => {
    try {
      console.log('⏳ [CRON] Limpiando operaciones expiradas...');
      await expireOldOperations();
    } catch (error) {
      console.error('❌ [CRON Error] Fallo en expireOldOperations:', error.message);
    }
  }, { noOverlap: true });

  console.log('⏰ Trabajos en segundo plano (Cron Jobs) inicializados correctamente.');
};
