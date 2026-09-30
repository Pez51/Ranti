import express from 'express';
import * as controller from '../controllers/publication.controller.js';
import { requireAuth, requireRole, requireVerifiedAccount } from '../middlewares/auth.middleware.js';

const router = express.Router();
const owner = [requireAuth, requireVerifiedAccount];
router.get('/', controller.getPublications);
router.get('/mine', ...owner, controller.listOwnPublications);
router.get('/:id', controller.getPublicationById);
router.post('/', ...owner, controller.createPublication);
router.patch('/:id', ...owner, controller.updatePublication);
router.post('/:id/submit', ...owner, controller.submitPublication);
router.post('/:id/pause', ...owner, controller.pausePublication);
router.post('/:id/reactivate', ...owner, controller.reactivatePublication);
router.post('/:id/withdraw', ...owner, controller.withdrawPublication);

export const publicationAdminRoutes = express.Router();
publicationAdminRoutes.use(requireAuth, requireVerifiedAccount, requireRole('Administrador'));
publicationAdminRoutes.get('/publications/reviews', controller.listPendingPublicationReviews);
publicationAdminRoutes.post('/publications/:id/review', controller.decidePublicationReview);
export default router;
