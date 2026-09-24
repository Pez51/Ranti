import { Router } from 'express';
import { createOperationHandler } from '../controllers/operation.controller.js';
// import { requireAuth } from '../middlewares/auth.middleware.js'; // Implementar JWT posteriormente

const router = Router();

// router.post('/', requireAuth, createOperationHandler);
router.post('/', createOperationHandler); // Temporal sin JWT para pruebas iniciales

export default router;