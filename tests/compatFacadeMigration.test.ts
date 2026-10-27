import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const SCRIPT = resolve(process.cwd(), 'scripts/migrate-compat-facades.mjs');
let fixtureRoot: string;

function put(relative: string, source: string): void {
  const file = join(fixtureRoot, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source, 'utf8');
}

function read(relative: string): string {
  return readFileSync(join(fixtureRoot, relative), 'utf8');
}

function run(...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: fixtureRoot, encoding: 'utf8' });
}

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'wilderfolk-facade-'));
  put('src/ownerA.ts', 'export const alpha = 1;\n');
  put('src/ownerB.ts', 'export type Beta = number;\n');
  put('src/facade.ts', "export { alpha } from './ownerA';\nexport type { Beta } from './ownerB';\n");
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('compatibility facade migration', () => {
  it('scans and dry-runs without modifying files', () => {
    put('src/view.ts', "import { alpha as current } from './facade';\n");
    const scan = run('--scan');
    expect(scan.status).toBe(0);
    expect(scan.stdout).toContain('src/facade.ts');

    const dryRun = run('src/facade.ts');
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain('callers: 1');
    expect(read('src/view.ts')).toContain("from './facade'");
    expect(existsSync(join(fixtureRoot, 'src/facade.ts'))).toBe(true);
  });

  it('migrates value, aliased, type-only and forwarding exports to their owners', () => {
    put('src/view.ts', "import { alpha as current, type Beta } from './facade';\n");
    put('src/reexport.ts', "export { alpha as visible } from './facade';\n");
    const result = run('src/facade.ts', '--apply');
    expect(result.status).toBe(0);
    expect(read('src/view.ts')).toContain("import { alpha as current } from './ownerA';");
    expect(read('src/view.ts')).toContain("import { type Beta } from './ownerB';");
    expect(read('src/reexport.ts')).toContain("export { alpha as visible } from './ownerA';");
    expect(existsSync(join(fixtureRoot, 'src/facade.ts'))).toBe(false);
  });

  it('rejects live implementations and unsupported namespace imports before writing', () => {
    put('src/view.ts', "import * as compatibility from './facade';\n");
    const unsupported = run('src/facade.ts', '--apply');
    expect(unsupported.status).toBe(1);
    expect(read('src/view.ts')).toContain("from './facade'");
    expect(existsSync(join(fixtureRoot, 'src/facade.ts'))).toBe(true);

    put('src/facade.ts', "export { alpha } from './ownerA';\nexport const ownLogic = 1;\n");
    const implemented = run('src/facade.ts', '--apply');
    expect(implemented.status).toBe(1);
    expect(read('src/facade.ts')).toContain('ownLogic');
  });
});
