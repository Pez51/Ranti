import express from 'express';
import * as controller from '../controllers/publication.controller.js';
import { requireAuth, requireRole, requireVerifiedAccount } from '../middlewares/auth.middleware.js';

// Inyecciones del Paso B (Validación Zod)
import { validateSchema } from '../middlewares/validation.middleware.js';
import { createPublicationSchema } from '../modules/publications/publication.schema.js';

const router = express.Router();
const owner = [requireAuth, requireVerifiedAccount];

// Rutas de Lectura (Públicas o de Usuario)
router.get('/', controller.getPublications);
router.get('/mine', ...owner, controller.listOwnPublications);
router.get('/:id', controller.getPublicationById);

// Rutas de Escritura (Protegidas por Zod)
router.post('/', ...owner, validateSchema(createPublicationSchema), controller.createPublication);
// Usamos .partial() porque al editar, el usuario podría enviar solo 1 o 2 campos, no todos.
router.patch('/:id', ...owner, validateSchema(createPublicationSchema.partial()), controller.updatePublication);

// Rutas de Cambio de Estado (Botones de acción rápida)
router.post('/:id/submit', ...owner, controller.submitPublication);
router.post('/:id/pause', ...owner, controller.pausePublication);
router.post('/:id/reactivate', ...owner, controller.reactivatePublication);
router.post('/:id/withdraw', ...owner, controller.withdrawPublication);

// --- Rutas de Administrador ---
export const publicationAdminRoutes = express.Router();
publicationAdminRoutes.use(requireAuth, requireVerifiedAccount, requireRole('Administrador'));
publicationAdminRoutes.get('/publications/reviews', controller.listPendingPublicationReviews);
publicationAdminRoutes.post('/publications/:id/review', controller.decidePublicationReview);

export default router;