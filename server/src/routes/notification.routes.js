import express from 'express';
import { getUserNotifications, markAsRead } from '../controllers/notification.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas de notificaciones son privadas
router.use(requireAuth);

// Obtener la lista de notificaciones
router.get('/', getUserNotifications);

// Marcar como leída
router.patch('/:id/read', markAsRead);

export default router;