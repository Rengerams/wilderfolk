import { describe, expect, it } from 'vitest';
import { findPath, findRouteCost, getCurrentPathGrid, getNavigationQuote, lineCrossesBlocked, resetPathGridCaches, setCurrentPathMap, steerWithPath } from '../src/game/pathfinding';
import { getCurrentPathfinderTickCounters, resetPathfinderSession, setPathfindingMetricsEnabled } from '../src/game/pathfindingMetrics';
import { BuildingType, PATH_CELL } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { testWorldMap } from '../src/test/worldMapFixtures';
import type { PathGrid } from '../src/game/pathfinding';

const GRID_SIDE = 400;
const START_X = 20;
const START_Y = 100;
const TARGET_X = 380;
const TARGET_Y = 100;
const OBSTACLE_X = 22;
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
    // Use an intentionally impossible one-node budget to establish the contract.
    // Whether a 6,000-node search succeeds is a property of the map and cache,
    // never a cross-runtime invariant for this independent path test.
    resetPathGridCaches();
    expect(getNavigationQuote(grid, { x: START_X, y: START_Y },
      { x: TARGET_X, y: TARGET_Y }, { maxNodes: 1 }).status).toBe('pending');
    expect(findRouteCost(grid, START_X, START_Y, TARGET_X, TARGET_Y, 131_072)).not.toBeNull();
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
      // A deliberately long 360-tile detour creates a wide margin over the
      // 6,000-node discounted A* cap while the directer movement heuristic
      // still finds the route within its own bounded budget.
      expect(lineCrossesBlocked(grid, walker.x, walker.y, targetX, targetY)).toBe(true);
      resetPathfinderSession();
      setPathfindingMetricsEnabled(true);
      try {
        const shared = getNavigationQuote(grid, { x: START_X, y: START_Y },
          { x: TARGET_X, y: TARGET_Y }, { maxNodes: 6000 });
        expect(shared.status).toBe('pending');
        // The steering owner must not cache 'pending' as a blocked destination.
        expect(steerWithPath(walker, targetX, targetY, 6, 'road-budget-walker')).toBe('path');
        expect(Number.isFinite(walker.vx + walker.vy)).toBe(true);
        expect(Math.hypot(walker.vx, walker.vy)).toBeGreaterThan(0);
        const counters = getCurrentPathfinderTickCounters();
        expect(counters.maxNodesExceeded).toBeGreaterThan(0);
        expect(counters.pathsFound).toBeGreaterThan(0);
      } finally {
        setPathfindingMetricsEnabled(false);
      }
    } finally {
      setCurrentPathMap(null);
    }
  });
});
