import pool from '../config/database.js';
import { randomInt } from 'node:crypto';
import { z } from 'zod';

const reservationDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const createOperationInput = z.object({
  publication_id: z.uuid(),
  start_date: reservationDate.optional(),
  end_date: reservationDate.optional(),
});

// Las fechas sin hora representan medianoche de Perú; persistimos instantes UTC.
const asInstant = (value) => value
  ? new Date(value.length === 10 ? `${value}T00:00:00-05:00` : value).toISOString()
  : undefined;

// 1. Crear una nueva operación (Reserva / Compra)
export const createOperation = async (req, res) => {
  const parsed = createOperationInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Indica una publicación válida y fechas válidas en formato ISO.' });
  }
  const { publication_id } = parsed.data;
  const start_date = asInstant(parsed.data.start_date);
  const end_date = asInstant(parsed.data.end_date);
  const demandante_id = req.user.id; // Obtenido del token JWT

  let client;
  let releaseError;

  try {
    client = await pool.connect();
    await client.query('BEGIN'); // Iniciar bloqueo transaccional (ACID)

    // A. Obtener datos actuales de la publicación (Bloqueo pesimista para evitar modificaciones concurrentes)
    const pubQuery = `SELECT * FROM publications WHERE id = $1 FOR UPDATE`;
    const { rows: pubRows } = await client.query(pubQuery, [publication_id]);

    if (pubRows.length === 0) {
      throw new Error('Publicación no encontrada.');
    }
    const publication = pubRows[0];

    // Validar que el dueño no intente alquilar su propio equipo
    if (publication.owner_id === demandante_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No puedes reservar tu propia publicación.' });
    }

    if (publication.status !== 'Activa') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La publicación no está disponible para nuevas operaciones.' });
    }
    if (publication.modality === 'Venta' && (start_date || end_date)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Una venta no admite fechas de reserva.' });
    }
    if (publication.modality !== 'Venta' &&
        (!start_date || !end_date || Date.parse(start_date) >= Date.parse(end_date))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Indica un inicio y un fin posterior para el alquiler o préstamo.' });
    }

    // B. Validación de Disponibilidad (Solo para alquileres y préstamos)
    if (publication.modality !== 'Venta') {
      const overlapQuery = `
        SELECT id FROM reservations 
        WHERE publication_id = $1 
        AND status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso')
        AND (start_date < $3 AND end_date > $2)
      `;
      // start_date < end_input AND end_date > start_input (Fórmula de solapamiento de fechas)
      const overlapResult = await client.query(overlapQuery, [publication_id, start_date, end_date]);
      
      if (overlapResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'El equipo ya está reservado en esas fechas.' });
      }
    }

    // C. Crear el Snapshot inmutable del contrato (Precios al momento exacto de la reserva)
    const contractSnapshot = {
      title: publication.title,
      agreed_price: publication.price,
      guarantee_amount: publication.guarantee_amount,
      modality: publication.modality,
      created_at: new Date().toISOString()
    };

    // D. Generar código OTP seguro (6 dígitos)
    const otpCode = randomInt(100000, 1000000).toString();

    // E. Insertar la Operación
    const insertOpQuery = `
      INSERT INTO operations 
      (publication_id, demandante_id, oferente_id, modality, status, start_date, end_date,
       contract_snapshot, otp_code, requested_price, requested_guarantee_amount,
       requested_contract_version, request_expires_at, accepted_at, decided_at, decided_by)
      VALUES ($1, $2, $3, $4, 'Pendiente de pago/garantía', $5, $6, $7, $8,
              $9, $10, $11, CURRENT_TIMESTAMP + interval '48 hours',
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)
      RETURNING id, status
    `;
    const opValues = [
      publication_id, demandante_id, publication.owner_id, publication.modality,
      start_date || null, end_date || null, contractSnapshot, otpCode,
      publication.price, publication.guarantee_amount, publication.contract_version
    ];
    const { rows: newOp } = await client.query(insertOpQuery, opValues);
    const operationId = newOp[0].id;

    // F. La operación contractual conserva una reserva, incluida la venta sin intervalo.
    const insertResQuery = `
      INSERT INTO reservations (publication_id, operation_id, start_date, end_date,
                                status)
      VALUES ($1, $2, $3, $4, 'Reservada/Bloqueada')
    `;
    await client.query(insertResQuery, [publication_id, operationId, start_date || null, end_date || null]);

    await client.query('COMMIT'); // Guardar cambios

    res.status(201).json({
      message: 'Operación creada exitosamente. Procede al pago.',
      operation_id: operationId,
      status: newOp[0].status
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; }
    }
    if (error.message === 'Publicación no encontrada.') {
      return res.status(404).json({ error: 'Publicación no encontrada.' });
    }
    if (error.code === '23505' && error.constraint === 'reservations_one_live_sale_per_publication') {
      return res.status(409).json({ error: 'La publicación ya está reservada.' });
    }
    console.error('Error creando operación:', error.message);
    res.status(500).json({ error: 'No se pudo crear la operación.' });
  } finally {
    client?.release(releaseError);
  }
};

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
