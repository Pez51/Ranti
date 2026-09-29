import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { env } from '../config/env.js';

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado o formato inválido.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || typeof decoded.id !== 'string' ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(decoded.id)) {
      return res.status(401).json({ error: 'Sesión inválida. Inicia sesión nuevamente.' });
    }
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado. Inicia sesión nuevamente.' });
  }

  try {
    // Un JWT vigente no conserva permisos revocados después de su emisión.
    const { rows } = await pool.query(
      'SELECT id, role, status, verification_status FROM users WHERE id = $1',
      [decoded.id],
    );
    if (!rows.length) return res.status(401).json({ error: 'La cuenta de esta sesión no existe.' });
    if (rows[0].status === 'Suspendida') {
      return res.status(403).json({ error: 'Tu cuenta está suspendida.' });
    }
    req.user = rows[0];
  } catch {
    return res.status(503).json({ error: 'No se pudo comprobar la sesión. Inténtalo nuevamente.' });
  }
  next();
};

export const requireVerifiedAccount = (req, res, next) => {
  if (req.user?.status !== 'Activa' || req.user?.verification_status !== 'Verificado') {
    return res.status(403).json({ error: 'Necesitas una cuenta activa y verificada para realizar esta acción.' });
  }
  next();
};

export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Necesitas iniciar sesión para realizar esta acción.' });
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
  }
  next();
};
