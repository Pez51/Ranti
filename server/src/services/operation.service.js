import { pool } from '../config/database.js';

export const createOperation = async (demandanteId, publicationId, startDate, endDate) => {
  const client = await pool.connect();

  try {
    // 1. Iniciar transacción ACID
    await client.query('BEGIN');

    // 2. Bloqueo pesimista: Bloquear la fila de la publicación para evitar doble reserva concurrente
    const pubResult = await client.query(
      'SELECT * FROM publications WHERE id = $1 FOR UPDATE',
      [publicationId]
    );

    if (pubResult.rows.length === 0) {
      throw new Error('Publicación no encontrada');
    }

    const publication = pubResult.rows[0];

    // 3. Verificar solapamiento en la tabla reservations
    const conflictResult = await client.query(`
      SELECT id FROM reservations 
      WHERE publication_id = $1 
      AND status IN ('Reservada/Bloqueada', 'Activa/En uso', 'Bloqueo Provisional')
      AND (start_date <= $3 AND end_date >= $2)
    `, [publicationId, startDate, endDate]);

    if (conflictResult.rows.length > 0) {
      throw new Error('Las fechas seleccionadas ya están reservadas');
    }

    // 4. Crear snapshot inmutable del contrato
    const contractSnapshot = {
      price: publication.price,
      guarantee_amount: publication.guarantee_amount,
      modality: publication.modality,
      condition: publication.condition
    };

    // 5. Insertar la operación
    const opResult = await client.query(`
      INSERT INTO operations (publication_id, demandante_id, oferente_id, modality, contract_snapshot)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [
      publicationId, 
      demandanteId, 
      publication.owner_id, 
      publication.modality, 
      contractSnapshot
    ]);

    const operationId = opResult.rows[0].id;

    // 6. Insertar el bloqueo en reservations
    await client.query(`
      INSERT INTO reservations (publication_id, operation_id, start_date, end_date)
      VALUES ($1, $2, $3, $4)
    `, [publicationId, operationId, startDate, endDate]);

    // 7. Auditoría inmutable (NIST SP 800-92)
    await client.query(`
      INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, new_values)
      VALUES ($1, 'CREAR_OPERACION', 'operations', $2, $3)
    `, [demandanteId, operationId, contractSnapshot]);

    // 8. Confirmar transacción
    await client.query('COMMIT');
    return { success: true, operationId };

  } catch (error) {
    // Si hay cualquier error o conflicto, revertir todos los cambios
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};