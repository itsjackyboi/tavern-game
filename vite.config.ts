import { defineConfig } from 'vitest/config';

// base './' keeps the build working under any GitHub Pages subpath.
export default defineConfig({
  base: './',
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: 'index.html', dev: 'dev.html' },
    },
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
