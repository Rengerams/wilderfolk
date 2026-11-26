#!/usr/bin/env node
/** Run the real audit; a parser allocation failure must not look like a clean result. */
import { spawnSync } from 'node:child_process';

const result = spawnSync('knip', process.argv.slice(2), {
  cwd: process.cwd(),
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
if (result.error || result.signal || result.status === null) {
  console.error('Knip did not complete:', result.error?.message ?? result.signal ?? 'unknown failure');
  process.exitCode = 2;
} else {
  process.exitCode = result.status;
}
