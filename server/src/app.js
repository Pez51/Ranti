import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Importación de rutas (las crearemos en el siguiente paso)
import authRoutes from './routes/auth.routes.js';

dotenv.config();

const app = express();

// Middlewares de Seguridad Globales
app.use(helmet()); // Protege cabeceras HTTP
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

// Ruta de comprobación de salud del servidor (Health Check)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API Ranti funcionando correctamente' });
});

export default app;