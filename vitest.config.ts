import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { srcAlias } from './config/vite.shared.ts';

const cacheDir = path.resolve(import.meta.dirname, 'node_modules/.cache');
const storageFile = path.join(cacheDir, 'wilderfolk-vitest-localstorage.json');
mkdirSync(cacheDir, { recursive: true });
if (!existsSync(storageFile)) {
  writeFileSync(storageFile, '{}', 'utf8');
}

export default defineConfig({
  test: {
    globals:true,
    environment: 'node',
    isolate: true, // <-- Dit zorgt ervoor dat workers hergebruikt worden
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    setupFiles: ['./src/test/setup.ts'],
    execArgv: [`--localstorage-file=${storageFile}`],
    slowTestThreshold: 2000,
    testTimeout: 30_000,
    // Instrument only the critical calendar owners in the required, fast A2 gate.
    // Other test tiers remain non-instrumented; expand/ratchet measured thresholds separately.
    coverage: {
      provider: 'v8',
      include: [
        'src/game/dayCycleClock.ts',
        'src/game/tickLayerDaily.ts',
        'src/game/dailyWorldEvents.ts',
      ],
      reporter: ['text-summary'],
      thresholds: {
        lines: 25,
        statements: 25,
        functions: 20,
        branches: 10,
      },
    },
  },
  resolve: {
    alias: {
      ...srcAlias,
    },
  },
});