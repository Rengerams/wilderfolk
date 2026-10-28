import { describe, expect, it } from 'vitest';
import { TerrainType } from '../src/game/gameTypes';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { TERRAIN_CELL, WATER_CELL } from '../src/game/terrain/terrainGrid';
import { sampleEcotone, treeEcotoneAt } from '../src/game/terrain/ecotones';

describe('v4 continuous biome fringes', () => {
  it('fades open grass into dense woodland smoothly without a per-label jump', () => {
    const map = testWorldMap({ tilesX: 48, tilesY: 48 });
    map.generationVersion = 4;
    map.moistureForestThreshold = 0.6;
    map.moistureDarkForestThreshold = 0.78;
    map.temperature!.fill(0.64);
    map.elevation!.fill(0.4);
    for (let cy = 0; cy < map.rows!; cy++)
      for (let cx = 0; cx < map.cols!; cx++)
        map.moisture![cy * map.cols! + cx] = 0.38 + cx * 0.015;

    const sample = (x: number) => treeEcotoneAt(map, x, 100, TerrainType.Grassland);
    const values = Array.from({ length: 20 }, (_, i) => sample(40 + i * TERRAIN_CELL).density);
    expect(values[0]).toBeLessThan(values[values.length - 1]);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] - 1e-6);
      expect(values[i] - values[i - 1]).toBeLessThan(0.09);
    }
    const x = 188;
    expect(treeEcotoneAt(map, x, 100, TerrainType.Grassland).density)
      .toBeCloseTo(treeEcotoneAt(map, x, 100, TerrainType.Forest).density, 10);
    expect(sampleEcotone(map, x, 100).forest).toBeGreaterThan(0);
  });

  it('keeps trees off open water and alpine cliffs and adds riparian moisture gradually', () => {
    const map = testWorldMap({ tilesX: 48, tilesY: 48 });
    map.generationVersion = 4;
    map.moistureForestThreshold = 0.6;
    map.moistureDarkForestThreshold = 0.78;
    map.moisture!.fill(0.7);
    map.temperature!.fill(0.7);
    map.elevation!.fill(0.35);
    expect(treeEcotoneAt(map, 150, 150, TerrainType.River).density).toBe(0);
    const low = treeEcotoneAt(map, 150, 150, TerrainType.Grassland).density;
    map.elevation!.fill(0.94);
    const high = treeEcotoneAt(map, 150, 150, TerrainType.Grassland).density;
    expect(high).toBeLessThan(low);

    map.elevation!.fill(0.35);
    map.riverDist!.fill(0);
    const dryBank = sampleEcotone(map, 150, 150).riparian;
    const wx = Math.floor(150 / WATER_CELL), wy = Math.floor(150 / WATER_CELL);
    const wc = map.waterCols ?? map.cols!;
    map.riverDist![wy * wc + wx] = 0.48;
    expect(sampleEcotone(map, 150, 150).riparian).toBeGreaterThan(dryBank);
  });
});
