import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { z } from 'zod';

const institutionalEmail = z.string().trim().toLowerCase().email().max(255).refine(
  (email) => email.endsWith('@estudiante.ucsm.edu.pe') || email.endsWith('@ucsm.edu.pe'),
  'Solo se permiten correos institucionales válidos de la UCSM.',
);
const registerInput = z.object({
  email: institutionalEmail,
  password: z.string().min(8).max(72),
  role: z.literal('Estudiante').optional(),
  academic_condition: z.string().trim().max(100).optional(),
});
const loginInput = z.object({
  email: institutionalEmail,
  password: z.string().min(1).max(72),
});

export const register = async (req, res) => {
  const parsed = registerInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password, academic_condition } = parsed.data;

  try {
    // 2. Verificar si el usuario ya existe
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'El correo ya esta registrado.' });
    }

    // 3. Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Guardar en PostgreSQL
    const newUser = await pool.query(
      `INSERT INTO users (email, password_hash, role, academic_condition) 
       VALUES ($1, $2, $3, $4) RETURNING id, email, role, status, verification_status`,
      [email, passwordHash, 'Estudiante', academic_condition]
    );

    // 5. Generar JWT
    const token = jwt.sign(
      { id: newUser.rows[0].id, role: newUser.rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: newUser.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El correo ya está registrado.' });
    }
    console.error('Error en registro:', error.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

export const login = async (req, res) => {
  const parsed = loginInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ingresa un correo institucional y una contraseña válidos.' });
  }
  const { email, password } = parsed.data;

  try {
    // 1. Buscar usuario
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }
    const user = userResult.rows[0];

    // 2. Verificar si la cuenta está suspendida
    if (user.status === 'Suspendida') {
      return res.status(403).json({ error: 'Tu cuenta ha sido suspendida por la administracion' });
    }

    // 3. Comparar contraseñas
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    // 4. Generar JWT
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Bienvenido :D',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        verification_status: user.verification_status,
        reputation: user.reputation_score
      }
    });
  } catch (error) {
    console.error('Error en login:', error.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
