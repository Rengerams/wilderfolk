import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const cacheDir = path.resolve(__dirname, 'node_modules/.cache');
const storageFile = path.join(cacheDir, 'wilderfolk-vitest-localstorage.json');
mkdirSync(cacheDir, { recursive: true });
if (!existsSync(storageFile)) {
  writeFileSync(storageFile, '{}', 'utf8');
}

/** Web Worker integration — requires `globalThis.Worker` (browser or compatible runtime). */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/test/game/simWorker/gameLoop.worker.test.ts',
      'src/test/game/simWorker/gameWorkerHost.test.ts',
    ],
    setupFiles: ['./src/test/setup.ts'],
    execArgv: [`--localstorage-file=${storageFile}`],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});