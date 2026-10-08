import pool from '../../config/database.js';

export const findByEmail = async (email) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0]; // Devuelve el usuario o undefined
};

export const createUser = async (userData) => {
  const { email, passwordHash, role, academic_condition } = userData;
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, academic_condition) 
     VALUES ($1, $2, $3, $4) RETURNING id, email, role, status`,
    [email, passwordHash, role, academic_condition]
  );
  return rows[0];
};

export const updateUserStatus = async (email, status) => {
  await pool.query('UPDATE users SET status = $1 WHERE email = $2', [status, email]);
};