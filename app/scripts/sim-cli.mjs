/**
 * Headless sim / benchmark dispatcher — keeps `npm run` short.
 *
 * Usage:
 *   npm run sim              # list profiles
 *   npm run sim -- 5min      # default smoke sim
 *   npm run sim -- 20year    # v0.5 ship gatekeeper
 *   npm run sim -- kill      # stop stuck sim (sim.lock)
 *
 * Env vars: see scripts/run-sim.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');

/** Profiles routed through run-sim.mjs */
const RUN_SIM = {
  '5min': 'simulate-5min.ts',
  '30min': 'simulate-30min.ts',
  'housing': 'simulate-housing.ts',
  'housing:ticks': 'simulate-housing-ticks.ts',
  'family': 'simulate-family.ts',
  'social': 'simulate-social.ts',
  'militia': 'balance-militia.ts',
  '10year': 'simulate-10year.ts',
  '10year:worker': 'simulate-10year-worker.ts',
  '20year': 'simulate-20year.ts',
  '20year:worker': 'simulate-20year-worker.ts',
  'city': 'benchmark-city.ts',
};

/** Direct node scripts (not run-sim.mjs) */
const DIRECT = {
  '30min:city': 'run-city-30min.mjs',
  kill: 'kill-sims.mjs',
};

const ALIASES = {
  simulate: '5min',
  balance: 'militia',
};

function printHelp() {
  console.log(`Wilderfolk headless sims — npm run sim -- <profile>

Profiles (via run-sim.mjs):
  5min            ~5 min smoke (default)
  30min           long playtest (env SIM_MINUTES)
  housing         housing assignment soak
  housing:ticks   housing tick regression
  family          family / custody soak
  social          social / scandal soak
  militia         militia balance pass
  10year          10-year balance regression
  10year:worker   10-year (worker thread)
  20year          v0.5 ship gatekeeper (172800 ticks)
  20year:worker   20-year (worker thread)
  city            city benchmark profile

Other:
  30min:city      city 30-min harness
  kill            stop stuck sim (sim.lock)

Benchmark gate (CI): npm run bench

Aliases: simulate → 5min, balance → militia
`);
}

function runNode(scriptRel, extraArgs = []) {
  const script = join(appRoot, 'scripts', scriptRel);
  const result = spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: appRoot,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

function runSim(tsName) {
  const result = spawnSync(
    process.execPath,
    [join(appRoot, 'scripts', 'run-sim.mjs'), join('scripts', tsName)],
    { cwd: appRoot, stdio: 'inherit', env: process.env },
  );
  process.exit(result.status ?? 1);
}

const raw = process.argv[2];
if (!raw || raw === 'help' || raw === '--help' || raw === '-h' || raw === 'list') {
  printHelp();
  process.exit(0);
}

const profile = ALIASES[raw] ?? raw;
const ts = RUN_SIM[profile];
if (ts) {
  runSim(ts);
}

const direct = DIRECT[profile];
if (direct) {
  runNode(direct, process.argv.slice(3));
}

console.error(`Unknown sim profile: ${raw}\n`);
printHelp();
process.exit(1);