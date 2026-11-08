/**
 * SIM-18: the passability grid's cache identity must include runtime terrain overrides, not just
 * the seed/preset/building signature that used to imply them.
 */
import { describe, expect, it } from 'vitest';
import { getPathGrid } from '../src/game/pathfinding';
import { PATH_CELL, TerrainType } from '../src/game/gameTypes';
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
