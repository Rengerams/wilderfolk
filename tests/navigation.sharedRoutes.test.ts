import { beforeEach, describe, expect, it } from 'vitest';
import { BuildingType, PATH_CELL } from '../src/game/gameTypes';
import { building } from '../src/test/factories';
import { buildingAccessPoints } from '../src/game/buildingAccess';
import { quoteBuildingCommute, quoteCommute } from '../src/game/commuteReach';
import { findRouteCostOutcome, getNavigationQuote, resetPathGridCaches, type PathGrid } from '../src/game/pathfinding';
import {
  flushPathfinderTickToSession, getPathfinderReport, resetPathfinderSession,
  resetPathfinderTickMetrics, setPathfindingMetricsEnabled,
} from '../src/game/pathfindingMetrics';

function grid(cols = 12, rows = 12): PathGrid {
  return { cols, rows, blocked: new Uint8Array(cols * rows) };
}

describe('shared navigation route authority — checkpoint A', () => {
  beforeEach(() => {
    resetPathGridCaches();
    setPathfindingMetricsEnabled(false);
    resetPathfinderSession();
  });

  it('reuses the same frozen geometry and weighted price without another A*', () => {
    const map = grid();
    const start = { x: 1, y: 1 };
    const goal = { x: 10, y: 8 };
    setPathfindingMetricsEnabled(true);
    resetPathfinderTickMetrics();
    const first = getNavigationQuote(map, start, goal, { maxNodes: 4000 });
    const second = getNavigationQuote(map, start, goal, { maxNodes: 4000 });
    const oldCost = findRouteCostOutcome(map, start.x, start.y, goal.x, goal.y, 4000);
    flushPathfinderTickToSession();
    const searches = getPathfinderReport().session.findPathCalls;
    setPathfindingMetricsEnabled(false);
    expect(first.status).toBe('priced');
    expect(second).toBe(first);
    expect(getNavigationQuote(map, start, goal, { maxNodes: 0 })).toBe(first);
    if (first.status === 'priced') {
      expect(oldCost.cost).toBe(first.costTiles);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.tiles)).toBe(true);
      expect(first.tiles.every(Object.isFrozen)).toBe(true);
      expect(first.tiles[0]).toEqual(start);
      expect(first.tiles[first.tiles.length - 1]).toEqual(goal);
    }
    expect(searches).toBe(1);
  });

  it('does not cache a node-budget timeout as a disconnected route', () => {
    const map = grid();
    const start = { x: 1, y: 5 };
    const goal = { x: 10, y: 5 };
    expect(getNavigationQuote(map, start, goal, { maxNodes: 1 }))
      .toEqual({ status: 'pending', reason: 'node-budget' });
    expect(getNavigationQuote(map, start, goal, { maxNodes: 4000 }).status).toBe('priced');
    const changed = grid();
    for (let y = 0; y < changed.rows; y++) changed.blocked[y * changed.cols + 6] = 1;
    expect(getNavigationQuote(changed, start, goal, { maxNodes: 4000 }))
      .toEqual({ status: 'unreachable' });
  });

  it('validates endpoint tiles rather than silently snapping onto blocked land', () => {
    const map = grid();
    map.blocked[8 * map.cols + 8] = 1;
    expect(getNavigationQuote(map, { x: 2, y: 2 }, { x: 8, y: 8 }, { maxNodes: 4000 }))
      .toEqual({ status: 'unreachable' });
    expect(getNavigationQuote(null, { x: 2, y: 2 }, { x: 8, y: 8 }, { maxNodes: 4000 }))
      .toEqual({ status: 'pending', reason: 'no-grid' });
    expect(getNavigationQuote(map, { x: 2, y: 2 }, { x: 3, y: 3 }, { maxNodes: 0 }))
      .toEqual({ status: 'pending', reason: 'search-budget' });
  });

  it('keeps uphill and downhill prices separate and discounts road tiles', () => {
    const map = grid(8, 1);
    map.elevation = new Float32Array([0, 0, 4, 8, 12, 16, 20, 20]);
    const uphill = getNavigationQuote(map, { x: 0, y: 0 }, { x: 7, y: 0 }, { maxNodes: 4000 });
    const downhill = getNavigationQuote(map, { x: 7, y: 0 }, { x: 0, y: 0 }, { maxNodes: 4000 });
    expect(uphill.status).toBe('priced');
    expect(downhill.status).toBe('priced');
    if (uphill.status !== 'priced' || downhill.status !== 'priced') return;
    expect(uphill.costTiles).toBeGreaterThan(downhill.costTiles);
    const paved = { ...map, road: new Uint8Array(8).fill(1) };
    const roadQuote = getNavigationQuote(paved, { x: 0, y: 0 }, { x: 7, y: 0 },
      { maxNodes: 4000 });
    expect(roadQuote.status).toBe('priced');
    if (roadQuote.status === 'priced') expect(roadQuote.costTiles).toBeLessThan(uphill.costTiles);
  });

  it('prices the exact distance between different points in one tile', () => {
    const map = grid();
    const origin = { x: PATH_CELL * 2 + 1, y: PATH_CELL * 2 + 1 };
    const destination = { x: PATH_CELL * 2 + 8, y: PATH_CELL * 2 + 7 };
    const result = quoteCommute(origin, destination, 1.2, map);
    expect(result.status).toBe('priced');
    if (result.status === 'priced') {
      expect(result.costTiles).toBeCloseTo(Math.hypot(7, 6) / PATH_CELL);
      expect(result.travelHours).toBeGreaterThan(0);
      expect(result.leadHours).toBe(1);
    }
    expect(quoteCommute(origin, destination, 1.2, null))
      .toEqual({ status: 'pending', reason: 'no-grid' });
  });

  it('chooses the lowest priced route across all facades, not the nearest doorstep pair', () => {
    const map = grid(60, 45);
    map.road = new Uint8Array(map.cols * map.rows);
    // The shortest facing-door pair must detour around a barrier. A paved south
    // passage is farther geometrically but cheaper after actual A* travel pricing.
    for (let y = 0; y <= 30; y++) map.blocked[y * map.cols + 25] = 1;
    for (let x = 6; x <= 45; x++) map.road[31 * map.cols + x] = 1;
    const home = building(1, BuildingType.House, {
      x: 105, y: 205, width: 40, height: 200,
    });
    const workplace = building(2, BuildingType.Farm, {
      x: 405, y: 205, width: 40, height: 200,
    });
    const start = buildingAccessPoints(home, map);
    const end = buildingAccessPoints(workplace, map);
    const facingHome = start.find((point) => point.side === 'east')!;
    const facingWork = end.find((point) => point.side === 'west')!;
    expect(facingHome).toBeDefined();
    expect(facingWork).toBeDefined();
    const facingRoute = quoteCommute(facingHome, facingWork, 6.4, map);
    const best = quoteBuildingCommute(home, workplace, 6.4, map);
    expect(facingRoute.status).toBe('priced');
    expect(best.status).toBe('priced');
    if (facingRoute.status !== 'priced' || best.status !== 'priced') return;
    expect(best.costTiles).toBeLessThan(facingRoute.costTiles);
    // A confirmed cheaper route must not be rejected near the two-hour cutoff.
    expect(best.travelHours).toBeLessThan(facingRoute.travelHours);
  });

  it('isolates cache generations and invalidates them on reset', () => {
    const map = grid();
    const start = { x: 1, y: 1 };
    const goal = { x: 9, y: 9 };
    const first = getNavigationQuote(map, start, goal, { maxNodes: 4000 });
    expect(getNavigationQuote(map, start, goal, { maxNodes: 4000 })).toBe(first);
    const changed = grid();
    changed.blocked[9 * changed.cols + 9] = 1;
    expect(getNavigationQuote(changed, start, goal, { maxNodes: 4000 }))
      .toEqual({ status: 'unreachable' });
    resetPathGridCaches();
    expect(getNavigationQuote(map, start, goal, { maxNodes: 4000 })).not.toBe(first);
  });

  it('evicts oldest routes once the bounded entry count is reached', () => {
    const map = grid(8, 8);
    const start = { x: 0, y: 0 };
    const goal = { x: 1, y: 1 };
    const first = getNavigationQuote(map, start, goal, { maxNodes: 100 });
    for (let a = 0; a < 64; a++) {
      for (let b = 0; b < 64; b++) {
        if (a === b) continue;
        getNavigationQuote(map, { x: a % 8, y: Math.floor(a / 8) },
          { x: b % 8, y: Math.floor(b / 8) }, { maxNodes: 100 });
      }
    }
    expect(getNavigationQuote(map, start, goal, { maxNodes: 100 })).not.toBe(first);
  });
});
