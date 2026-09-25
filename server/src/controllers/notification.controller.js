import pool from '../config/database.js';

// 1. Obtener todas las notificaciones del usuario autenticado
export const getUserNotifications = async (req, res) => {
  const userId = req.user.id; // Obtenido del token JWT

  try {
    const query = `
      SELECT * FROM notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [userId]);
    
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ error: 'Error interno al cargar notificaciones.' });
  }
};

// 2. Marcar una notificación específica como leída
export const markAsRead = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const updateQuery = `
      UPDATE notifications 
      SET status = 'Leida' 
      WHERE id = $1 AND user_id = $2 
      RETURNING *
    `;
    const { rows } = await pool.query(updateQuery, [id, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada o no te pertenece.' });
    }

    res.status(200).json({ message: 'Notificación marcada como leída.', notification: rows[0] });
  } catch (error) {
    console.error('Error actualizando notificación:', error);
    res.status(500).json({ error: 'Error al actualizar el estado de la notificación.' });
  }
};

// 3. Función Utilitaria (No es un endpoint). Úsala dentro de operation.controller.js
export const createNotification = async (client, userId, type, title, message, referenceId = null) => {
  const insertQuery = `
    INSERT INTO notifications (user_id, type, title, message, reference_id)
    VALUES ($1, $2, $3, $4, $5)
  `;
  // Permite usar una transacción existente (client) o el pool por defecto
  const dbConfig = client || pool; 
  await dbConfig.query(insertQuery, [userId, type, title, message, referenceId]);
};