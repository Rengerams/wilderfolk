/**
 * Pathfinding routes around water/mountains instead of walking straight
 * through them (fixes settlers stuck at map edges on blocked lines).
 */
import { describe, expect, it } from 'vitest';
import { findPath, getPathGrid, lineCrossesBlocked } from '../src/game/pathfinding';
import { TERRAIN_TILE_SIZE, TerrainType } from '../src/game/gameTypes';
import type { WorldMap } from '../src/game/gameTypes';

function makeMap(width: number, height: number, seed: number, blocker: (x: number, y: number) => boolean): WorldMap {
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      type: blocker(x, y) ? TerrainType.River : TerrainType.Grassland,
      variation: 0.5,
      elevation: 0.5,
    })),
  );
  return { tiles, width, height, seed, preset: 'verdant' } as unknown as WorldMap;
}

describe('pathfinding', () => {
  it('finds a straight path when nothing blocks', () => {
    const grid = getPathGrid(makeMap(10, 10, 1, () => false));
    const path = findPath(grid, 0, 5, 9, 5);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, y: 5 });
    expect(path![path!.length - 1]).toEqual({ x: 9, y: 5 });
  });

  it('routes around a vertical river that does not span the whole map', () => {
    // River column 5, rows 1..8 — a path exists around the top or bottom end.
    const grid = getPathGrid(makeMap(10, 10, 2, (x, y) => x === 5 && y >= 1 && y <= 8));
    const path = findPath(grid, 0, 5, 9, 5);
    expect(path).not.toBeNull();
    for (const p of path!) {
      // Never on the river segment itself (going around its end is fine).
      expect(!(p.x === 5 && p.y >= 1 && p.y <= 8)).toBe(true);
    }
  });

  it('routes around a horizontal river', () => {
    // River row 5, cols 1..8 — a path exists around the left or right end.
    const grid = getPathGrid(makeMap(10, 10, 3, (x, y) => y === 5 && x >= 1 && x <= 8));
    const path = findPath(grid, 5, 0, 5, 9);
    expect(path).not.toBeNull();
    for (const p of path!) {
      expect(!(p.y === 5 && p.x >= 1 && p.x <= 8)).toBe(true);
    }
  });

  it('returns null when start or goal is blocked', () => {
    const grid = getPathGrid(makeMap(10, 10, 4, (x) => x === 5));
    expect(findPath(grid, 5, 5, 9, 5)).toBeNull();
    expect(findPath(grid, 0, 5, 5, 5)).toBeNull();
  });

  it('lineCrossesBlocked detects a river between two points', () => {
    const grid = getPathGrid(makeMap(20, 20, 5, (x) => x === 10));
    const sx = 2 * TERRAIN_TILE_SIZE;
    const sy = 10 * TERRAIN_TILE_SIZE;
    const ex = 18 * TERRAIN_TILE_SIZE;
    expect(lineCrossesBlocked(grid, sx, sy, ex, sy)).toBe(true);
    expect(lineCrossesBlocked(grid, sx, sy, 8 * TERRAIN_TILE_SIZE, sy)).toBe(false);
  });
});
