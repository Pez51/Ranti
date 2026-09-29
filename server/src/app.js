import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { requestContext } from './middlewares/request-context.middleware.js';
import { errorHandler, notFound } from './middlewares/error.middleware.js';

import authRoutes from './routes/auth.routes.js';
import publicationRoutes from './routes/publication.routes.js'; 
import operationRoutes from './routes/operation.routes.js'; 
import notificationRoutes from './routes/notification.routes.js'; // <- IMPORTACIÓN NUEVA
import userRoutes, { adminRoutes } from './routes/user.routes.js';

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

// Registro de Rutas Base
app.use('/api/auth', authRoutes);
app.use('/api/publications', publicationRoutes);
app.use('/api/operations', operationRoutes); 
app.use('/api/notifications', notificationRoutes); // <- REGISTRO NUEVO
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Ruta de comprobación de salud del servidor (Health Check)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API Ranti funcionando correctamente' });
});

app.use(notFound);
app.use(errorHandler);

export default app;
