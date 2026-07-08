import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const cacheDir = path.resolve(__dirname, 'node_modules/.cache');
const storageFile = path.join(cacheDir, 'wilderfolk-vitest-localstorage.json');
mkdirSync(cacheDir, { recursive: true });
if (!existsSync(storageFile)) {
  writeFileSync(storageFile, '{}', 'utf8');
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
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