import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://ranti_test:local@127.0.0.1:5432/ranti_test',
      JWT_SECRET: 'ranti-test-jwt-secret-local-only',
      FRONTEND_URL: 'http://localhost:5173',
      PAYMENT_PROVIDER: 'simulated',
    },
  },
});
