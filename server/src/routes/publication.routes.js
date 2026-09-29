import express from 'express';
import { 
  getPublications, 
  getPublicationById, 
  createPublication 
} from '../controllers/publication.controller.js';
import { requireAuth, requireVerifiedAccount } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Rutas Públicas (No requieren Token)
// Permite a cualquier visitante ver el catálogo y los detalles
router.get('/', getPublications);
router.get('/:id', getPublicationById);

// Rutas Protegidas (Requieren Token de Sesión)
// Exclusivo para estudiantes/egresados autenticados
router.post('/', requireAuth, requireVerifiedAccount, createPublication);

export default router;
