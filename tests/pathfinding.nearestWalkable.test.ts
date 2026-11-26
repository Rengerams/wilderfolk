/**
 * `nearestWalkableWorldPoint` is the blocked-ground repair the human tick runs on every settler:
 * these cases pin the ring order, the nearest-centre answer and the map-edge clamp it must keep.
 */
import { describe, expect, it } from 'vitest';
import { getPathGrid, nearestWalkableWorldPoint } from '../src/game/pathfinding';
import { PATH_CELL, TerrainType } from '../src/game/gameTypes';
import { testWorldMap } from '../src/test/worldMapFixtures';

const centre = (tx: number, ty: number) => ({
  x: tx * PATH_CELL + PATH_CELL / 2,
  y: ty * PATH_CELL + PATH_CELL / 2,
});

describe('nearestWalkableWorldPoint', () => {
  it('returns the requested point unchanged when it already stands on walkable ground', () => {
    const map = testWorldMap({ tilesX: 12, tilesY: 12, seed: 11 });
    expect(nearestWalkableWorldPoint(map, [], 63, 41)).toEqual({ x: 63, y: 41 });
  });

  it('finds the single walkable cell two rings out', () => {
    const map = testWorldMap({
      tilesX: 12,
      tilesY: 12,
      seed: 12,
      tileType: (tx, ty) => (tx === 7 && ty === 4 ? undefined : TerrainType.River),
    });
    expect(nearestWalkableWorldPoint(map, [], 55, 45)).toEqual(centre(7, 4));
  });

  it('picks the nearest of two walkable cells in the same ring', () => {
    const map = testWorldMap({
      tilesX: 14,
      tilesY: 14,
      seed: 13,
      tileType: (tx, ty) => ((tx === 5 && ty === 3) || (tx === 7 && ty === 5) ? undefined : TerrainType.River),
    });
    expect(nearestWalkableWorldPoint(map, [], 68, 45)).toEqual(centre(7, 5));
  });

  it('clamps a corner start inside the grid', () => {
    const map = testWorldMap({
      tilesX: 12,
      tilesY: 12,
      seed: 14,
      tileType: (tx, ty) => (tx === 2 && ty === 0 ? undefined : TerrainType.River),
    });
    expect(nearestWalkableWorldPoint(map, [], 2, 3)).toEqual(centre(2, 0));
  });

  it('reuses a prepared simulation grid without reading the building list again', () => {
    const map = testWorldMap({
      tilesX: 12, tilesY: 12, seed: 16,
      tileType: (tx, ty) => tx === 7 && ty === 4 ? undefined : TerrainType.River,
    });
    const grid = getPathGrid(map, []);
    const buildings = new Proxy([], {
      get() { throw new Error('prepared grid must bypass building signature scans'); },
    });
    expect(nearestWalkableWorldPoint(map, buildings, 55, 45, undefined, grid)).toEqual(centre(7, 4));
    expect(nearestWalkableWorldPoint(map, buildings, 75, 45, undefined, grid)).toEqual({ x: 75, y: 45 });
  });

  it('preserves the nearest result and row-order tie break on a deep blocked ring', () => {
    const map = testWorldMap({
      tilesX: 24, tilesY: 24, seed: 17,
      tileType: (tx, ty) => ty === 12 && (tx === 3 || tx === 21) ? undefined : TerrainType.River,
    });
    expect(nearestWalkableWorldPoint(map, [], centre(12, 12).x, centre(12, 12).y)).toEqual(centre(3, 12));
    expect(nearestWalkableWorldPoint(map, [], centre(12, 12).x, centre(12, 12).y,
      (tx) => tx === 3)).toEqual(centre(21, 12));
  });

  it('returns null when no cell is walkable', () => {
    const map = testWorldMap({
      tilesX: 10,
      tilesY: 10,
      seed: 15,
      tileType: () => TerrainType.River,
    });
    expect(nearestWalkableWorldPoint(map, [], 55, 55)).toBeNull();
  });
});
