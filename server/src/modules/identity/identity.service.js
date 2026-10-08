import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../../config/database.js';

export const registerUser = async (userData) => {
  const { email, password, role = 'Estudiante', academic_condition } = userData;

  // 1. Regla de Negocio
  if (!email.endsWith('@estudiante.ucsm.edu.pe') && !email.endsWith('@ucsm.edu.pe')) {
    const error = new Error('Solo se permiten correos institucionales válidos de la UCSM.');
    error.statusCode = 400;
    throw error;
  }

  // 2. Verificación de existencia
  const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (userExists.rows.length > 0) {
    const error = new Error('El correo ya está registrado.');
    error.statusCode = 409;
    throw error;
  }

  // 3. Encriptación
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // 4. Inserción (Repositorio integrado por simplicidad)
  const newUser = await pool.query(
    `INSERT INTO users (email, password_hash, role, academic_condition) 
     VALUES ($1, $2, $3, $4) RETURNING id, email, role, status`,
    [email, passwordHash, role, academic_condition]
  );

  // 5. Generación de Token
  const token = jwt.sign(
    { id: newUser.rows[0].id, role: newUser.rows[0].role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { token, user: newUser.rows[0] };
};

export const loginUser = async (credentials) => {
  const { email, password } = credentials;

  const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (userResult.rows.length === 0) {
    const error = new Error('Credenciales inválidas.');
    error.statusCode = 401;
    throw error;
  }

  const user = userResult.rows[0];

  if (user.status === 'Suspendida') {
    const error = new Error('Tu cuenta ha sido suspendida por la administración.');
    error.statusCode = 403;
    throw error;
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    const error = new Error('Credenciales inválidas.');
    error.statusCode = 401;
    throw error;
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return {
    token,
    user: { id: user.id, email: user.email, role: user.role, reputation: user.reputation_score }
  };
};

// ... (mantén tu código actual de registerUser y loginUser arriba) ...

export const confirmUser = async (data) => {
  const { email, code } = data; // Asumiendo que validas con un código OTP enviado al correo

  // 1. Buscar al usuario
  const userResult = await pool.query('SELECT id, status FROM users WHERE email = $1', [email]);
  if (userResult.rows.length === 0) {
    const error = new Error('Usuario no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const user = userResult.rows[0];

  if (user.status === 'Activa') {
    return { message: 'La cuenta ya se encuentra verificada y activa.' };
  }

  // Aquí iría tu lógica real de validación del código (ej. contra una tabla de tokens)
  // if (codigoInvalido) throw Error...

  // 2. Actualizar el estado del usuario a "Activa"
  await pool.query("UPDATE users SET status = 'Activa' WHERE email = $1", [email]);

  return { message: 'Cuenta confirmada exitosamente. Ya puedes iniciar sesión.' };
};

export const resendVerification = async (data) => {
  const { email } = data;

  const userResult = await pool.query('SELECT id, status FROM users WHERE email = $1', [email]);
  if (userResult.rows.length === 0) {
    const error = new Error('Usuario no encontrado.');
    error.statusCode = 404;
    throw error;
  }

  if (userResult.rows[0].status === 'Activa') {
    return { message: 'Esta cuenta ya está activa, no requiere verificación.' };
  }

  // Aquí iría la integración con tu worker (Outbox) o Nodemailer para reenviar el correo
  // await outboxRepository.saveEvent('EmailVerification', { email, newCode });

  return { message: 'Se ha reenviado el código de verificación a tu correo institucional.' };
};