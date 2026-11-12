import express from 'express';
import pool from '../config/database.js';
import { AppError } from '../shared/errors/app-error.js';
import { downloadReturnEvidence, readReturnEvidence, uploadReturnEvidence } from '../modules/operations/return-evidence.js';
import { 
  createOperation, listParticipantOperations, getParticipantOperation, 
  acceptOperation, rejectOperation, cancelOperation, confirmDelivery, coordinateHandoff, getCalendar, setCalendar, paySimulation
} from '../controllers/operation.controller.js';
import { requireAuth, requireVerifiedAccount } from '../middlewares/auth.middleware.js';

// Inyecciones del Paso B (Validación Zod)
import { validateSchema } from '../middlewares/validation.middleware.js';
import { createOperationSchema, confirmDeliverySchema } from '../modules/operations/operation.schema.js';

const router = express.Router();

// Todas las rutas de operaciones son estrictamente privadas
router.use(requireAuth, requireVerifiedAccount);
router.use((_req,res,next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});

// Rutas protegidas por Zod
router.post('/', validateSchema(createOperationSchema), createOperation);
router.post('/:id/confirm', validateSchema(confirmDeliverySchema), confirmDelivery);
router.post('/:id/handoff', coordinateHandoff);
router.get('/:id/return-evidence', async (req,res) => {
  res.json(await readReturnEvidence(pool,req.params.id,req.user.id));
});
router.post('/:id/return-evidence', express.raw({type:['image/jpeg','image/png','image/webp'],limit:'2mb'}), async (req,res) => {
  let name;
  try { name=decodeURIComponent(req.get('X-File-Name')??'Evidencia'); }
  catch { throw new AppError({status:400,code:'RETURN_EVIDENCE',message:'Nombre de foto inválido.',details:null}); }
  res.json(await uploadReturnEvidence(pool,req.params.id,req.user.id,req.body,req.get('Content-Type')?.split(';')[0],name));
});
router.get('/:id/return-evidence/:fileId', async (req,res) => {
  const file=await downloadReturnEvidence(pool,req.params.id,req.user.id,req.params.fileId);
  res.set({'Content-Type':file.mime,'X-Content-Type-Options':'nosniff',
    'Content-Disposition':`attachment; filename="evidencia"; filename*=UTF-8''${encodeURIComponent(file.name)}`}).send(file.bytes);
});
router.get('/:id/calendar', getCalendar);
router.post('/:id/calendar', setCalendar);
router.post('/:id/payment-simulation', paySimulation);

// Rutas de cambio de estado o consulta (No requieren validación de body porque actúan sobre el ID de la URL)
router.get('/mine', listParticipantOperations);
router.get('/:id', getParticipantOperation);
router.post('/:id/accept', acceptOperation);
router.post('/:id/reject', rejectOperation);
router.post('/:id/cancel', cancelOperation);

export default router;
