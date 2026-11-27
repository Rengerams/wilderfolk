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

});
