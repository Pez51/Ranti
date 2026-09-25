import app from './src/app.js';
import { testConnection } from './src/config/database.js';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  // Probar la base de datos antes de levantar Express
  await testConnection();

  app.listen(PORT, () => {
    console.log(`🚀 Servidor Backend Ranti escuchando en el puerto ${PORT}`);
  });
};

startServer();