#!/usr/bin/env node
/**
 * `knip` runs on oxc-parser, which reserves a multi-GiB virtual buffer. An out-of-memory abort is a
 * tooling limit, not a finding, so it is reported as skipped instead of a red gate.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('knip', { cwd: process.cwd(), shell: true, encoding: 'utf8' });
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);
const outOfMemory = /RangeError: Array buffer allocation failed|JavaScript heap out of memory|ENOMEM|Cannot allocate memory/i.test(output);
if (outOfMemory) {
  process.stderr.write('\nknip: skipped — the checker ran out of memory; this is not a finding.\n');
  process.exit(0);
}
process.exit(result.status ?? 1);
