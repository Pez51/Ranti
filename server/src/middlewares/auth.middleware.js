import jwt from 'jsonwebtoken';
import { AppError } from '../shared/errors/app-error.js';
import pool from '../config/database.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError({ status: 401, message: 'No autenticado. Token faltante.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificación en tiempo real: Traemos el rol y estado directo de la base de datos
    const { rows } = await pool.query(
      'SELECT id, email, role, status FROM users WHERE id = $1', 
      [decoded.id]
    );
    
    if (rows.length === 0) {
      throw new AppError({ status: 401, message: 'Usuario no encontrado en el sistema.' });
    }

    // Inyectamos la información fresca y real en la petición
    req.user = rows[0];
    next();
  } catch (error) {
    next(new AppError({ status: 401, message: 'Token inválido o expirado.', code: 'AUTH_INVALID_TOKEN' }));
  }
};

export const requireVerifiedAccount = (req, res, next) => {
  // Soportamos ambas variaciones ('Activo' o 'Activa') para evitar bloqueos por género de la palabra
  if (req.user.status !== 'Activo' && req.user.status !== 'Activa') {
    return next(new AppError({ 
      status: 403, 
      message: 'Necesitas una cuenta activa y verificada para realizar esta acción.' 
    }));
  }
  next();
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return next(new AppError({ status: 403, message: `No tienes permisos suficientes. Requiere: ${role}` }));
    }
    next();
  };
};