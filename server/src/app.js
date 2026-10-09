import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { requestContext } from './middlewares/request-context.middleware.js';
import { errorHandler, notFound } from './middlewares/error.middleware.js';

import authRoutes from './routes/auth.routes.js';
import publicationRoutes, { publicationAdminRoutes } from './routes/publication.routes.js';
import operationRoutes from './routes/operation.routes.js'; 
import notificationRoutes from './routes/notification.routes.js';
import userRoutes, { adminRoutes } from './routes/user.routes.js';
// (Se eliminó la importación duplicada de errorHandler que causaba el fallo)

const app = express();

app.use(requestContext);

// Middlewares de Seguridad Globales
app.use(helmet()); // Protege cabeceras HTTP
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true
}));

// Límite de peticiones para evitar ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Límite de 100 peticiones por IP
  message: 'Demasiadas peticiones desde esta IP, intenta de nuevo más tarde.'
});
app.use('/api', limiter);

// Parseo de JSON (necesario para leer req.body)
app.use(express.json());

// Morgan (Logging)
app.use(morgan('dev'));

// Registro de Rutas Base
app.use('/api/auth', authRoutes);
app.use('/api/publications', publicationRoutes);
app.use('/api/operations', operationRoutes); 
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', publicationAdminRoutes);

// Ruta de comprobación de salud del servidor (Health Check)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API Ranti funcionando correctamente' });
});

// ==========================================
// EL INTERCEPTOR DE ERRORES (Debe ir al final)
// ==========================================

// 1. Atrapa todas las peticiones a rutas que no existen (404)
app.use(notFound);

// 2. Procesa cualquier error enviado por los controladores o Zod
app.use(errorHandler);

export default app;