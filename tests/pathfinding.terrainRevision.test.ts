/**
 * SIM-18: the passability grid's cache identity must include runtime terrain overrides, not just
 * the seed/preset/building signature that used to imply them.
 */
import { describe, expect, it } from 'vitest';
import { getPathGrid } from '../src/game/pathfinding';
import { PATH_CELL, TerrainType, MapPreset, MapSize, type WorldMap } from '../src/game/gameTypes';
import { bumpTerrainRevision, rebakeTerrainGrids, setTileOverride } from '../src/game/terrain/terrainGrid';
import { testWorldMap } from '../src/test/worldMapFixtures';

describe('SIM-18 — runtime terrain overrides invalidate the path grid', () => {
  it('rebuilds blocked cells after an override is applied to an open tile', () => {
    const map = testWorldMap({ tilesX: 10, tilesY: 10, seed: 77 });
    const index = 5 * 10 + 5;
    expect(getPathGrid(map).blocked[index]).toBe(0);

    setTileOverride(map, 5, 5, {
      type: TerrainType.River,
      elevation: 40,
      moisture: 45,
      variation: 0.5,
    });
    rebakeTerrainGrids(map, { startTx: 5, endTx: 5, startTy: 5, endTy: 5 });
    bumpTerrainRevision({
      left: 5 * PATH_CELL,
      top: 5 * PATH_CELL,
      right: 6 * PATH_CELL,
      bottom: 6 * PATH_CELL,
    });

    expect(getPathGrid(map).blocked[index]).toBe(1);
  });
});

describe('path grid cache identity (L50)', () => {
  function makeMap(
    preset: MapPreset,
    seed: number,
    typeAt: (x: number, y: number) => TerrainType,
  ): WorldMap {
    const width = 8;
    const height = 8;
    const map: WorldMap = { width, height, seed, rivers: [], preset, size: MapSize.Medium };
    // Teraforge keeps no per-tile grid, so the fixture's tiles are written as the sparse override
    // layer the canonical reader serves first.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        setTileOverride(map, x, y, {
          type: typeAt(x, y),
          elevation: 0.5,
          moisture: 0.5,
          variation: 0.5,
        });
      }
    }
    return map;
  }

  it('L50 — rebuilds when two maps share seed and size but differ in tiles/preset', () => {
    const open = makeMap(MapPreset.Continental, 987654, () => TerrainType.Grassland);
    const river = makeMap(
      MapPreset.Rivers,
      987654,
      (x) => (x === 4 ? TerrainType.River : TerrainType.Grassland),
    );

    expect(Array.from(getPathGrid(open).blocked).some((v) => v === 1)).toBe(false);
    // Same seed, same dimensions — only the preset (and therefore the tiles) differ. The cached
    // open-field grid must not be served for the river map.
    expect(Array.from(getPathGrid(river).blocked).some((v) => v === 1)).toBe(true);
  });
});
