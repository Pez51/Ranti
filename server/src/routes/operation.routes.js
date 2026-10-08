import express from 'express';
import { 
  createOperation, listParticipantOperations, getParticipantOperation, 
  acceptOperation, rejectOperation, cancelOperation, confirmDelivery 
} from '../controllers/operation.controller.js';
import { requireAuth, requireVerifiedAccount } from '../middlewares/auth.middleware.js';

// Inyecciones del Paso B (Validación Zod)
import { validateSchema } from '../middlewares/validation.middleware.js';
import { createOperationSchema, confirmDeliverySchema } from '../modules/operations/operation.schema.js';

const router = express.Router();

// Todas las rutas de operaciones son estrictamente privadas
router.use(requireAuth, requireVerifiedAccount);

// Rutas protegidas por Zod
router.post('/', validateSchema(createOperationSchema), createOperation);
router.post('/:id/confirm', validateSchema(confirmDeliverySchema), confirmDelivery);

// Rutas de cambio de estado o consulta (No requieren validación de body porque actúan sobre el ID de la URL)
router.get('/mine', listParticipantOperations);
router.get('/:id', getParticipantOperation);
router.post('/:id/accept', acceptOperation);
router.post('/:id/reject', rejectOperation);
router.post('/:id/cancel', cancelOperation);

export default router;