/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      // warn until EI-1..15 are cleared — still listed on every run
      name: 'no-circular',
      severity: 'warn',
      comment:
        'Circular imports (see private/BUGS_TRACKER EI-*). Prefer breaking hubs over adding new cycles.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'File is not reachable from entry points (dead code candidate).',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)vite\\.config\\.(js|ts|mjs|cjs)$',
          '(^|/)vitest\\.config\\.(js|ts|mjs|cjs)$',
          '(^|/)eslint\\.config\\.(js|ts|mjs|cjs)$',
          '(^|/)knip\\.json$',
          '\\.dependency-cruiser\\.(cjs|js|mjs)$',
          '(^|/)src/test/',
          '\\.test\\.(ts|tsx)$',
          '(^|/)scripts/',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment: 'Production/runtime code must not import test files.',
      from: { pathNot: '\\.test\\.(ts|tsx)$|(^|/)src/test/' },
      to: { path: '\\.test\\.(ts|tsx)$|(^|/)src/test/' },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'src must not import packages that are only in devDependencies.',
      from: { path: '(^|/)src/', pathNot: '\\.test\\.(ts|tsx)$|(^|/)src/test/' },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
      dependencyTypes: [
        'npm',
        'npm-dev',
        'npm-optional',
        'npm-peer',
        'npm-bundled',
        'npm-no-pkg',
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
