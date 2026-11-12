import express from 'express';
import pool from '../config/database.js';
import { signToken } from '../controllers/auth.controller.js';
import { requireAuth, requireRole, requireVerifiedAccount } from '../middlewares/auth.middleware.js';
import { IdentityError } from '../modules/identity/identity.service.js';
import { academicCatalog } from '../modules/users/academic-catalog.js';
import { AppError } from '../shared/errors/app-error.js';
import * as graduate from '../modules/identity/graduate-accreditation.service.js';

const router = express.Router();
const admin = express.Router();
const parseEvidence = express.json({ type: ['application/json', 'application/vnd.ranti.accreditation+json'], limit: '8mb' });
const portalUser = req => graduate.accreditationSubject(req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]);

function handler(work, status = 200) {
  return async (req, res) => {
    try {
      const result = await work(req);
      if (Buffer.isBuffer(result?.bytes)) {
        const fileName = encodeURIComponent(result.name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="constancia.pdf"; filename*=UTF-8''${fileName}` });
        return res.send(result.bytes);
      }
      return res.status(status).json(result);
    } catch (error) {
      if (error instanceof IdentityError || error instanceof AppError) return res.status(error.status).json({ error: error.message, code: error.code });
      return res.status(500).json({ error: 'No se pudo completar la actuación de acreditación.' });
    }
  };
}

router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/catalog', (_req, res) => res.json(academicCatalog));
router.post('/register', parseEvidence, handler(req => graduate.registerGraduate(pool, req.requestId, req.body), 201));
router.post('/access', handler(async req => {
  const { token, application, user } = await graduate.accessGraduate(pool, req.body);
  return { token, application, ...(user ? { session: { token: signToken(user), user } } : {}) };
}));
router.get('/me', handler(req => graduate.readGraduate(pool, portalUser(req))));
router.post('/me/corrections', parseEvidence, handler(req => graduate.correctGraduate(pool, portalUser(req), req.requestId, req.body)));
router.get('/me/evidence/:fileId', handler(req => {
  const actor = portalUser(req);
  return graduate.readGraduateEvidence(pool, actor, req.requestId, actor, req.params.fileId);
}));

admin.use(requireAuth, requireVerifiedAccount, requireRole('Administrador'));
admin.get('/requests', handler(req => graduate.listGraduateAccreditations(pool, req.user.id, req.query)));
admin.get('/requests/:id', handler(req => graduate.readAdminGraduate(pool, req.user.id, req.requestId, req.params.id)));
admin.post('/requests/:id/decision', handler(req => graduate.decideGraduate(pool, req.user.id, req.requestId, req.params.id, req.body)));
admin.get('/requests/:id/evidence/:fileId', handler(req => graduate.readGraduateEvidence(pool, req.user.id, req.requestId, req.params.id, req.params.fileId, true)));
router.use('/admin', admin);

router.use((error, _req, res, next) => {
  if (error.type === 'entity.too.large' || error.type === 'entity.parse.failed') {
    return res.status(error.status).json({ error: 'Revisa el formato y el tamaño de la constancia.' });
  }
  next(error);
});

export default router;
