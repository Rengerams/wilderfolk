/**
 * CI perf gate — city dual-layer spatial grid benchmarks.
 * Usage: node scripts/benchmark-gate.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const runSim = join(appRoot, 'scripts', 'run-sim.mjs');

function run(script, extraEnv = {}) {
  const result = spawnSync(process.execPath, [runSim, script], {
    cwd: appRoot,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('scripts/benchmark-city.ts');
run('scripts/simulate-30min.ts', { SIM_PROFILE: 'city', BENCHMARK_GATE: '1' });