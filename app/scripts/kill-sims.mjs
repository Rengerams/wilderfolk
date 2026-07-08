/**
 * Stop orphaned Wilderfolk simulation processes and clear sim.lock.
 * Usage: npm run sim:kill
 */
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const lockFile = join(appRoot, 'node_modules', '.cache', 'sim.lock');

const patterns = [
  'run-sim\\.mjs',
  'simulate-10year',
  'simulate-20year',
  'simulate-social',
  'simulate-30min',
  'simulate-5min',
  'simulate-family',
  'balance-militia',
  'wilderfolk-sim-localstorage',
];

function listMatchingProcesses() {
  if (process.platform !== 'win32') {
    try {
      const out = execSync('ps -ax -o pid=,command=', { encoding: 'utf8' });
      return out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const m = line.match(/^(\d+)\s+(.*)$/);
          return m ? { pid: Number(m[1]), cmd: m[2] } : null;
        })
        .filter(Boolean)
        .filter(({ cmd }) => patterns.some((p) => new RegExp(p, 'i').test(cmd)));
    } catch {
      return [];
    }
  }

  const escaped = appRoot.replace(/\\/g, '\\\\');
  const ps = `
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.CommandLine -and (
          $_.CommandLine -match '${escaped}' -or
          $_.CommandLine -match 'run-sim\\.mjs' -or
          $_.CommandLine -match 'simulate-' -or
          $_.CommandLine -match 'wilderfolk-sim-localstorage'
        )
      } |
      Select-Object ProcessId, CommandLine |
      ConvertTo-Json -Compress
  `;
  try {
    const raw = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((r) => ({ pid: Number(r.ProcessId), cmd: r.CommandLine ?? '' }));
  } catch {
    return [];
  }
}

function killTree(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return true;
  } catch {
    return false;
  }
}

const targets = listMatchingProcesses().filter((p) => p.pid !== process.pid);
const killed = [];

for (const { pid, cmd } of targets) {
  if (killTree(pid)) {
    const short = cmd.length > 90 ? `${cmd.slice(0, 90)}…` : cmd;
    killed.push(`${pid} ${short}`);
  }
}

if (existsSync(lockFile)) {
  try {
    unlinkSync(lockFile);
    killed.push('lock cleared');
  } catch {
    /* ignore */
  }
}

if (killed.length === 0) {
  console.log('No Wilderfolk simulation processes found.');
} else {
  console.log(`Stopped ${killed.length} item(s):`);
  for (const line of killed) console.log(`  • ${line}`);
}