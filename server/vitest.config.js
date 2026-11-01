import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'server.js'],
      exclude: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
    },
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
