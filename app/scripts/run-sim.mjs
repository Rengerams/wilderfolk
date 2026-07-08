/**
 * Run headless sims with a valid Node 25+ localStorage file (avoids startup warning).
 * tsx spawns a child Node process — NODE_OPTIONS must include --localstorage-file.
 *
 * Usage: node scripts/run-sim.mjs scripts/simulate-30min.ts
 *
 * Env:
 *   SIM_TIMEOUT_MS  — hard kill after this many ms (default per script, else 15 min)
 *   SIM_FORCE       — 1 = ignore an existing sim.lock and start anyway
 *   SIM_FULL_SIM    — 1 = simulate every entity every tick (slow; default uses viewport focus)
 *   SIM_ZOOM        — camera zoom for headless focus (default: map-aware ~1.5 on Large maps)
 *   SIM_USE_WORKER  — 1 = worker_threads per tick (live-game path); 0 = main-thread (faster for 10/20year)
 *   SIM_PARALLEL    — max concurrent jobs for npm run sim:parallel (default: CPU count)
 *   SIM_BUILD_DENY    — skip auto-build types (preset defense, security, economy, …)
 *   SIM_BUILD_ALLOW   — whitelist auto-build types/presets only
 *   SIM_BUILD_DEFENSE — 0 = no walls/barracks/watchtowers
 *   SIM_LOG_LIFE    — 1 = stream pregnancies/births/deaths live to -life.txt (default 1)
 *   SIM_LIFE_LOG_FILE — custom life-events log path
 *
 * If a sim hangs, stop it: npm run sim:kill
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const cacheDir = join(appRoot, 'node_modules', '.cache');
const storageFile = resolve(cacheDir, 'wilderfolk-sim-localstorage.json');
const lockFile = join(cacheDir, 'sim.lock');
const tsxCli = join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const script = process.argv[2];

/** Default wall-clock caps — sims exit or are killed when exceeded. */
const DEFAULT_TIMEOUT_MS = {
  'simulate-5min.ts': 8 * 60 * 1000,
  'simulate-30min.ts': 20 * 60 * 1000,
  'simulate-family.ts': 10 * 60 * 1000,
  'simulate-social.ts': 8 * 60 * 1000,
  'simulate-housing.ts': 5 * 60 * 1000,
  'simulate-housing-ticks.ts': 8 * 60 * 1000,
  'balance-militia.ts': 10 * 60 * 1000,
  'simulate-10year.ts': 4 * 60 * 60 * 1000,
  'simulate-10year-worker.ts': 8 * 60 * 60 * 1000,
  'simulate-20year.ts': 8 * 60 * 60 * 1000,
  'simulate-20year-worker.ts': 8 * 60 * 60 * 1000,
};

/** Balance sims default to main-thread ticks (fast). Worker path is opt-in via *-worker scripts. */
const MAIN_THREAD_BALANCE_SIMS = new Set([
  'simulate-10year.ts',
  'simulate-20year.ts',
]);

const EXIT_TIMEOUT = 124;
const EXIT_LOCKED = 2;

if (!script) {
  console.error('Usage: node scripts/run-sim.mjs <script.ts>');
  process.exit(1);
}

mkdirSync(cacheDir, { recursive: true });
if (!existsSync(storageFile)) {
  writeFileSync(storageFile, '{}', 'utf8');
}

function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock() {
  try {
    return JSON.parse(readFileSync(lockFile, 'utf8'));
  } catch {
    return null;
  }
}

function releaseLock() {
  try {
    if (existsSync(lockFile)) unlinkSync(lockFile);
  } catch {
    /* ignore */
  }
}

function acquireLock(scriptName) {
  if (process.env.SIM_FORCE === '1') {
    releaseLock();
    return;
  }
  const existing = readLock();
  if (existing?.wrapperPid && isProcessAlive(existing.wrapperPid)) {
    const started = existing.started ? new Date(existing.started).toISOString() : 'unknown';
    console.error(`Another simulation is already running.`);
    console.error(`  script: ${existing.script ?? '?'}`);
    console.error(`  pid:    ${existing.wrapperPid}`);
    console.error(`  since:  ${started}`);
    console.error(`Stop it with: npm run sim:kill`);
    console.error(`Or override:  SIM_FORCE=1 npm run simulate`);
    process.exit(EXIT_LOCKED);
  }
  if (existing) releaseLock();
  writeFileSync(
    lockFile,
    JSON.stringify(
      {
        wrapperPid: process.pid,
        childPid: null,
        script: scriptName,
        started: Date.now(),
      },
      null,
      2,
    ),
    'utf8',
  );
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* already dead */
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* ignore */
    }
  }
}

const scriptBase = basename(script);
const timeoutMs = Number(process.env.SIM_TIMEOUT_MS)
  || DEFAULT_TIMEOUT_MS[scriptBase]
  || 15 * 60 * 1000;

const storageFlag = `--localstorage-file=${storageFile}`;
const prior = process.env.NODE_OPTIONS?.trim();
const nodeOptions = prior?.includes('--localstorage-file')
  ? prior
  : prior
    ? `${storageFlag} ${prior}`
    : storageFlag;

acquireLock(scriptBase);

let timedOut = false;
let child = null;

const onSignal = (signal) => {
  releaseLock();
  if (child?.pid) killProcessTree(child.pid);
  process.exit(signal === 'SIGINT' ? 130 : 143);
};

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

const simEnv = { ...process.env, NODE_OPTIONS: nodeOptions };
if (MAIN_THREAD_BALANCE_SIMS.has(scriptBase) && simEnv.SIM_USE_WORKER === undefined) {
  simEnv.SIM_USE_WORKER = '0';
}

child = spawn(process.execPath, [tsxCli, script], {
  cwd: appRoot,
  stdio: 'inherit',
  env: simEnv,
});

try {
  const lock = readLock() ?? {};
  lock.childPid = child.pid;
  writeFileSync(lockFile, JSON.stringify(lock, null, 2), 'utf8');
} catch {
  /* ignore */
}

const timer = setTimeout(() => {
  timedOut = true;
  console.error(`\n[run-sim] Timed out after ${Math.round(timeoutMs / 1000)}s — killing process tree (pid ${child.pid})`);
  console.error(`[run-sim] Raise limit with SIM_TIMEOUT_MS=${timeoutMs * 2} if this sim needs longer.`);
  killProcessTree(child.pid);
}, timeoutMs);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  releaseLock();
  if (timedOut) {
    process.exit(EXIT_TIMEOUT);
  }
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  clearTimeout(timer);
  releaseLock();
  console.error('[run-sim] Failed to start simulation:', err.message);
  process.exit(1);
});