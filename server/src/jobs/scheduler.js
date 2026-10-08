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

  // Se ejecuta cada hora en el minuto 0 (ej. 1:00, 2:00) para limpiar reservas caducadas
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('⏳ [CRON] Limpiando operaciones expiradas...');
      await expireOldOperations();
    } catch (error) {
      console.error('❌ [CRON Error] Fallo en expireOldOperations:', error.message);
    }
  });

  console.log('⏰ Trabajos en segundo plano (Cron Jobs) inicializados correctamente.');
};