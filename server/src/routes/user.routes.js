import express from 'express';
import { requireAuth, requireRole, requireVerifiedAccount } from '../middlewares/auth.middleware.js';
import { getMe, patchMe, createRoleRequest, listMyRoleRequests,
  listRoleRequests, decideRoleRequest } from '../controllers/user.controller.js';

const userRoutes = express.Router();
userRoutes.use(requireAuth, requireVerifiedAccount);
userRoutes.get('/me', getMe);
userRoutes.patch('/me', patchMe);
userRoutes.post('/me/role-requests', createRoleRequest);
userRoutes.get('/me/role-requests', listMyRoleRequests);

export const adminRoutes = express.Router();
adminRoutes.use(requireAuth, requireVerifiedAccount, requireRole('Administrador'));
adminRoutes.get('/role-requests', listRoleRequests);
adminRoutes.post('/role-requests/:id/decision', decideRoleRequest);

export default userRoutes;
