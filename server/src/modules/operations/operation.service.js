import pool from '../../config/database.js';

// 1. Crear una nueva operación (Reserva / Compra)
export const createOperation = async (operationData, userId) => {
  const { publication_id, start_date, end_date } = operationData;
  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Iniciar bloqueo transaccional (ACID)

    // A. Obtener datos actuales de la publicación (Bloqueo FOR UPDATE)
    const pubQuery = `SELECT * FROM publications WHERE id = $1 FOR UPDATE`;
    const { rows: pubRows } = await client.query(pubQuery, [publication_id]);

    if (pubRows.length === 0) {
      const error = new Error('Publicación no encontrada.');
      error.statusCode = 404;
      throw error;
    }
    const publication = pubRows[0];

    // Validar que el dueño no intente alquilar su propio equipo
    if (publication.owner_id === userId) {
      const error = new Error('No puedes reservar tu propia publicación.');
      error.statusCode = 400;
      throw error;
    }

    // B. Validación de Disponibilidad (Solapamiento de fechas)
    if (publication.modality !== 'Venta' && start_date && end_date) {
      const overlapQuery = `
        SELECT id FROM reservations 
        WHERE publication_id = $1 
        AND status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso')
        AND (start_date < $3 AND end_date > $2)
      `;
      const overlapResult = await client.query(overlapQuery, [publication_id, start_date, end_date]);
      
      if (overlapResult.rows.length > 0) {
        const error = new Error('El equipo ya está reservado en esas fechas.');
        error.statusCode = 409;
        throw error;
      }
    }

    // C. Crear el Snapshot inmutable del contrato
    const contractSnapshot = {
      title: publication.title,
      agreed_price: publication.price,
      guarantee_amount: publication.guarantee_amount,
      modality: publication.modality,
      created_at: new Date().toISOString()
    };

    // D. Generar código OTP seguro (6 dígitos)
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // E. Insertar la Operación
    const insertOpQuery = `
      INSERT INTO operations 
      (publication_id, demandante_id, oferente_id, modality, status, start_date, end_date, contract_snapshot, otp_code)
      VALUES ($1, $2, $3, $4, 'Pendiente de pago/garantía', $5, $6, $7, $8)
      RETURNING id, status, otp_code
    `;
    const opValues = [
      publication_id, userId, publication.owner_id, publication.modality,
      start_date || null, end_date || null, contractSnapshot, otpCode
    ];
    const { rows: newOp } = await client.query(insertOpQuery, opValues);
    const operationId = newOp[0].id;

    // F. Insertar en la tabla de reservas (Si aplica)
    if (publication.modality !== 'Venta') {
      const insertResQuery = `
        INSERT INTO reservations (publication_id, operation_id, start_date, end_date)
        VALUES ($1, $2, $3, $4)
      `;
      await client.query(insertResQuery, [publication_id, operationId, start_date, end_date]);
    }

    await client.query('COMMIT'); 

    return {
      message: 'Operación creada exitosamente. Procede al pago.',
      operation_id: operationId,
      status: newOp[0].status,
      otp_code: otpCode 
    };

  } catch (error) {
    await client.query('ROLLBACK');
    // Si el error no tiene código HTTP, asignarle 500 por defecto
    if (!error.statusCode) error.statusCode = 500;
    throw error;
  } finally {
    client.release();
  }
};

// 2. Confirmar Entrega Física (El Oferente ingresa el OTP)
export const confirmDelivery = async (operationId, otpCode, userId) => {
  const opQuery = `SELECT oferente_id, otp_code, status FROM operations WHERE id = $1`;
  const { rows } = await pool.query(opQuery, [operationId]);

  if (rows.length === 0) {
    const error = new Error('Operación no encontrada.');
    error.statusCode = 404;
    throw error;
  }
  
  const operation = rows[0];

  if (operation.oferente_id !== userId) {
    const error = new Error('Solo el oferente puede confirmar la entrega del equipo.');
    error.statusCode = 403;
    throw error;
  }

  if (operation.status !== 'Lista para entrega' && operation.status !== 'Pendiente de pago/garantía') {
    const error = new Error('La operación no se encuentra en estado de entrega.');
    error.statusCode = 400;
    throw error;
  }

  if (operation.otp_code !== otpCode) {
    const error = new Error('Código OTP incorrecto. Verifica con el demandante.');
    error.statusCode = 400;
    throw error;
  }

  const updateQuery = `
    UPDATE operations 
    SET status = 'Entregada/Activa', updated_at = CURRENT_TIMESTAMP 
    WHERE id = $1 RETURNING id, status
  `;
  const updatedOp = await pool.query(updateQuery, [operationId]);

  return {
    message: 'Entrega confirmada exitosamente. La operación está activa.',
    operation: updatedOp.rows[0]
  };
};

export const listParticipantOperations = async (userId) => {
  const query = `SELECT * FROM operations WHERE demandante_id = $1 OR oferente_id = $1 ORDER BY created_at DESC`;
  const { rows } = await pool.query(query, [userId]);
  return rows;
};

export const getParticipantOperation = async (operationId, userId) => {
  const query = `SELECT * FROM operations WHERE id = $1 AND (demandante_id = $2 OR oferente_id = $2)`;
  const { rows } = await pool.query(query, [operationId, userId]);
  if (rows.length === 0) throw Object.assign(new Error('Operación no encontrada'), { statusCode: 404 });
  return rows[0];
};

export const acceptOperation = async (operationId, userId) => {
  // Lógica: Solo el oferente puede aceptar. Cambia estado a 'Pendiente de pago/garantía' o similar.
  await pool.query(`UPDATE operations SET status = 'Aceptada' WHERE id = $1 AND oferente_id = $2`, [operationId, userId]);
  return { message: 'Operación aceptada exitosamente.' };
};

export const rejectOperation = async (operationId, userId) => {
  await pool.query(`UPDATE operations SET status = 'Rechazada' WHERE id = $1 AND oferente_id = $2`, [operationId, userId]);
  return { message: 'Operación rechazada.' };
};

export const cancelOperation = async (operationId, userId) => {
  await pool.query(`UPDATE operations SET status = 'Cancelada' WHERE id = $1 AND demandante_id = $2`, [operationId, userId]);
  return { message: 'Operación cancelada.' };
};