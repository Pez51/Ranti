import pool from '../../config/database.js';

export const getProfile = async (userId) => {
  const { rows } = await pool.query('SELECT id, email, role, status, reputation_score FROM users WHERE id = $1', [userId]);
  return rows[0];
};

export const updateProfile = async (userId, data) => {
  // Lógica de update
  return { message: 'Perfil actualizado' };
};