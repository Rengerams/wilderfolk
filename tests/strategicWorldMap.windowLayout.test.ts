import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Frontier world map window layout', () => {
  it('uses the same width and outer height budget as the battle report overlay', () => {
    const report = read('src/App.tsx');
    const window = read('src/components/CitizenOverviewScreen.tsx');

    expect(report).toContain('max-h-[92vh] w-full max-w-3xl');
    expect(window).toMatch(/widthClassName=\{activeNav === 'frontier'\s*\? 'w-\[calc\(100vw-2rem\)\] max-w-3xl'/);
    expect(window).toMatch(/maxBodyClassName=\{activeNav === 'frontier' \? 'max-h-\[calc\(92vh-4rem\)\]'/);
  });

  it('preserves the existing sizes of non-Frontier subject windows', () => {
    const window = read('src/components/CitizenOverviewScreen.tsx');

    expect(window).toContain("'w-[min(58rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)]'");
    expect(window).toContain(" : 'max-h-[70vh]'");
  });
});
