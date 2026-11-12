#!/usr/bin/env node
/**
 * The one entry point for every check in this repository (`npm test`; `npm test -- help` prints the
 * menu). Steps run tools directly, never an alias back to this runner, and output is never captured.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

/** npm puts `node_modules/.bin` on PATH for the scripts it spawns; a direct
 *  `node scripts/test.mjs` does not get that, so add it ourselves. */
const BIN = path.join(REPO, 'node_modules', '.bin');
const CHILD_ENV = {
  ...process.env,
  PATH: existsSync(BIN) ? `${BIN}${path.delimiter}${process.env.PATH ?? ''}` : process.env.PATH,
};

/** Every underlying command, in one place. Each string runs through a shell, so keep it literal. */
const STEP = {
  /**
   * Docs guards ride inside the step `npm test` already runs: they cost milliseconds and must not
   * become another command an agent has to remember.
   */
  check: 'node scripts/check-source-shadow-files.mjs && node scripts/check-dialogue-ownership.mjs && node scripts/check-dialogue-circumstances.mjs && node scripts/check-docs.mjs && node scripts/check-comments.mjs',
  dup: 'node scripts/check-duplicate-code.mjs',
  unit: 'vitest run --exclude tests/fullYear.integration.test.ts --exclude tests/longRunColony.integration.test.ts',
  unitAll: 'vitest run',
  invariantTest: 'vitest run tests/fullYear.integration.test.ts',
  /** Required in PR/main: real gameTick at selected day/year boundaries, not 720 simulated days. */
  calendarScheduler: 'vitest run tests/calendarPhase.auditRegressions.test.ts tests/simulation.decisionRegistry.test.ts --coverage',
  colonyIntegrationTest: 'vitest run tests/longRunColony.integration.test.ts',
  /** Both year-long gates are independent processes; running them together halves the wall time. */
  integrationTests: 'vitest run tests/fullYear.integration.test.ts tests/longRunColony.integration.test.ts',
  types: 'tsc -p tsconfig.vitest.json --noEmit && tsc -p tsconfig.scripts.json --noEmit && tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.node.json --noEmit',
  /**
   * `scripts/` is not a lint target here: it has its own `scripts-lint` / `scripts-types` steps below,
   * which use the scripts tsconfig project.
   */
  lint: 'oxlint --type-aware --type-check src vite.config.ts vitest.config.ts',
  lintFix: 'oxlint --type-aware --type-check --fix src vite.config.ts vitest.config.ts',
  /** oxlint's experimental `--type-check` ignores `--tsconfig` (it auto-discovers the
   *  nearest tsconfig, the empty root project), so scripts are typechecked with `tsc`. */
  scriptsLint: 'oxlint --type-aware --tsconfig tsconfig.scripts.json scripts',
  scriptsTypes: 'tsc -p tsconfig.scripts.json --noEmit',
  /**
   * A nonzero `knip` is not necessarily findings: oxc-parser reserves a ~6 GiB virtual buffer, and a
   * `RangeError: Array buffer allocation failed` means memory. A real report lists unused files.
   */
  knip: 'node scripts/check-knip.mjs',
  cycles: 'node scripts/check-import-cycles.mjs',
  /** Strict twin of `cycles`: a runtime import cycle exits 1 instead of warning. */
  cyclesStrict: 'node scripts/check-import-cycles.mjs --strict',
  owners: 'node scripts/build-call-graph.mjs --json-only --verify-owners',
  semantic: 'node --test scripts/check-function-overlap.test.mjs scripts/check-function-overlap.integration.test.mjs && node scripts/check-function-overlap.mjs',
  semanticDup: 'node scripts/check-semantic-duplicates.mjs',
  invariants: 'tsx scripts/run-full-year.mts',
  browser: 'node scripts/browser-smoke.mjs',
  build: 'npm run build',
  workerBoundary: 'tsx scripts/worker-boundary-audit.mts',
  clean: 'node scripts/clean.mjs',
  cleanApply: 'node scripts/clean.mjs --apply',
  watch: 'vitest',
};

/** Gates, as ordered step lists: fail-fast, so the first failing step stops the gate. */
const GATE = {
  standard: ['check', 'owners', 'semantic', 'semanticDup', 'cyclesStrict', 'dup', 'types', 'scriptsTypes', 'lint', 'unit'],
  // Same steps as `standard`: the menu has always promised that, so the order must match too.
  all: ['check', 'owners', 'semantic', 'semanticDup', 'cyclesStrict', 'dup', 'types', 'scriptsTypes', 'lint', 'unit'],
  // `build` runs its own duplicate scan, so `dup` appears once here.
  full: ['check', 'owners', 'semantic', 'semanticDup', 'cyclesStrict', 'dup', 'types', 'scriptsTypes', 'lint', 'unit', 'integrationTests', 'invariants', 'workerBoundary', 'knip', 'build'],
  audit: ['knip', 'owners', 'cycles'],
  accept: ['build', 'browser'],
};

/** Single steps exposed under their own name, mapped from their CLI name. */
const ALIAS = {
  check: ['check'],
  dup: ['dup'],
  types: ['types'],
  lint: ['lint'],
  'scripts-lint': ['scriptsLint'],
  'scripts-types': ['scriptsTypes'],
  knip: ['knip'],
  cycles: ['cycles'],
  owners: ['owners'],
  semantic: ['owners', 'semantic'],
  'semantic-dup': ['owners', 'semantic', 'semanticDup'],
  invariants: ['invariants'],
  'unit-all': ['unitAll'],
  'invariant-test': ['invariantTest'],
  'calendar-scheduler': ['calendarScheduler'],
  'colony-integration': ['colonyIntegrationTest'],
  'worker-boundary': ['workerBoundary'],
  browser: ['browser'],
  build: ['build'],
  watch: ['watch'],
};

