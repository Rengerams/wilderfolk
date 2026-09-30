#!/usr/bin/env node
/**
 * The one entry point for every check in this repository.
 *
 *   npm test                     the standard gate (default)
 *   npm test -- all              standard + types + lint
 *   npm test -- full             all + the 360-day invariant run
 *   npm test -- unit <pattern>   vitest only, optionally filtered
 *   npm test -- help             the full menu
 *
 * Why a runner instead of seventeen package.json scripts: the *composition* of
 * each gate lived spread across npm's `&&` chains, so "what does `test:all`
 * actually run" meant reading package.json and following three indirections.
 * One file answers that, and the npm scripts stay as thin aliases so nothing
 * that already calls them breaks.
 *
 * Two rules this file exists to keep:
 *
 *   1. NEVER call `npm run <alias>` for anything that aliases back to this
 *      runner - that is infinite recursion. Steps run the underlying tool
 *      directly, and `build` is the one exception because package.json owns it
 *      and it does not route through here.
 *   2. NEVER capture a step's output. `stdio: 'inherit'` keeps the child
 *      attached to this terminal. A runner that pipes a child's stdout can
 *      truncate it, and one that swallows an exit code is worse than no runner.
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

/** Every underlying command, in one place. Shell strings keep behaviour
 *  identical to the npm scripts this replaces - in particular the quoted jscpd
 *  ignore globs, which must reach jscpd literally. */
const STEP = {
  /**
   * One step, two scripts, on purpose. The docs guards must not become another
   * command an agent has to learn, remember or forget, and they cost
   * milliseconds - the owner's constraint is that the gate stays cheap, because
   * an agent should be improving the game rather than running gates. So they
   * ride inside the step `npm test` already runs.
   */
  check: 'node scripts/check-source-shadow-files.mjs && node scripts/check-docs.mjs',
  dup: 'jscpd src --min-lines 6 --min-tokens 60 --format typescript,tsx,javascript --ignore "**/test/**,**/*.test.ts,**/data/**"',
  unit: 'vitest run --exclude tests/fullYear.integration.test.ts',
  unitAll: 'vitest run',
  invariantTest: 'vitest run tests/fullYear.integration.test.ts',
  types: 'tsc -p tsconfig.vitest.json --noEmit',
  /**
   * `scripts/` is deliberately NOT a lint target here, and the narrowing is
   * worth knowing about rather than inheriting silently.
   *
   * The command used to name `scripts`, but oxlint honours `.gitignore` and
   * `scripts/` was ignored - so the gate reported 0/0 while never actually
   * reading the directory. Tracking `scripts/` on 2026-09-30 made oxlint read it
   * for the first time and surfaced 134 pre-existing errors across 40 files
   * (22 in `inspect-save.mts`, 16 in `perf-seeded-year.mts`, and 6 each in the
   * fully wired `run-full-year.mts` and `browser-smoke.mjs`).
   *
   * Most are `typescript(TS2591): Cannot find name 'process' / 'node:fs'`: the
   * type-aware check has no node types for files outside the tsconfig include,
   * so this configuration could not have passed on the tooling tree no matter
   * how clean the code was. Making it real means a tsconfig for `scripts/` wired
   * into oxlint - and the remaining genuine findings sit mostly in one-off
   * probes that the scripts/ cleanup is going to delete.
   *
   * Until that happens the gate states its actual scope instead of sitting red
   * on a directory it was never able to check.
   */
  lint: 'oxlint --type-aware --type-check src vite.config.ts vitest.config.ts',
  lintFix: 'oxlint --type-aware --type-check --fix src vite.config.ts vitest.config.ts',
  /**
   * knip can CRASH rather than report on this machine: oxc-parser's
   * `createBuffer()` reserves a single ~6 GiB ArrayBuffer ("6 GiB of *virtual*
   * memory", per its own comment), and with little free RAM that allocation
   * fails as `RangeError: Array buffer allocation failed`, which Windows
   * surfaces as 0xC0000409 (fail-fast). Observed 2026-09-30 with 2.4 GB free of
   * 15.4 GB; the same command had completed earlier in the same session.
   *
   * So a nonzero `knip` here does NOT necessarily mean "findings". Read the
   * output: a real report lists `Unused files (n)`. If you see a RangeError, it
   * is memory - close heavy processes and re-run, do not go hunting for dead code.
   */
  knip: 'knip',
  cycles: 'node scripts/check-import-cycles.mjs',
  invariants: 'tsx scripts/run-full-year.mts',
  browser: 'node scripts/browser-smoke.mjs',
  build: 'npm run build',
  clean: 'node scripts/clean.mjs',
  cleanApply: 'node scripts/clean.mjs --apply',
  watch: 'vitest',
};

/**
 * Gates, as ordered step lists. Fail-fast: the first failing step stops the
 * gate, which is what the `&&` chains these replace did.
 */
const GATE = {
  standard: ['check', 'dup', 'unit'],
  all: ['check', 'dup', 'unit', 'types', 'lint'],
  full: ['check', 'dup', 'unit', 'types', 'lint', 'invariants'],
  audit: ['knip', 'cycles'],
  accept: ['build', 'browser'],
};

/** Single steps exposed under their own name, mapped from their CLI name. */
const ALIAS = {
  check: ['check'],
  dup: ['dup'],
  types: ['types'],
  lint: ['lint'],
  knip: ['knip'],
  cycles: ['cycles'],
  invariants: ['invariants'],
  'invariant-test': ['invariantTest'],
  browser: ['browser'],
  build: ['build'],
  watch: ['watch'],
};

const MENU = `
wilderfolk test runner - one entry point, choose with args

  npm test                        standard gate: check -> dup -> unit
  npm test -- standard            same as above
  npm test -- all                 standard + types + lint
  npm test -- full                all + the 360-day invariant run
  npm test -- accept              build + the real-browser gate

  npm test -- unit [<pattern>]    vitest only; <pattern> filters by name/path
  npm test -- unit-all            vitest including the full-year integration file
  npm test -- invariant-test      just tests/fullYear.integration.test.ts
  npm test -- invariants          the 360-day run (docs/log/full-year-*.jsonl)
  npm test -- types               tsc on the vitest project
  npm test -- lint [--fix]        oxlint, type-aware
  npm test -- dup                 jscpd duplicate scan
  npm test -- check               source-shadow-file check
  npm test -- knip                knip (unused files/exports)
  npm test -- cycles [--strict|--json]
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
  steps = GATE[name].map((key) => STEP[key]);
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
    // Distinguish a crash from a finding. An abnormal exit reported as a plain
    // "exit 1" reads like "the check found problems" and sends the reader
    // looking for problems that may not exist.
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
