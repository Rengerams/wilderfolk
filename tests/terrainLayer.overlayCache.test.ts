import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerrainType, type WorldMap } from '../src/game/gameTypes';

const loadedSprites = new Set<string>();

vi.mock('../src/game/spriteLoader', () => ({
  getSprite: (path: string) => (loadedSprites.has(path) ? {} : null),
}));

import {
  terrainLayerNeedsRebuild,
  type TerrainLayerCache,
} from '../src/game/terrainLayer';
import {
  SAND_WATER_OVERLAY_PATH,
  TERRAIN_MATERIAL_ATLAS_REVISION,
} from '../src/game/terrainAtlas';

const map = {
  width: 3,
  height: 3,
  seed: 19,
  preset: 'verdant',
  tiles: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({
    type: TerrainType.Grassland,
    elevation: 40,
    moisture: 50,
    variation: 0.5,
  }))),
} as unknown as WorldMap;

function readyCache(): TerrainLayerCache {
  return {
    surface: {} as TerrainLayerCache['surface'],
    ctx: {} as TerrainLayerCache['ctx'],
    width: 1600,
    height: 1200,
    worldWidth: 1600,
    worldHeight: 1200,
    seed: map.seed,
    preset: map.preset,
    season: 'spring',
    lod: 1,
    fills: true,
    atlas: true,
    materialAtlasRevision: 0,
  };
}

describe('terrain overlay cache readiness', () => {
  beforeEach(() => {
    loadedSprites.clear();
  });

  it('requests one replacement bake when the overlay becomes ready', () => {
    const cache = readyCache();
    expect(terrainLayerNeedsRebuild(cache, map, 'spring', 1600, 1200)).toBe(false);

    loadedSprites.add(SAND_WATER_OVERLAY_PATH);
    expect(terrainLayerNeedsRebuild(cache, map, 'spring', 1600, 1200)).toBe(true);
  });

  it('keeps the same cache valid after the overlay revision is baked', () => {
    const cache = readyCache();
    cache.materialAtlasRevision = TERRAIN_MATERIAL_ATLAS_REVISION;
    loadedSprites.add(SAND_WATER_OVERLAY_PATH);

    expect(terrainLayerNeedsRebuild(cache, map, 'spring', 1600, 1200)).toBe(false);
  });
});
