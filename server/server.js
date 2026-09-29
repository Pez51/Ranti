import app from './src/app.js';
import { testConnection } from './src/config/database.js';
import { env } from './src/config/env.js';

const startServer = async () => {
  // Probar la base de datos antes de levantar Express
  await testConnection();

  app.listen(env.PORT, () => {
    console.log(`🚀 Servidor Backend Ranti escuchando en el puerto ${env.PORT}`);
  });
};

startServer();
