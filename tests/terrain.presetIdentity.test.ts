import { describe, expect, it } from 'vitest';
import { MapPreset, MapSize, MAP_SIZE_DIMENSIONS, TerrainType, type WorldMap } from '../src/game/gameTypes';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { generateWorldMap, isFootprintBuildable } from '../src/game/terrainGen';
import { tileTypeAt } from '../src/game/terrain/terrainGrid';

const SEEDS = [1234, 98765];

function make(preset: MapPreset, seed: number): WorldMap {
  const dims = MAP_SIZE_DIMENSIONS[MapSize.Medium];
  return generateRawTerrain(dims.width, dims.height, seed, MapSize.Medium, preset);
}

function terrainShare(map: WorldMap, kinds: readonly TerrainType[]): number {
  let count = 0;
  let total = 0;
  for (let ty = 0; ty < map.height; ty += 8) {
    for (let tx = 0; tx < map.width; tx += 8) {
      if (kinds.includes(tileTypeAt(map, tx, ty)!)) count++;
      total++;
    }
  }
  return count / total;
}

function waterShare(map: WorldMap): number {
  return terrainShare(map, [TerrainType.DeepWater, TerrainType.ShallowWater]);
}

describe('new-game preset landscape contracts', () => {
  it('makes each named landscape visible across two deterministic seeds', () => {
    for (const seed of SEEDS) {
      const maps = new Map<MapPreset, WorldMap>();
      for (const preset of Object.values(MapPreset)) {
        const map = make(preset, seed);
        expect(map.generationVersion).toBe(4);
        maps.set(preset, map);
      }
      const get = (preset: MapPreset) => maps.get(preset)!;
      const woodland = [TerrainType.Forest, TerrainType.DarkForest];
      const mountains = [TerrainType.Hills, TerrainType.Rocky, TerrainType.Mountains];
      expect(terrainShare(get(MapPreset.BlackForest), woodland))
        .toBeGreaterThan(terrainShare(get(MapPreset.Arabia), woodland) + 0.20);
      expect(terrainShare(get(MapPreset.Arabia), [TerrainType.Desert])).toBeGreaterThan(0.25);
      expect(terrainShare(get(MapPreset.Oasis), [TerrainType.Desert])).toBeGreaterThan(0.25);
      expect(terrainShare(get(MapPreset.Highland), mountains))
        .toBeGreaterThan(terrainShare(get(MapPreset.Meadows), mountains) + 0.08);
      expect(waterShare(get(MapPreset.Islands))).toBeGreaterThan(0.30);
      expect(waterShare(get(MapPreset.Islands))).toBeLessThan(0.90);
      expect(get(MapPreset.Rivers).rivers.length).toBeGreaterThan(get(MapPreset.Oasis).rivers.length);
      expect(waterShare(get(MapPreset.Continental))).toBeGreaterThan(0.02);

      const oasis = get(MapPreset.Oasis);
      const center = Math.floor(oasis.rows! / 2) * oasis.cols! + Math.floor(oasis.cols! / 2);
      expect(oasis.elevation![center], 'Oasis has a central spring').toBeLessThan(oasis.seaLevel!);
      const coast = get(MapPreset.Coastal);
      for (const row of [0.2, 0.5, 0.8]) {
        const idx = Math.floor(row * (coast.rows! - 1)) * coast.cols! + 2;
        expect(coast.elevation![idx], 'Coastal opens into ocean at the west edge')
          .toBeLessThan(coast.seaLevel!);
      }
      const scandi = get(MapPreset.Scandinavia);
      const x = Math.floor(scandi.cols! * 0.08);
      const y = Math.floor(scandi.rows! * (0.33 + 0.10 * Math.sin(0.08 * 8)));
      expect(scandi.elevation![y * scandi.cols! + x], 'Scandinavia has a sea-level fjord')
        .toBeLessThan(scandi.seaLevel!);
    }
  }, 240_000);

  it('clears only a small playable camp, not the surrounding biome', () => {
    for (const preset of [MapPreset.BlackForest, MapPreset.Oasis, MapPreset.Highland, MapPreset.Coastal]) {
      for (const seed of SEEDS) {
        const map = generateWorldMap(MapSize.Medium, preset, seed);
        const site = map.campSite!;
        expect(isFootprintBuildable(map, 46, 40, site.x, site.y)).toBe(true);
        const cx = Math.floor(site.x / 10);
        const cy = Math.floor(site.y / 10);
        expect(map.overrides?.size ?? 0).toBeGreaterThan(0);
        expect(map.overrides!.size, 'camp clearing must remain local').toBeLessThan(1050);
        for (const key of map.overrides!.keys()) {
          const tx = key % map.width;
          const ty = Math.floor(key / map.width);
          expect(Math.hypot(tx - cx, ty - cy)).toBeLessThanOrEqual(17);
        }
      }
    }
  }, 240_000);

  it('keeps the old generator intact when regenerating revision-one saves', () => {
    for (const seed of SEEDS) {
      const dims = MAP_SIZE_DIMENSIONS[MapSize.Medium];
      const old = generateRawTerrain(
        dims.width, dims.height, seed, MapSize.Medium, MapPreset.Oasis, undefined, 1,
      );
      const fresh = make(MapPreset.Oasis, seed);
      expect(old.generationVersion).toBe(1);
      expect(fresh.generationVersion).toBe(3);
      const center = Math.floor(old.rows! / 2) * old.cols! + Math.floor(old.cols! / 2);
      expect(old.elevation![center]).not.toBe(fresh.elevation![center]);
    }
  }, 240_000);
});
