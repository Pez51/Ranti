import app from './src/app.js';
import { testConnection } from './src/config/database.js';
import { env } from './src/config/env.js';
import { startCronJobs } from './src/jobs/scheduler.js';

const startServer = async () => {
  try {
    // 1. Probar la base de datos antes de levantar nada
    await testConnection();

    // 2. Iniciar el "reloj" de trabajos automáticos en segundo plano
    startCronJobs();

    // 3. Levantar el servidor Express
    app.listen(env.PORT, () => {
      console.log(`🚀 Servidor Backend Ranti escuchando en el puerto ${env.PORT}`);
    });
  } catch (error) {
    console.error('❌ Error crítico al iniciar el servidor:', error);
    process.exit(1); // Detiene el proceso si no hay base de datos
  }
};

startServer();