import pool from '../config/database.js';
import { AppError } from '../shared/errors/app-error.js';
import * as operations from '../modules/operations/operation.service.js';

const handle = work => async (req, res) => {
  try { await work(req, res); } catch (error) {
    res.status(error instanceof AppError ? error.status : 500).json({
      error: error instanceof AppError ? error.message : 'Error interno del servidor.' });
  }
};

export const createOperation = handle(async (req, res) => res.status(201).json({
  operation: await operations.requestOperation(pool, req.user.id, req.body),
}));
export const listParticipantOperations = handle(async (req, res) =>
  res.json(await operations.listParticipantOperations(pool, req.user.id, req.query)));
export const getParticipantOperation = handle(async (req, res) =>
  res.json({ operation: await operations.getParticipantOperation(pool, req.user.id, req.params.id) }));
export const acceptOperation = handle(async (req, res) =>
  res.json({ operation: await operations.decideOperation(pool, req.user.id, req.params.id,
    { ...req.body, decision: 'accept' }) }));
export const rejectOperation = handle(async (req, res) =>
  res.json({ operation: await operations.decideOperation(pool, req.user.id, req.params.id,
    { ...req.body, decision: 'reject' }) }));
export const cancelOperation = handle(async (req, res) =>
  res.json({ operation: await operations.cancelOperation(pool, req.user.id, req.params.id, req.body) }));

// 2. Confirmar Entrega Física (El Oferente ingresa el OTP)
export const confirmDelivery = async (req, res) => {
  const { id } = req.params; // ID de la operación
  const { otp_code } = req.body ?? {};
  const user_id = req.user.id;

  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ||
      typeof otp_code !== 'string' || !/^\d{6}$/.test(otp_code)) {
    return res.status(400).json({ error: 'La operación y el código de seis dígitos son obligatorios.' });
  }

  let client;
  let releaseError;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Verificar operación y permisos (Solo el dueño/oferente puede confirmar la entrega)
    const opQuery = `SELECT oferente_id, otp_code, status, modality FROM operations WHERE id = $1 FOR UPDATE`;
    const { rows } = await client.query(opQuery, [id]);

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Operación no encontrada.' });
    }
    
    const operation = rows[0];

    if (operation.oferente_id !== user_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo el oferente puede confirmar la entrega del equipo.' });
    }

    if (operation.status !== 'Lista para entrega') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La operación todavía no está lista para entrega o ya fue entregada.' });
    }

    // Validar OTP
    if (operation.otp_code !== otp_code) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Código OTP incorrecto. Verifica con el demandante.' });
    }

    // Actualizar estado a "Entregada/Activa"
    const updateQuery = `
      UPDATE operations 
      SET status = 'Entregada/Activa', otp_code = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING id, status
    `;
    const updatedOp = await client.query(updateQuery, [id]);

    if (operation.modality !== 'Venta') {
      await client.query(
        `UPDATE reservations SET status = 'Activa/En uso'
         WHERE operation_id = $1 AND status IN ('Bloqueo Provisional', 'Reservada/Bloqueada')`,
        [id],
      );
    }
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, 'confirm_delivery', 'operation', $2, $3, $4)`,
      [user_id, id, { status: operation.status }, { status: 'Entregada/Activa' }],
    );
    await client.query('COMMIT');

    res.status(200).json({
      message: 'Entrega confirmada exitosamente. La operación está activa.',
      operation: updatedOp.rows[0]
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; }
    }
    console.error('Error confirmando entrega:', error.message);
    res.status(500).json({ error: 'Error al procesar la confirmación.' });
  } finally {
    client?.release(releaseError);
  }
};
