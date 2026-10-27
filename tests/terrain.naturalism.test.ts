import { describe, expect, it } from 'vitest';
import { EntityType, MapPreset, MapSize, TerrainType } from '../src/game/gameTypes';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { tileTypeAt } from '../src/game/terrain/terrainGrid';
import { initGame } from '../src/game/worldGen';

describe('natural landscape generation revision 3', () => {
  it('preserves the drainage paths while improving the river-water footprint', () => {
    const args = [1280, 960, 1234, MapSize.Medium, MapPreset.Rivers] as const;
    const accepted = generateRawTerrain(...args, undefined, 2);
    const improved = generateRawTerrain(...args, undefined, 3);
    const repeated = generateRawTerrain(...args, undefined, 3);
    expect(improved.generationVersion).toBe(3);
    expect(improved.rivers.length).toBeGreaterThan(0);
    expect(improved.rivers).toEqual(accepted.rivers);
    expect(improved.riverDist).toEqual(repeated.riverDist);
    expect(improved.moisture).toEqual(repeated.moisture);

    let waterChanged = 0;
    let moistureChanged = 0;
    for (let i = 0; i < improved.riverDist!.length; i++) {
      if (improved.riverDist![i] !== accepted.riverDist![i]) waterChanged++;
    }
    for (let i = 0; i < improved.moisture!.length; i++) {
      if (improved.moisture![i] !== accepted.moisture![i]) moistureChanged++;
    }
    expect(waterChanged).toBeGreaterThan(0);
    expect(moistureChanged).toBeGreaterThan(0);
  }, 120_000);

  it('uses the canonical river classification for walking and scenery', () => {
    const map = generateRawTerrain(1280, 960, 1234, MapSize.Medium, MapPreset.Rivers);
    let waterTiles = 0;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const type = tileTypeAt(map, tx, ty);
        if (type !== TerrainType.River) continue;
        waterTiles++;
        expect(map.pathGrid![ty * map.pCols! + tx]).toBe(1);
      }
    }
    expect(waterTiles).toBeGreaterThan(0);
  }, 120_000);

  it('scatters reproducible harvestable tree groves without aquatic trees', () => {
    const first = initGame({ seed: 1234, preset: MapPreset.BlackForest, size: MapSize.Medium });
    const again = initGame({ seed: 1234, preset: MapPreset.BlackForest, size: MapSize.Medium });
    const trees = first.entities.filter((entity) => entity.type === EntityType.Tree && entity.alive);
    const other = again.entities.filter((entity) => entity.type === EntityType.Tree && entity.alive);
    expect(trees.length).toBeGreaterThan(50);
    expect(trees.map(({ x, y, spriteVariant }) => [x, y, spriteVariant]))
      .toEqual(other.map(({ x, y, spriteVariant }) => [x, y, spriteVariant]));
    expect(trees.some((tree) => tree.spriteVariant === 1)).toBe(true);
    expect(trees.some((tree) => tree.spriteVariant === 0)).toBe(true);
    for (const tree of trees) {
      const type = tileTypeAt(first.worldMap!, Math.floor(tree.x / 10), Math.floor(tree.y / 10));
      expect([TerrainType.DeepWater, TerrainType.ShallowWater, TerrainType.River]).not.toContain(type);
    }
  }, 120_000);
});
