/**
 * Run multiple headless sim profiles in parallel — one process per job, up to SIM_PARALLEL cores.
 *
 * Usage:
 *   npm run sim:parallel -- 5min housing family
 *   SIM_PARALLEL=4 npm run sim:parallel -- 5min social militia
 *   SIM_USE_WORKER=1 npm run sim:parallel -- 10year:worker
 *
 * Each job sets SIM_FORCE=1 (bypasses sim.lock). One timeline still uses ~1 core; this uses
 * many cores when you run several profiles or repeated smoke runs at once.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfile } from './sim-profiles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const runSim = join(appRoot, 'scripts', 'run-sim.mjs');
const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (args.length === 0) {
  console.error('Usage: npm run sim:parallel -- <profile> [profile ...]');
  console.error('Example: npm run sim:parallel -- 5min housing family social');
  console.error(`SIM_PARALLEL (default ${cpus().length}) caps concurrent jobs.`);
  process.exit(1);
}

const jobs = [];
for (const raw of args) {
  const resolved = resolveProfile(raw);
  if (!resolved) {
    console.error(`Unknown profile: ${raw}`);
    process.exit(1);
  }
  if (!resolved.viaRunSim) {
    console.error(`Profile "${raw}" is not supported in parallel mode (use sim-cli directly).`);
    process.exit(1);
  }
  jobs.push(resolved);
}

const maxParallel = Math.max(1, Number(process.env.SIM_PARALLEL) || cpus().length);
console.log(`[sim-parallel] ${jobs.length} job(s), up to ${maxParallel} at a time (${cpus().length} CPU cores detected)`);
if (process.env.SIM_USE_WORKER === '1') {
  console.log('[sim-parallel] SIM_USE_WORKER=1 — each job uses worker_threads for ticks (live-game path)');
}

function runJob(job) {
  return new Promise((resolveJob) => {
    const scriptPath = join('scripts', job.ts);
    const label = `[${job.profile}]`;
    const started = Date.now();
    console.log(`${label} starting → ${job.ts}`);

    const child = spawn(process.execPath, [runSim, scriptPath], {
      cwd: appRoot,
      stdio: 'inherit',
      env: { ...process.env, SIM_FORCE: '1' },
    });

    child.on('exit', (code, signal) => {
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      resolveJob({
        profile: job.profile,
        code: code ?? (signal ? 1 : 0),
        seconds: sec,
      });
    });
  });
}

async function runPool(queue, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < queue.length) {
      const i = index++;
      results[i] = await runJob(queue[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
  return results;
}

const results = await runPool(jobs, maxParallel);

console.log('\n[sim-parallel] Summary');
let failed = 0;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${r.profile} — exit ${r.code} (${r.seconds}s)`);
}

process.exit(failed > 0 ? 1 : 0);