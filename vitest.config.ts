
import { defineConfig } from 'vitest/config';
import { srcAlias } from './config/vite.shared.ts';

export default defineConfig({
  cacheDir: 'node_modules/.vite',

  resolve: {
    alias: {
      ...srcAlias,
    },
  },

  test: {
    // Fast Node environment.
    environment: 'node',

    // Faster worker communication than forked processes.
    pool: 'threads',

    // Keep CPU and memory usage predictable.
    maxWorkers: 4,

    // Execute independent test files concurrently.
    fileParallelism: true,

    // Preserve independent environments per test file.
    // Important for simulation state and global mocks.
    isolate: true,

    // Skip CSS processing.
    css: false,

    // Discover tests only inside the tests directory.
    dir: 'tests',
    include: ['**/*.test.ts'],

    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/src-tauri/target/**',
      '**/tmp/**',
    ],

    // Existing browser API / localStorage mocks.
    setupFiles: ['./src/test/setup.ts'],

    // Keep existing test behavior.
    testTimeout: 30_000,
    slowTestThreshold: 2_000,

    // No typechecking during test runs.
    typecheck: {
      enabled: false,
    },
  },
});
