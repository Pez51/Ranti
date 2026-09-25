import pool from '../config/database.js';

// 1. Crear una nueva operación (Reserva / Compra)
export const createOperation = async (req, res) => {
  const { publication_id, start_date, end_date } = req.body;
  const demandante_id = req.user.id; // Obtenido del token JWT

  const client = await pool.connect();

  try {
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
      return res.status(400).json({ error: 'No puedes reservar tu propia publicación.' });
    }

    // B. Validación de Disponibilidad (Solo para alquileres y préstamos)
    if (publication.modality !== 'Venta' && start_date && end_date) {
      const overlapQuery = `
        SELECT id FROM reservations 
        WHERE publication_id = $1 
        AND status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso')
        AND (start_date < $3 AND end_date > $2)
      `;
      // start_date < end_input AND end_date > start_input (Fórmula de solapamiento de fechas)
      const overlapResult = await client.query(overlapQuery, [publication_id, start_date, end_date]);
      
      if (overlapResult.rows.length > 0) {
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
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // E. Insertar la Operación
    const insertOpQuery = `
      INSERT INTO operations 
      (publication_id, demandante_id, oferente_id, modality, status, start_date, end_date, contract_snapshot, otp_code)
      VALUES ($1, $2, $3, $4, 'Pendiente de pago/garantía', $5, $6, $7, $8)
      RETURNING id, status, otp_code
    `;
    const opValues = [
      publication_id, demandante_id, publication.owner_id, publication.modality,
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

    await client.query('COMMIT'); // Guardar cambios

    res.status(201).json({
      message: 'Operación creada exitosamente. Procede al pago.',
      operation_id: operationId,
      status: newOp[0].status,
      // En un entorno real, el OTP solo se le devuelve al demandante (quien recibe el equipo)
      otp_code: otpCode 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando operación:', error);
    res.status(error.message === 'Publicación no encontrada.' ? 404 : 500).json({ error: error.message || 'Error interno del servidor.' });
  } finally {
    client.release();
  }
};

// 2. Confirmar Entrega Física (El Oferente ingresa el OTP)
export const confirmDelivery = async (req, res) => {
  const { id } = req.params; // ID de la operación
  const { otp_code } = req.body;
  const user_id = req.user.id;

  try {
    // Verificar operación y permisos (Solo el dueño/oferente puede confirmar la entrega)
    const opQuery = `SELECT oferente_id, otp_code, status FROM operations WHERE id = $1`;
    const { rows } = await pool.query(opQuery, [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Operación no encontrada.' });
    
    const operation = rows[0];

    if (operation.oferente_id !== user_id) {
      return res.status(403).json({ error: 'Solo el oferente puede confirmar la entrega del equipo.' });
    }

    if (operation.status !== 'Lista para entrega' && operation.status !== 'Pendiente de pago/garantía') {
      return res.status(400).json({ error: 'La operación no se encuentra en estado de entrega.' });
    }

    // Validar OTP
    if (operation.otp_code !== otp_code) {
      return res.status(400).json({ error: 'Código OTP incorrecto. Verifica con el demandante.' });
    }

    // Actualizar estado a "Entregada/Activa"
    const updateQuery = `
      UPDATE operations 
      SET status = 'Entregada/Activa', updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 RETURNING id, status
    `;
    const updatedOp = await pool.query(updateQuery, [id]);

    // (Opcional) Aquí también se actualizaría el estado en la tabla 'reservations' a 'Activa/En uso'

    res.status(200).json({
      message: 'Entrega confirmada exitosamente. La operación está activa.',
      operation: updatedOp.rows[0]
    });

  } catch (error) {
    console.error('Error confirmando entrega:', error);
    res.status(500).json({ error: 'Error al procesar la confirmación.' });
  }
};