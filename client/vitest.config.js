import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
    },
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
