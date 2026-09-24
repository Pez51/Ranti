import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import operationRoutes from './routes/operation.routes.js';

const app = express();

// Middlewares globales
app.use(helmet()); // Protege las cabeceras HTTP
app.use(cors()); // Permite peticiones del frontend
app.use(express.json()); // Permite recibir JSON en el body

// Registro de rutas
app.use('/api/v1/operations', operationRoutes);

// Ruta de prueba (Health Check)
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API de Ranti funcionando correctamente',
  });
});

export default app;