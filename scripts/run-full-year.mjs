import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const vitestArgs = ['vitest', 'run', 'tests/fullYear.integration.test.ts', '--reporter=verbose'];

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, vitestArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    WILDERFOLK_DEBUG: debug ? '1' : '0',
  },
});

if (result.error) {
  console.error(`[full-year] Failed to start ${command}:`, result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