const MENU = `
wilderfolk test runner - one entry point, choose with args

  npm test                        standard gate: check -> owners -> semantic -> cycles --strict -> dup -> types -> lint -> unit
  npm test -- standard            same as above
  npm test -- standard --changed <sha>  standard checks; only affected unit tests
  npm test -- all                 same steps as standard
  npm test -- full                standard + both year/colony integration files + invariants + worker boundary + knip + build
  npm test -- accept              build + the real-browser gate

  npm test -- unit [<pattern>]    vitest only; <pattern> filters by name/path
  npm test -- unit-all            vitest including the full-year integration file
  npm test -- invariant-test      just tests/fullYear.integration.test.ts
  npm test -- calendar-scheduler  required quick day/year boundary + registry/invariant coverage gate
  npm test -- colony-integration  dedicated 90-day producer regression
  npm test -- invariants          the 360-day run (docs/log/full-year-*.jsonl)
  npm test -- types               tsc on the vitest, scripts, app and node projects
  npm test -- lint [--fix]        oxlint, type-aware
  npm test -- scripts-lint        oxlint, type-aware, over scripts/
  npm test -- scripts-types       tsc on the scripts project
  npm test -- dup                 jscpd duplicate scan
  npm test -- check               source-shadow-file check
  npm test -- knip                knip (unused files/exports)
  npm test -- cycles [--strict|--json]
  npm test -- owners              verify every function has one recorded source owner
  npm test -- semantic            verify ownership, then block unreviewed function overlap
  npm test -- browser             browser gate (needs a prior build)
  npm test -- build               tsc app + tsc node + vite build
  npm test -- watch               vitest in watch mode
  npm test -- clean [--apply]     housekeeping (dry run unless --apply)

  npm test -- help                this menu
`;

function run(label, command) {
  process.stdout.write(`\n\x1b[1m> ${label}\x1b[0m\n  ${command}\n\n`);
  const result = spawnSync(command, {
    cwd: REPO,
    env: CHILD_ENV,
    stdio: 'inherit',
    shell: true,
  });
  if (result.error) {
    process.stderr.write(`\nrunner: could not start "${command}": ${result.error.message}\n`);
    return { status: 1, abnormal: false };
  }
  if (result.signal) {
    process.stderr.write(`\nrunner: step died on signal ${result.signal}\n`);
    return { status: 1, abnormal: true };
  }
  // A null status with no signal means the child died without a code.
  const status = result.status ?? 1;
  return { status, abnormal: status < 0 || status > 128 };
}

const argv = process.argv.slice(2);
const name = argv[0] ?? 'standard';
const rest = argv.slice(1);

if (name === 'help' || name === '--help' || name === '-h' || name === 'list') {
  process.stdout.write(`${MENU}\n`);
  process.exit(0);
}

// Resolve the requested steps, plus any trailing pass-through flags.
let steps;
if (name === 'unit') {
  steps = [rest.length > 0 ? `vitest run ${rest.join(' ')}` : STEP.unit];
} else if (name === 'lint' && rest.includes('--fix')) {
  steps = [STEP.lintFix];
} else if (name === 'clean') {
  steps = [rest.includes('--apply') ? STEP.cleanApply : STEP.clean];
} else if (name === 'cycles' && rest.length > 0) {
  steps = [`${STEP.cycles} ${rest.join(' ')}`];
} else if (GATE[name]) {
  if (rest.length > 0 && (name !== 'standard' || rest.length !== 2
    || rest[0] !== '--changed' || !/^[a-f0-9]{40}$/.test(rest[1]))) {
    process.stderr.write('runner: expected standard --changed <40-character commit SHA>.\n');
    process.exit(1);
  }
  steps = GATE[name].map((key) => key === 'unit' && rest.length > 0
    ? `${STEP.unit} --changed=${rest[1]} --passWithNoTests`
    : STEP[key]);
} else if (ALIAS[name]) {
  steps = ALIAS[name].map((key) => STEP[key]);
} else {
  process.stderr.write(`runner: unknown step "${name}".\n${MENU}\n`);
  process.exit(1);
}

const started = Date.now();
for (let i = 0; i < steps.length; i += 1) {
  const label = steps.length > 1 ? `[${i + 1}/${steps.length}] ${name}` : name;
  const { status, abnormal } = run(label, steps[i]);
  if (status !== 0) {
    // Distinguish a crash from a finding: an abnormal exit reported as a plain "exit 1" reads like
    // "the check found problems".
    const why = abnormal
      ? `ABNORMAL TERMINATION (exit ${status} / 0x${(status >>> 0).toString(16)}) - this is a crash or OOM, not a finding`
      : `exit ${status}`;
    process.stderr.write(
      `\n\x1b[31mrunner: FAILED\x1b[0m at step ${i + 1}/${steps.length} - ${why}; ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
    );
    process.exit(status >= 1 && status <= 255 ? status : 1);
  }
}

process.stdout.write(
  `\n\x1b[32mrunner: PASS\x1b[0m ${name} - ${steps.length} step(s) in ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
);
