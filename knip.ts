import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    // Real runtime roots, including the independent browser and Node worker graphs.
    'src/main.tsx!',
    'src/game/simWorker/gameWorker.ts!',
    'src/game/simWorker/gameWorker.node.ts!',
    // Build-time plugins are required to produce the shipped bundle.
    'vite.config.ts!',
    // Tests and manually invoked diagnostic scripts count only in the full audit.
    'tests/**/*.{test,spec}.{ts,tsx}',
    'tests/browser/villagePortraitUI.tsx',
    'scripts/**/*.{ts,mts,mjs}',
  ],
  project: [
    'src/**/*.{ts,tsx,css}!',
    '!src/test/**!',
    // Architectural registry is consumed by contract tests, never by the shipped game.
    '!src/game/simulation/decisionRegistry.ts!',
    '!src/**/*.{test,spec}.{ts,tsx}!',
    'config/**/*.ts',
    'scripts/**/*.{ts,mts,mjs}',
    'tests/**/*.{ts,tsx}',
  ],
  // Wilderfolk is a private application, not a published library. Re-export
  // facades must earn reachability from real entry points like any other module.
  includeEntryExports: true,

  // The smoke harness is imported by URL inside the Vite browser, not by Node.
  ignoreUnresolved: ['/tests/browser/villagePortraitUI.tsx'],
  // These are lint executables/plugins rather than application imports.
  ignoreDependencies: ['oxlint', 'oxlint-tsgolint'],
  // npm start invokes the installed devDependency Vite; production mode excludes devDependencies.
  ignoreBinaries: ['vite'],
};

export default config;
