import { describe, expect, it } from 'vitest';
import { MAP_SIZE_DIMENSIONS, MapPreset, MapSize, Season } from '@/game/gameTypes';
import { generateWorldMap } from '@/game/terrainGen';
import {
  bakeTerrainDecor,
  bakeTerrainLayer,
  terrainDecorNeedsRebuild,
  terrainLayerNeedsRebuild,
} from '@/game/terrainLayer';

describe('terrainLayer offscreen bake', () => {
  it('rebuilds tile layer when season changes', () => {
    const map = generateWorldMap(MapSize.Small, MapPreset.Verdant, 42);
    const summer = bakeTerrainLayer(map, Season.Summer, () => '#336633');
    expect(terrainLayerNeedsRebuild(summer, map, Season.Summer)).toBe(false);
    expect(terrainLayerNeedsRebuild(summer, map, Season.Winter)).toBe(true);
  });

  it('bakes decor at world resolution with stable invalidation', () => {
    const map = generateWorldMap(MapSize.Small, MapPreset.Coastal, 7);
    const worldW = MAP_SIZE_DIMENSIONS[MapSize.Small].width;
    const worldH = MAP_SIZE_DIMENSIONS[MapSize.Small].height;
    const decor = bakeTerrainDecor(map, worldW, worldH);
    expect(decor.width).toBe(worldW);
    expect(decor.height).toBe(worldH);
    expect(terrainDecorNeedsRebuild(decor, map, worldW, worldH)).toBe(false);
    expect(terrainDecorNeedsRebuild(decor, map, worldW + 10, worldH)).toBe(true);
  });
});