import { describe, expect, it } from 'vitest';
import { findPath, findRouteCost, getCurrentPathGrid, getNavigationQuote, resetPathGridCaches, setCurrentPathMap, steerWithPath } from '../src/game/pathfinding';
import { BuildingType, PATH_CELL } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { testWorldMap } from '../src/test/worldMapFixtures';
import type { PathGrid } from '../src/game/pathfinding';

const GRID_SIDE = 400;
const START_X = 100;
const START_Y = 100;
const TARGET_X = 250;
const TARGET_Y = 100;
const OBSTACLE_X = 102;
const OBSTACLE_Y = 100;

describe('road-aware search budgets', () => {
  it('keeps bounded movement reachable with an unrelated road tile', () => {
    const grid: PathGrid = {
      cols: GRID_SIDE,
      rows: GRID_SIDE,
      blocked: new Uint8Array(GRID_SIDE * GRID_SIDE),
      road: new Uint8Array(GRID_SIDE * GRID_SIDE),
    };
    grid.road![0] = 1;
    grid.blocked[OBSTACLE_Y * GRID_SIDE + OBSTACLE_X] = 1;

    const path = findPath(grid, START_X, START_Y, TARGET_X, TARGET_Y);
    expect(path).not.toBeNull();
    expect(path?.[0]).toEqual({ x: START_X, y: START_Y });
    expect(path?.at(-1)).toEqual({ x: TARGET_X, y: TARGET_Y });
    expect(path?.some(({ x, y }) => x === OBSTACLE_X && y === OBSTACLE_Y)).toBe(false);
    expect(findRouteCost(grid, START_X, START_Y, TARGET_X, TARGET_Y, 30_000)).not.toBeNull();
    // A successful 30k-node quote must not mask the independent 6k-node
    // budget check via the generation-scoped shared route cache.
    resetPathGridCaches();
    // The shared optimal route may exhaust the very same bounded search that
    // the pre-existing stronger movement heuristic can safely recover.
    expect(getNavigationQuote(grid, { x: START_X, y: START_Y },
      { x: TARGET_X, y: TARGET_Y }, { maxNodes: 6000 }).status).toBe('pending');
  });

  it('still steers with a bounded fallback when a distant road exhausts the shared quote', () => {
    const map = testWorldMap({ tilesX: GRID_SIDE, tilesY: GRID_SIDE, seed: 7001 });
    const road = building(1, BuildingType.Road, { x: 5, y: 5, width: 10, height: 10 });
    const wall = building(2, BuildingType.Wall, {
      x: (OBSTACLE_X + 0.5) * PATH_CELL,
      y: (OBSTACLE_Y + 0.5) * PATH_CELL, width: 10, height: 10,
    });
    setCurrentPathMap(map, [road, wall]);
    try {
      const grid = getCurrentPathGrid()!;
      const walker = human(9, {
        x: (START_X + 0.5) * PATH_CELL, y: (START_Y + 0.5) * PATH_CELL,
      });
      const targetX = (TARGET_X + 0.5) * PATH_CELL;
      const targetY = (TARGET_Y + 0.5) * PATH_CELL;
      expect(getNavigationQuote(grid, { x: START_X, y: START_Y },
        { x: TARGET_X, y: TARGET_Y }, { maxNodes: 6000 }).status).toBe('pending');
      expect(steerWithPath(walker, targetX, targetY, 6, 'road-budget-walker')).toBe('path');
      expect(Number.isFinite(walker.vx + walker.vy)).toBe(true);
      expect(Math.hypot(walker.vx, walker.vy)).toBeGreaterThan(0);
    } finally {
      setCurrentPathMap(null);
    }
  });
});
