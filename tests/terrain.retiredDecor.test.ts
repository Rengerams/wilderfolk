import { describe, expect, it } from 'vitest';
import { MapPreset, MapSize, type TerrainDecoration } from '../src/game/gameTypes';
import { RETIRED_V4_DECOR_TYPES } from '../src/game/terrain/biomes';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { bakeDecorInRect } from '../src/game/renderer/decor';
import { testWorldMap } from '../src/test/worldMapFixtures';

const retired = [
  'mushroom', 'bones', 'lilypad', 'flower', 'fern',
  'reed', 'cattail', 'scrub', 'berries',
] as const;

describe('retired ground decorations (new worlds only)', () => {
  it('keeps one explicit list of the nine unwanted types', () => {
    expect([...RETIRED_V4_DECOR_TYPES].sort()).toEqual([...retired].sort());
    // Actual harvestable berry trees are entities, not the decorative "berries" sprite.
    expect(RETIRED_V4_DECOR_TYPES.has('fruit_tree')).toBe(false);
    expect(RETIRED_V4_DECOR_TYPES.has('bush')).toBe(false);
    expect(RETIRED_V4_DECOR_TYPES.has('tallgrass')).toBe(false);
  });

  it('never generates a retired prop in v4, with surviving art in every sampled biome', () => {
    for (const preset of [MapPreset.Arabia, MapPreset.BlackForest, MapPreset.Rivers, MapPreset.Highland]) {
      const map = generateRawTerrain(1280, 960, 1234, MapSize.Medium, preset, undefined, 4);
      const props = map.decorations ?? [];
      expect(props.length, `${preset}: landscape lost all ground art`).toBeGreaterThan(5);
      expect(props.filter((d) => RETIRED_V4_DECOR_TYPES.has(d.type)),
        `${preset}: removed decor generated`).toEqual([]);
    }
  }, 120_000);

  it('leaves the historical v3 recipe intact for compact saves', () => {
    const old = generateRawTerrain(1280, 960, 1234, MapSize.Medium, MapPreset.BlackForest, undefined, 3);
    const hasLegacyProps = (old.decorations ?? []).some((d) => RETIRED_V4_DECOR_TYPES.has(d.type));
    expect(hasLegacyProps).toBe(true);
  }, 120_000);

  it('hides retired props in an already-saved v4 world without touching its map data', () => {
    const map = testWorldMap({ tilesX: 20, tilesY: 20 });
    map.generationVersion = 4;
    map.decorations = retired.map((type, i): TerrainDecoration => ({
      x: 12 + i * 10,
      y: 22 + i * 10,
      type, scale: 1, variant: 0, flipX: false,
    }));
    const calls: string[] = [];
    // If the renderer tries to draw an excluded type, it invokes save().
    const ctx = { save() { calls.push('save'); } } as unknown as CanvasRenderingContext2D;
    const baked = bakeDecorInRect(ctx, map, { x: 0, y: 0, width: 200, height: 200 }, 1);
    expect(baked).toBe(0);
    expect(calls).toEqual([]);
    expect(map.decorations).toHaveLength(9);
  });
});
