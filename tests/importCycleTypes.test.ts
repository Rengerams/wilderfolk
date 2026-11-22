import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/** The regular strict gate rejects runtime loops; this pins the type graph too. */
describe('import-cycle architecture', () => {
  it('keeps type-only and runtime dependency cycles empty', () => {
    const result = spawnSync(process.execPath, ['scripts/check-import-cycles.mjs', '--strict'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const report = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(result.status, report).toBe(0);
    expect(report).not.toContain('Type-only import cycles:');
    expect(report).not.toContain('Runtime import cycles:');
  });
});
