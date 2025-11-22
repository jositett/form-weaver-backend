import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    dir: './src/tests',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.test.ts',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});