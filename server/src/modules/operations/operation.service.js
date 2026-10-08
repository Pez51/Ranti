import pool from '../../config/database.js';
import * as operationRepo from './operation.repository.js';
import { AppError } from '../../shared/errors/app-error.js';

// 1. Crear una nueva operación (Reserva / Compra) - Uso de Transacciones
export const createOperation = async (operationData, userId) => {
  const { publication_id, start_date, end_date } = operationData;
  const client = await pool.connect(); 

  try {
    await client.query('BEGIN'); 

    const publication = await operationRepo.findPublicationForUpdate(client, publication_id);
    if (!publication) {
      throw new AppError({ status: 404, message: 'Publicación no encontrada.' });
    }

    if (publication.owner_id === userId) {
      throw new AppError({ status: 400, message: 'No puedes reservar tu propia publicación.' });
    }

    if (publication.modality !== 'Venta' && start_date && end_date) {
      const isOverlapping = await operationRepo.checkOverlappingReservations(client, publication_id, start_date, end_date);
      if (isOverlapping) {
        throw new AppError({ status: 409, message: 'El equipo ya está reservado en esas fechas.' });
      }
    }

    const contractSnapshot = {
      title: publication.title,
      agreed_price: publication.price,
      guarantee_amount: publication.guarantee_amount,
      modality: publication.modality,
      created_at: new Date().toISOString()
    };

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    const newOp = await operationRepo.insertOperation(client, [
      publication_id, userId, publication.owner_id, publication.modality,
      start_date || null, end_date || null, contractSnapshot, otpCode
    ]);

    if (publication.modality !== 'Venta') {
      await operationRepo.insertReservation(client, [publication_id, newOp.id, start_date, end_date]);
    }

    await client.query('COMMIT'); 
    
    return {
      message: 'Operación creada exitosamente.',
      operation_id: newOp.id,
      status: newOp.status,
      otp_code: otpCode 
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// 2. Confirmar Entrega Física
export const confirmDelivery = async (operationId, otpCode, userId) => {
  // Nota: Para mantenerlo simple, usamos pool directamente aquí. 
  // En un refactor futuro, esto también debería ir al operation.repository.js
  const { rows } = await pool.query(
    'SELECT oferente_id, otp_code, status FROM operations WHERE id = $1', 
    [operationId]
  );

  if (rows.length === 0) {
    throw new AppError({ status: 404, message: 'Operación no encontrada.' });
  }
  
  const operation = rows[0];

  if (operation.oferente_id !== userId) {
    throw new AppError({ status: 403, message: 'Solo el oferente puede confirmar la entrega del equipo.' });
  }

  if (operation.status !== 'Lista para entrega' && operation.status !== 'Pendiente de pago/garantía') {
    throw new AppError({ status: 400, message: 'La operación no se encuentra en estado de entrega.' });
  }

  if (operation.otp_code !== otpCode) {
    throw new AppError({ status: 400, message: 'Código OTP incorrecto. Verifica con el demandante.' });
  }

  const updateQuery = `
    UPDATE operations 
    SET status = 'Entregada/Activa', updated_at = CURRENT_TIMESTAMP 
    WHERE id = $1 RETURNING id, status
  `;
  const { rows: updatedRows } = await pool.query(updateQuery, [operationId]);

  return {
    message: 'Entrega confirmada exitosamente. La operación está activa.',
    operation: updatedRows[0]
  };
};

// 3. Listar Operaciones del Participante
export const listParticipantOperations = async (userId) => {
  const query = `
    SELECT * FROM operations 
    WHERE demandante_id = $1 OR oferente_id = $1 
    ORDER BY created_at DESC
  `;
  const { rows } = await pool.query(query, [userId]);
  return rows;
};

// 4. Obtener Detalle de Operación
export const getParticipantOperation = async (operationId, userId) => {
  const query = `
    SELECT * FROM operations 
    WHERE id = $1 AND (demandante_id = $2 OR oferente_id = $2)
  `;
  const { rows } = await pool.query(query, [operationId, userId]);
  
  if (rows.length === 0) {
    throw new AppError({ status: 404, message: 'Operación no encontrada o acceso denegado.' });
  }
  
  return rows[0];
};

// 5. Aceptar Operación (Oferente)
export const acceptOperation = async (operationId, userId) => {
  const query = `UPDATE operations SET status = 'Aceptada' WHERE id = $1 AND oferente_id = $2`;
  await pool.query(query, [operationId, userId]);
  return { message: 'Operación aceptada exitosamente.' };
};

// 6. Rechazar Operación (Oferente)
export const rejectOperation = async (operationId, userId) => {
  const query = `UPDATE operations SET status = 'Rechazada' WHERE id = $1 AND oferente_id = $2`;
  await pool.query(query, [operationId, userId]);
  return { message: 'Operación rechazada.' };
};

// 7. Cancelar Operación (Demandante)
export const cancelOperation = async (operationId, userId) => {
  const query = `UPDATE operations SET status = 'Cancelada' WHERE id = $1 AND demandante_id = $2`;
  await pool.query(query, [operationId, userId]);
  return { message: 'Operación cancelada.' };
};