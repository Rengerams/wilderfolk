import { HUMAN_BASE_SPRITES, JUVENILE_SPRITE_PATHS, WALK_SHEET_PATHS } from '../src/game/humanSprites';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import path from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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

describe('sprite asset manifests and preload coverage', () => {
  const PUBLIC_DIR = path.resolve(import.meta.dirname, '../public');
  const SRC_DIR = path.resolve(import.meta.dirname, '../src');

  function publicPath(sprite: string): string {
    return path.join(PUBLIC_DIR, sprite.replace(/^\//, ''));
  }

  /** Every non-declaration source file, minus the loader whose manifest is under test. */
  function sourceTexts(): { file: string; text: string }[] {
    const out: { file: string; text: string }[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry) || entry.endsWith('.d.ts')) continue;
        if (full.endsWith(`spriteLoader.ts`)) continue;
        out.push({ file: path.relative(SRC_DIR, full), text: readFileSync(full, 'utf8') });
      }
    };
    walk(SRC_DIR);
    return out;
  }

  describe('F-RND-16 — every declared building sprite exists on disk', () => {
    it('points at no missing file, and decor declares none at all', () => {
      const missing: string[] = [];
      const decorWithSprite: string[] = [];
      for (const [type, config] of Object.entries(BUILDING_CONFIGS)) {
        if (!config.sprite) {
          if (!config.decor) decorWithSprite.push(`${type} has no sprite but is not decor`);
          continue;
        }
        if (config.decor) decorWithSprite.push(`${type} is procedural decor but declares ${config.sprite}`);
        if (!existsSync(publicPath(config.sprite))) missing.push(`${type}: ${config.sprite}`);
      }
      expect(missing).toEqual([]);
      expect(decorWithSprite).toEqual([]);
    });
  });

  /** Boot preload records every URL it asks `Image` for. */
  const requested: string[] = [];
  const realImage = (globalThis as { Image?: unknown }).Image;

  beforeAll(async () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 64;
      height = 64;
      set src(value: string) {
        requested.push(value);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const { preloadAllSprites } = await import('../src/game/spriteLoader');
    try {
      await preloadAllSprites();
    } finally {
      vi.stubGlobal('Image', realImage);
    }
  });

  describe('F-RND-29 — the preload manifest and the fills the bake stamps agree', () => {
    it('loads every fill the legacy bake names, and asks for nothing with no file', () => {
      expect(requested.length).toBeGreaterThan(0);

      const missing = requested.filter((url) => !existsSync(publicPath(url)));
      expect(missing).toEqual([]);

      // `terrainFillSpritesReady` is exactly "every path in the bake's fill table is loaded"; it could
      // never be true while the fills the table names were absent from this list.
      return import('../src/game/terrainLayer').then(({ terrainFillSpritesReady }) => {
        expect(terrainFillSpritesReady()).toBe(true);
      });
    });

    it('preloads no sprite that no source file draws', () => {
      const sources = sourceTexts();
      const orphans = requested.filter((url) => !sources.some((entry) => entry.text.includes(url)));
      expect(orphans).toEqual([]);
    });

    it('registers exactly the human sprite paths the ladder constants declare', () => {
      return import('../src/game/spriteLoader').then(({ HUMAN_SPRITE_PATHS }) => {
        const declared = [
          ...Object.values(HUMAN_BASE_SPRITES),
          ...Object.values(WALK_SHEET_PATHS).flatMap((paths) => [...paths]),
          ...Object.values(JUVENILE_SPRITE_PATHS).flatMap((paths) => [...paths]),
        ];
        expect([...HUMAN_SPRITE_PATHS].sort()).toEqual(declared.sort());
      });
    });
  });
});
