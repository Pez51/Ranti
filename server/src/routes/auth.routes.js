import express from 'express';
import { register, login } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Rutas Públicas
router.post('/register', register);
router.post('/login', login);

// Ruta de Prueba Privada (Ejemplo para verificar que el token funciona)
router.get('/me', requireAuth, (req, res) => {
  // Si llega aquí, es porque requireAuth validó el token exitosamente
  res.status(200).json({ 
    message: 'Tienes acceso a rutas protegidas', 
    user: req.user 
  });
});

export default router;