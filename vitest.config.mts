import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Vitest's default `threads` pool hangs on Node 25 (the run never starts).
    // `forks` runs the same tests reliably across Node 20–25.
    pool: 'forks',
    // Loads .env.local for the RLS integration test. The unit tests need
    // nothing from it and pass on a clean clone.
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
  },
});
