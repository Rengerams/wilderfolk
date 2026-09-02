import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/main.tsx',
    'src/App.tsx',
    'src/test/setup.ts',
    'vite.config.ts',
    'vitest.config.ts',
    'tailwind.config.js',
    'postcss.config.js', // Toegevoegd als entry point
    'scripts/*.{mjs,mts}',
  ],
  
  project: [
    'src/**/*.{ts,tsx}',
    'config/**/*.ts',
    'scripts/**/*.{mjs,mts}',
    'vite.config.ts',
    'vitest.config.ts',
    'tailwind.config.js',
    'postcss.config.js', // Toegevoegd aan de project scope
    'tsconfig*.json',
    '.oxlintrc.json',
  ],

  ignoreDependencies: [
    'husky',
    'jscpd',
    'knip',
    'oxlint',
  ],

  ignoreExportsUsedInFile: true,
};

export default config;