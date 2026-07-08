import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const result = spawnSync(
  process.execPath,
  [join(appRoot, 'scripts', 'run-sim.mjs'), 'scripts/simulate-30min.ts'],
  {
    cwd: appRoot,
    stdio: 'inherit',
    env: { ...process.env, SIM_PROFILE: 'city' },
  },
);
process.exit(result.status ?? 1);