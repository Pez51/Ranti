import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

export const register = async (req, res) => {
  const { email, password, role = 'Estudiante', academic_condition } = req.body;

  try {
    // 1. Regla de Negocio: Validar correo institucional
    if (!email.includes('@estudiante.ucsm.edu.pe') && !email.includes('@ucsm.edu.pe')) {
      return res.status(400).json({ error: 'Solo se permiten correos institucionales de la UCSM.' });
    }

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
       VALUES ($1, $2, $3, $4) RETURNING id, email, role, status`,
      [email, passwordHash, role, academic_condition]
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
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

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
        reputation: user.reputation_score
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};