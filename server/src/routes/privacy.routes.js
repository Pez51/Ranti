import express from 'express';
import pool from '../config/database.js';
import { requireAuth, requireRole, requireVerifiedAccount } from '../middlewares/auth.middleware.js';
import { AppError } from '../shared/errors/app-error.js';
import * as arco from '../modules/privacy/arco.service.js';

const router = express.Router();
const parse = express.json({ limit: '8mb' });
const adminOnly = requireRole('Administrador');

function handler(work, status = 200) {
  return async (req, res) => {
    try {
      const result = await work(req, req.user.id, req.requestId);
      if (Buffer.isBuffer(result?.bytes)) {
        const fileName = encodeURIComponent(result.name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
        res.set({ 'Content-Type': result.mime, 'Content-Disposition': `attachment; filename="documento"; filename*=UTF-8''${fileName}` });
        return res.send(result.bytes);
      }
      return res.status(status).json(result);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError({ status: 500, code: 'ARCO_ERROR', message: 'No se pudo completar la actuación del expediente.', details: undefined });
    }
  };
}

router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, requireAuth, requireVerifiedAccount);
router.get('/requests', handler((req, actor) => arco.listArcoRequests(pool, actor, req.query)));
router.post('/requests', parse, handler((req, actor, requestId) => arco.createArcoRequest(pool, actor, requestId, req.body), 201));
router.get('/requests/:id', handler((req, actor, requestId) => arco.readArcoRequest(pool, actor, requestId, req.params.id)));
router.post('/requests/:id/corrections', parse, handler((req, actor, requestId) => arco.correctArcoRequest(pool, actor, requestId, req.params.id, req.body)));
router.get('/requests/:id/evidence/:fileId', handler((req, actor, requestId) => arco.downloadArcoFile(pool, actor, requestId, req.params.id, { fileId: req.params.fileId })));
router.get('/requests/:id/response', handler((req, actor, requestId) => arco.downloadArcoFile(pool, actor, requestId, req.params.id)));
router.get('/admin/requests', adminOnly, handler((req, actor) => arco.listArcoRequests(pool, actor, req.query, true)));
router.get('/admin/requests/:id', adminOnly, handler((req, actor, requestId) => arco.readArcoRequest(pool, actor, requestId, req.params.id, true)));
router.post('/admin/requests/:id/decision', adminOnly, parse, handler((req, actor, requestId) => arco.decideArcoRequest(pool, actor, requestId, req.params.id, req.body)));
router.get('/admin/requests/:id/evidence/:fileId', adminOnly, handler((req, actor, requestId) => arco.downloadArcoFile(pool, actor, requestId, req.params.id, { fileId: req.params.fileId, admin: true })));
router.get('/admin/requests/:id/response', adminOnly, handler((req, actor, requestId) => arco.downloadArcoFile(pool, actor, requestId, req.params.id, { admin: true })));

router.use((error, _req, _res, next) => {
  if (error.type === 'entity.too.large' || error.type === 'entity.parse.failed') {
    return next(new AppError({ status: error.status, code: 'ARCO_INVALID_BODY', message: 'Revisa el formato y el tamaño del sustento adjunto.', details: undefined }));
  }
  next(error);
});

export default router;
