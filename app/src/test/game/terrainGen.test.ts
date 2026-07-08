import { describe, expect, it } from 'vitest';
import { TerrainType, MapPreset, MAP_SIZE_DIMENSIONS, MapSize } from '@/game/gameTypes';
import { generateWorldMap } from '@/game/terrainGen';

function countTerrain(map: ReturnType<typeof generateWorldMap>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of map.tiles) {
    for (const tile of row) {
      counts[tile.type] = (counts[tile.type] ?? 0) + 1;
    }
  }
  return counts;
}

describe('generateWorldMap', () => {
  it('stores width/height as tile counts aligned with the tiles grid', () => {
    const map = generateWorldMap(MapSize.Medium, MapPreset.Coastal, 42_001);
    const pixel = MAP_SIZE_DIMENSIONS[MapSize.Medium];
    expect(map.width).toBe(Math.ceil(pixel.width / 10));
    expect(map.height).toBe(Math.ceil(pixel.height / 10));
    expect(map.tiles.length).toBe(map.height);
    expect(map.tiles[0]?.length).toBe(map.width);
  });

  it('produces visibly different terrain mixes per preset with the same seed', () => {
    const seed = 99_001;
    const verdant = countTerrain(generateWorldMap(MapSize.Medium, MapPreset.Verdant, seed));
    const arid = countTerrain(generateWorldMap(MapSize.Medium, MapPreset.Arid, seed));
    const coastal = countTerrain(generateWorldMap(MapSize.Medium, MapPreset.Coastal, seed));

    expect(verdant[TerrainType.Forest] ?? 0).toBeGreaterThan(arid[TerrainType.Forest] ?? 0);
    expect(coastal[TerrainType.ShallowWater] ?? 0).toBeGreaterThan(verdant[TerrainType.ShallowWater] ?? 0);
    expect(coastal[TerrainType.DeepWater] ?? 0).toBeGreaterThan(verdant[TerrainType.DeepWater] ?? 0);
  });
});