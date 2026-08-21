/**
 * Rivers must form from mountain peaks and carve real water tiles.
 * Regression: the raw per-tile elevation noise is so spiky that the old greedy
 * descent hit a local minimum within 1–2 tiles — rivers never formed, and even
 * when traced, the downhill walk never dropped below the strict River threshold
 * (elevation < waterLevel * 0.75), so `map.rivers` was always empty and every
 * preset rendered with almost no visible water. Rivers now follow a smoothed
 * elevation gradient (with a basin-bypass fallback) and carve their channel
 * into `TerrainType.River` regardless of elevation.
 */
import { describe, expect, it } from 'vitest';
import { generateWorldMap } from '../src/game/terrainGen';
import { MapPreset, MapSize, TerrainType, type WorldMap } from '../src/game/gameTypes';

function countType(map: WorldMap, type: TerrainType): number {
  let n = 0;
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.type === type) n++;
    }
  }
  return n;
}

describe('generateWorldMap rivers', () => {
  it('forms rivers on land presets (rivers list is not empty)', () => {
    for (const preset of [MapPreset.Verdant, MapPreset.Mountainous, MapPreset.Arid, MapPreset.Harsh]) {
      const map = generateWorldMap(MapSize.Medium, preset, 1234);
      expect(map.rivers.length, `${preset}: expected ≥1 river`).toBeGreaterThan(0);
    }
  });

  it('carves traced channels into River tiles on land presets', () => {
    for (const preset of [MapPreset.Verdant, MapPreset.Mountainous, MapPreset.Arid, MapPreset.Harsh]) {
      const map = generateWorldMap(MapSize.Medium, preset, 1234);
      const riverTiles = countType(map, TerrainType.River);
      expect(riverTiles, `${preset}: expected carved River tiles`).toBeGreaterThan(0);
    }
  });

  it('keeps the mountain-top source cell as land (channel starts below the peak)', () => {
    const map = generateWorldMap(MapSize.Medium, MapPreset.Verdant, 1234);
    expect(map.rivers.length).toBeGreaterThan(0);
    for (const river of map.rivers) {
      const source = river[0];
      const tx = Math.floor(source.x / 10);
      const ty = Math.floor(source.y / 10);
      expect(map.tiles[ty][tx].type).not.toBe(TerrainType.River);
    }
  });

  it('carves one broad, banked river that crosses every map row', () => {
    for (const preset of Object.values(MapPreset)) {
      const map = generateWorldMap(MapSize.Medium, preset, 1234);
      let banks = 0;
      for (let ty = 0; ty < map.height; ty++) {
        const riverWidth = map.tiles[ty].filter((tile) => tile.type === TerrainType.River).length;
        expect(riverWidth, `${preset}: row ${ty} has no continuous river`).toBeGreaterThan(0);
        if (ty > 2 && ty < map.height - 3) {
          expect(riverWidth, `${preset}: row ${ty} river is too narrow to read`).toBeGreaterThanOrEqual(3);
        }
        banks += map.tiles[ty].filter((tile) => tile.type === TerrainType.RiverBank).length;
      }
      expect(banks, `${preset}: expected explicit river banks`).toBeGreaterThan(0);
    }
  });

  it('does not regress river generation across seeds', () => {
    for (const seed of [99, 777, 2026]) {
      const map = generateWorldMap(MapSize.Medium, MapPreset.Verdant, seed);
      expect(map.rivers.length, `seed=${seed}: expected ≥1 river`).toBeGreaterThan(0);
    }
  });
});
