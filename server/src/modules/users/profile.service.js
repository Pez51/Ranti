import pool from '../../config/database.js';

export const getProfile = async (userId) => {
  const { rows } = await pool.query(
    'SELECT id, display_name, email, role, status, contact_number, academic_condition, reputation_score FROM users WHERE id = $1',
    [userId]
  );
  
  if (rows.length === 0) {
    throw new Error('Usuario no encontrado'); // O usa tu clase AppError si la tienes implementada
  }
  
  return { user: rows[0] };
};

export const updateProfile = async (userId, data) => {
  const { display_name, contact_number } = data;
  
  const { rows } = await pool.query(
    `UPDATE users 
     SET display_name = COALESCE($1, display_name), 
         contact_number = COALESCE($2, contact_number) 
     WHERE id = $3 
     RETURNING id, display_name, email, contact_number, role, status, academic_condition, reputation_score`,
    [display_name, contact_number, userId]
  );

  return { user: rows[0] };
};