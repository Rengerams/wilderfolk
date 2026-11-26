import type { KnipConfig } from 'knip';

// Knip's production mode deliberately excludes build-only dependency consumers.
const production = process.argv.includes('--production');

const config: KnipConfig = {
  entry: [
    // Real runtime roots, including the independent browser and Node worker graphs.
    'src/main.tsx!',
    'src/game/simWorker/gameWorker.ts!',
    'src/game/simWorker/gameWorker.node.ts!',
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
  ignoreDependencies: [
    'oxlint', 'oxlint-tsgolint',
    // Imported and executed by vite.config.ts; not part of the shipped runtime.
    ...(production ? ['@tailwindcss/vite'] : []),
  ],
  // npm start invokes the installed devDependency Vite; production mode excludes devDependencies.
  // Full-project mode discovers Vite and its config automatically through its plugin.
  ...(production ? { ignoreBinaries: ['vite'] } : {}),
};

export default config;
