import express from 'express';
import { createOperation, listParticipantOperations, getParticipantOperation, acceptOperation,
  rejectOperation, cancelOperation, confirmDelivery } from '../controllers/operation.controller.js';
import { requireAuth, requireVerifiedAccount } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Todas las rutas de operaciones son estrictamente privadas
router.use(requireAuth, requireVerifiedAccount);

router.post('/', createOperation);
router.get('/mine', listParticipantOperations);
router.get('/:id', getParticipantOperation);
router.post('/:id/accept', acceptOperation);
router.post('/:id/reject', rejectOperation);
router.post('/:id/cancel', cancelOperation);

// Confirmar la entrega de un equipo mediante OTP
router.post('/:id/confirm', confirmDelivery);

export default router;
