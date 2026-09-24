import pg from 'pg';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Probar la conexión inicial
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error adquiriendo cliente de PostgreSQL', err.stack);
  } else {
    console.log('✅ Base de datos PostgreSQL conectada exitosamente');
    release();
  }
});