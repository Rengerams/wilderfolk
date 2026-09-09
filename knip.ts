import type { KnipConfig } from 'knip';

/**
 * Knip configuration — Wilderfolk.
 *
 * This project has several independent runtime graphs that knip cannot infer by
 * itself, so they must be declared as entry points:
 *
 *   1. The React app bootstrap:              src/main.tsx
 *   2. The browser simulation web worker:    src/game/simWorker/gameWorker.ts
 *      (created at runtime via `new Worker(new URL('./gameWorker.ts', ...))`,
 *      which knip cannot statically follow).
 *   3. The Node / Tauri worker_threads build: src/game/simWorker/gameWorker.node.ts
 *      (dynamically `import('./gameWorker')`, also not statically reachable).
 *
 * Tests and scripts are legitimate consumers of the source (they exercise and
 * profile sim functions), so they are included in `project` to make sure their
 * imports count toward "used". Without them, everything used only by a test or
 * a perf/audit script would be reported as dead.
 *
 * Public barrel/facade modules (gameEngine, gameTypes, dayCycle, residency,
 * groupEvents, etc.) intentionally re-export a stable API surface even when
 * internal callers import the leaf modules directly. Those deliberate re-exports
 * are added as entries below so the audit does not report them as "unused".
 */
const config: KnipConfig = {
  entry: [
    // Independent runtime module graphs that knip cannot infer statically:
    // the browser web worker (loaded via `new Worker(new URL('./gameWorker.ts',...))`)
    // and the Node/Tauri worker_threads build (`import('./gameWorker')`).
    'src/game/simWorker/gameWorker.ts',
    'src/game/simWorker/gameWorker.node.ts',
    // Consumers whose imports should count as real usage.
    'tests/**/*.{test,spec}.{ts,tsx}',
    'scripts/**/*.{ts,mts,mjs}',
    // Public barrel / facade re-export surfaces kept as stable API.
    'src/game/gameEngine.ts',
    'src/game/gameTypes.ts',
    'src/game/dayCycle.ts',
    'src/game/residency.ts',
    'src/game/groupEvents.ts',
  ],
  project: [
    'src/**/*.{ts,tsx}',
    'config/**/*.ts',
  ],
  ignoreExportsUsedInFile: true,
};

export default config;
