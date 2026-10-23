/**
 * The camp must stand on ground the ground art paints as land.
 *
 * `ensureCampClearing` flattens the camp area into buildable tiles, and a coastal map's centre can
 * be open sea. Filling that sea left walkable land the per-pixel bake still painted as water, so the
 * founding settlers stood in the middle of the sea — the water is now left alone and the camp moves
 * to the nearest buildable ground instead.
 */
import { describe, expect, it } from 'vitest';
import { MapPreset, MapSize, PATH_CELL, type WorldMap } from '../src/game/gameTypes';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import { generateWorldMap, isFootprintBuildable } from '../src/game/terrainGen';
import { DEFAULT_SEA_LEVEL, TERRAIN_CELL, sampleElev } from '../src/game/terrain/terrainGrid';

/** Water-heavy presets, whose centre a low-lying map puts under the sea. */
const PRESETS = [MapPreset.Continental, MapPreset.Coastal, MapPreset.Islands];
const SEEDS = [1, 2, 3];

const HOUSE = BUILDING_CONFIGS[BuildingType.House];

/** The ground bake's own water test: the field elevation at the tile centre, against sea level. */
function groundPaintIsWater(map: WorldMap, tx: number, ty: number): boolean {
  const sea = map.seaLevel ?? DEFAULT_SEA_LEVEL;
  const across = (tx * PATH_CELL + PATH_CELL / 2) / TERRAIN_CELL;
  const down = (ty * PATH_CELL + PATH_CELL / 2) / TERRAIN_CELL;
  return sampleElev(map.elevation!, map.cols!, map.rows!, across, down) < sea;
}

describe('camp ground', () => {
  it('settles the camp on buildable land', () => {
    for (const preset of PRESETS) {
      for (const seed of SEEDS) {
        const map = generateWorldMap(MapSize.Medium, preset, seed);
        const site = map.campSite;
        expect(site, `${preset}/${seed} resolved no camp site`).toBeDefined();
        expect(
          isFootprintBuildable(map, HOUSE.width, HOUSE.height, site!.x, site!.y),
          `${preset}/${seed} camp site is not buildable`,
        ).toBe(true);
      }
    }
  });

  it('never clears terrain into land the ground art paints as water', () => {
    for (const preset of PRESETS) {
      for (const seed of SEEDS) {
        const map = generateWorldMap(MapSize.Medium, preset, seed);
        expect(map.overrides?.size ?? 0).toBeGreaterThan(0);
        for (const key of map.overrides!.keys()) {
          const tx = key % map.width;
          const ty = Math.floor(key / map.width);
          expect(
            groundPaintIsWater(map, tx, ty),
            `${preset}/${seed} cleared tile ${tx},${ty} out of painted water`,
          ).toBe(false);
        }
      }
    }
  });
});
