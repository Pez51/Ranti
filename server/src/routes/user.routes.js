import express from 'express';
import { academicCatalog } from '../modules/users/academic-catalog.js';
import { requireAuth, requireRole, requireVerifiedAccount } from '../middlewares/auth.middleware.js';
import { getMe, patchMe, createRoleRequest, listMyRoleRequests,
  listRoleRequests, decideRoleRequest, putMyPhoto, getPhoto, getMemberProfile } from '../controllers/user.controller.js';

const userRoutes = express.Router();
userRoutes.get('/photos/:userId/:photoId', getPhoto);
userRoutes.use(requireAuth, requireVerifiedAccount);
userRoutes.get('/academic-catalog', (_req, res) => res.status(200).json(academicCatalog));
userRoutes.get('/me', getMe);
userRoutes.get('/:id/profile',getMemberProfile);
userRoutes.patch('/me', patchMe);
userRoutes.put('/me/photo', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' }), putMyPhoto);
userRoutes.post('/me/role-requests', createRoleRequest);
userRoutes.get('/me/role-requests', listMyRoleRequests);

export const adminRoutes = express.Router();
adminRoutes.use(requireAuth, requireVerifiedAccount, requireRole('Administrador'));
adminRoutes.get('/role-requests', listRoleRequests);
adminRoutes.post('/role-requests/:id/decision', decideRoleRequest);

export default userRoutes;
