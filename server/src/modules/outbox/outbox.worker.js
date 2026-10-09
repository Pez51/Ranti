import pool from '../../config/database.js';

// Exportamos la función con el nombre exacto que busca scheduler.js
export const processOutbox = async () => {
  try {
    // 1. Buscar eventos pendientes (ej. correos por enviar, notificaciones)
    // Se limita a 50 para no saturar la memoria en cada ciclo
    const query = `
      SELECT id, event_type, payload 
      FROM outbox 
      WHERE status = 'Pendiente' 
      ORDER BY created_at ASC 
      LIMIT 50
    `;
    const { rows: events } = await pool.query(query);

    if (events.length === 0) {
      // Si no hay nada en la cola, salimos silenciosamente
      return;
    }

    console.log(`[Outbox] Procesando ${events.length} eventos pendientes...`);

    // 2. Procesar cada evento uno por uno
    for (const event of events) {
      try {
        // --- AQUÍ VA TU LÓGICA DE EVENTOS ---
        // Ejemplo: Si el evento es enviar un correo de verificación
        if (event.event_type === 'EmailVerification') {
          // const { email, code } = event.payload;
          // await enviarCorreo(email, code);
        }

        // 3. Si todo sale bien, marcamos el evento como Procesado
        await pool.query(
          `UPDATE outbox SET status = 'Procesado', processed_at = CURRENT_TIMESTAMP WHERE id = $1`, 
          [event.id]
        );

      } catch (err) {
        // 4. Si un evento individual falla, lo marcamos como Fallido pero continuamos con el resto
        console.error(`[Outbox] Error procesando evento ${event.id}:`, err.message);
        await pool.query(
          `UPDATE outbox SET status = 'Fallido', error_log = $2 WHERE id = $1`, 
          [event.id, err.message]
        );
      }
    }
  } catch (error) {
    // Captura errores globales (ej. se cayó la base de datos)
    console.error('❌ [Outbox Error] Fallo crítico al revisar la cola de eventos:', error.message);
  }
};