import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ART_ROOT = '../public/sprites/oga_drummyfish/';
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function localAsset(name: string): Buffer {
  return readFileSync(fileURLToPath(new URL(ART_ROOT + name, import.meta.url)));
}

describe('local CC0 RPG paths, walls and gates', () => {
  it('ships the three real PNG assets (not remotely linked placeholders)', () => {
    for (const name of ['tile_pavement.png', 'wall.png', 'gate.png']) {
      const bytes = localAsset(name);
      expect(bytes.subarray(0, 8).equals(PNG_HEADER), name).toBe(true);
      expect(bytes.length, name).toBeGreaterThan(200);
    }
  });

  it('preloads the bundled art and renders it for every road junction', () => {
    const loader = readFileSync(fileURLToPath(new URL('../src/game/spriteLoader.ts', import.meta.url)), 'utf8');
    const renderer = readFileSync(fileURLToPath(new URL('../src/game/stripRender.ts', import.meta.url)), 'utf8');
    for (const name of ['tile_pavement.png', 'wall.png', 'gate.png']) {
      expect(loader).toContain(`/sprites/oga_drummyfish/${name}`);
      expect(renderer).toContain(`/sprites/oga_drummyfish/${name}`);
    }
    expect(renderer).toContain('paintRpgPavementPattern(ctx, -cap / 2, -cap / 2, cap, cap,');
    expect(renderer).toContain('rotation === 90 ? sy : sx');
    expect(renderer).toContain('paintRpgStoneStrip(ctx, sx, sy, w, h, rotation, isGate, alpha)');
    expect(renderer).not.toContain('https://opengameart.org/sites/default/files/');
  });
});
