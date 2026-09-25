import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const requireAuth = (req, res, next) => {
  try {
    // El token debe venir en la cabecera Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado o formato inválido.' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verificamos el token con nuestra clave secreta
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Inyectamos los datos del usuario en la petición (req)
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido o expirado. Inicia sesión nuevamente.' });
  }
};