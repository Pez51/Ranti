import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

// Middlewares globales
app.use(helmet()); // Protege las cabeceras HTTP
app.use(cors()); // Permite peticiones del frontend
app.use(express.json()); // Permite recibir JSON en el body

// Ruta de prueba (Health Check)
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API de Ranti funcionando correctamente 🚀',
  });
});

export default app;