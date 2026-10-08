import express from 'express';
import { register, login, resend, confirm } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

// Importaciones nuevas para la validación de datos (Paso B)
import { validateSchema } from '../middlewares/validation.middleware.js';
import { registerSchema, loginSchema, confirmSchema } from '../modules/identity/identity.schema.js';

const router = express.Router();

// Esquema rápido para reenviar código (solo necesita validar el email)
const emailOnlySchema = loginSchema.pick({ email: true });

// Rutas Públicas (Ahora protegidas por Zod contra datos maliciosos)
router.post('/register', validateSchema(registerSchema), register);
router.post('/verification/resend', validateSchema(emailOnlySchema), resend);
router.post('/verification/confirm', validateSchema(confirmSchema), confirm);
router.post('/login', validateSchema(loginSchema), login);

// Ruta de Prueba Privada (Se mantiene intacta tu lógica original)
router.get('/me', requireAuth, (req, res) => {
  // Si llega aquí, es porque requireAuth validó el token exitosamente
  res.status(200).json({ 
    message: 'Tienes acceso a rutas protegidas', 
    user: req.user 
  });
});

export default router;