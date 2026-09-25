import express from 'express';
import { createOperation, confirmDelivery } from '../controllers/operation.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas de operaciones son estrictamente privadas
router.use(requireAuth);

// Crear una nueva reserva / operación
router.post('/', createOperation);

// Confirmar la entrega de un equipo mediante OTP
router.post('/:id/confirm', confirmDelivery);

export default router;