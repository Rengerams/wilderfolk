import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const cacheDir = path.resolve(__dirname, 'node_modules/.cache');
const storageFile = path.join(cacheDir, 'wilderfolk-vitest-localstorage.json');
mkdirSync(cacheDir, { recursive: true });
if (!existsSync(storageFile)) {
  writeFileSync(storageFile, '{}', 'utf8');
}

/** Browser-only Web Worker suites — run via `npm run test:browser-worker`. */
const BROWSER_WORKER_TESTS = [
  'src/test/game/simWorker/gameLoop.worker.test.ts',
  'src/test/game/simWorker/gameWorkerHost.test.ts',
];

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      ...BROWSER_WORKER_TESTS,
    ],
    setupFiles: ['./src/test/setup.ts'],
    execArgv: [`--localstorage-file=${storageFile}`],
    slowTestThreshold: 2000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});