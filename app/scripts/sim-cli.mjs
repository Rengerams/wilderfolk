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
import { resolveProfile } from './sim-profiles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');

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

Multicore:
  sim:parallel      run several profiles at once (uses all CPU cores)
  10year:worker     single long sim on worker_threads (matches live game)
  SIM_USE_WORKER=1  force worker-thread ticks on any profile

Build policy (10year / 20year auto-build):
  SIM_BUILD_DEFENSE=0 npm run sim -- 10year
  SIM_BUILD_DENY=defense,security npm run sim -- 10year
  SIM_BUILD_ALLOW=economy,housing npm run sim -- 10year

Examples:
  npm run sim:parallel -- 5min housing family
  SIM_PARALLEL=4 npm run sim:parallel -- 5min social militia
  npm run sim -- 10year:worker

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

const resolved = resolveProfile(raw);
if (resolved?.viaRunSim) {
  runSim(resolved.ts);
}
if (resolved && !resolved.viaRunSim) {
  runNode(resolved.ts, process.argv.slice(3));
}

console.error(`Unknown sim profile: ${raw}\n`);
printHelp();
process.exit(1);