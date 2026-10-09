import { expirePendingOperations } from '../modules/operations/operation.service.js';

// Exportamos la función con el nombre exacto que busca scheduler.js
export const expireOldOperations = async () => {
  try {
    // Ya no inyectamos "pool" ni cerramos la conexión aquí, 
    // porque el Servicio y el Repositorio ya gestionan la base de datos solos.
    const expired = await expirePendingOperations();
    
    // Validamos que expired exista para evitar errores al leer .length
    const count = expired ? expired.length : 0;
    console.log(`[Job] Expired ${count} operation requests.`);
    
  } catch (error) {
    console.error('❌ [Job Error] Operation request expiry failed:', error.message);
    // NO usamos process.exitCode = 1 ni pool.end() aquí, 
    // porque apagarían todo el servidor Express.
  }
};