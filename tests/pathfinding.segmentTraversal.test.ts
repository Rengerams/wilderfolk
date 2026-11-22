import { describe, expect, it } from 'vitest';
import {
  findPath, findRouteCostOutcome, getNavigationQuote, getRouteObstruction, isWalkStepAllowed,
  lineCrossesBlocked, nearestWalkableWorldPoint, resetPathGridCaches, setCurrentPathMap,
  steerWithPath, type PathGrid,
} from '../src/game/pathfinding';
import { PATH_CELL, TerrainType } from '../src/game/gameTypes';
import { human } from '../src/test/factories';
import { testWorldMap } from '../src/test/worldMapFixtures';

function grid(cols: number, rows: number): PathGrid {
  return { cols, rows, blocked: new Uint8Array(cols * rows), elevation: new Float32Array(cols * rows) };
}

const center = (tile: number) => (tile + 0.5) * PATH_CELL;

describe('one authoritative movement walkability verdict', () => {
  it('does not skip a one-tile obstruction on a very long physical step', () => {
    const g = grid(300, 4);
    g.blocked[1 * g.cols + 151] = 1;
    const fromX = center(1), toX = center(298), y = center(1);
    expect(lineCrossesBlocked(g, fromX, y, toX, y)).toBe(true);
    expect(isWalkStepAllowed(fromX, y, toX, y, g)).toBe(false);
    expect(isWalkStepAllowed(fromX, center(2), toX, center(2), g)).toBe(true);
  });

  it('agrees with route checks on blocked diagonal corners', () => {
    const g = grid(5, 5);
    g.blocked[1 * g.cols + 2] = 1;
    g.blocked[2 * g.cols + 1] = 1;
    expect(lineCrossesBlocked(g, center(1), center(1), center(2), center(2))).toBe(true);
    expect(isWalkStepAllowed(center(1), center(1), center(2), center(2), g)).toBe(false);
  });

  it('rejects the 2x2 cliff-corner shortcut in movement, A* and commute quotes', () => {
    const g = grid(2, 2);
    // Rows: [0, 40] / [40, 0]. Both endpoints match, but neither adjacent
    // cardinal tile is reachable; jumping across the corner strands walkers.
    g.elevation!.set([0, 40, 40, 0]);
    const start = { x: 0, y: 0 };
    const goal = { x: 1, y: 1 };
    expect(isWalkStepAllowed(center(0), center(0), center(1), center(1), g)).toBe(false);
    expect(lineCrossesBlocked(g, center(0), center(0), center(1), center(1))).toBe(true);
    expect(findPath(g, 0, 0, 1, 1)).toBeNull();
    expect(getNavigationQuote(g, start, goal, { maxNodes: 100 })).toEqual({ status: 'unreachable' });
  });

  it('detours around one steep orthogonal corner instead of taking its diagonal', () => {
    const g = grid(2, 2);
    // This time the upper horizontal neighbour is legal, so the route detours
    // via (1, 0) instead of attempting a diagonal over the steep (0, 1) corner.
    g.elevation!.set([0, 0, 40, 0]);
    expect(isWalkStepAllowed(center(0), center(0), center(1), center(1), g)).toBe(false);
    expect(findPath(g, 0, 0, 1, 1)).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 },
    ]);
    const quote = getNavigationQuote(g, { x: 0, y: 0 }, { x: 1, y: 1 }, { maxNodes: 100 });
    expect(quote.status).toBe('priced');
    if (quote.status === 'priced') {
      expect(quote.tiles).toEqual([
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 },
      ]);
    }
  });

  it('uses the identical elevation limit for physical steps and direct route checks', () => {
    const g = grid(3, 1);
    g.elevation![0] = 0;
    g.elevation![1] = 33;
    expect(lineCrossesBlocked(g, center(0), center(0), center(1), center(0))).toBe(true);
    expect(isWalkStepAllowed(center(0), center(0), center(1), center(0), g)).toBe(false);
    g.elevation![1] = 32;
    expect(isWalkStepAllowed(center(0), center(0), center(1), center(0), g)).toBe(true);
  });

  it('lets an already-blocked walker escape but not cross another blocked tile', () => {
    const g = grid(4, 3);
    g.blocked[1 * g.cols + 0] = 1;
    g.blocked[1 * g.cols + 2] = 1;
    expect(isWalkStepAllowed(center(0), center(1), center(1), center(1), g)).toBe(true);
    expect(isWalkStepAllowed(center(0), center(1), center(3), center(1), g)).toBe(false);
    expect(lineCrossesBlocked(g, center(0), center(1), center(1), center(1))).toBe(true);
  });

  it('prices a valid same-tile route at zero rather than as unreachable', () => {
    const g = grid(3, 3);
    expect(findRouteCostOutcome(g, 1, 1, 1, 1, 0))
      .toEqual({ cost: 0, budgetExhausted: false });
    g.blocked[1 * g.cols + 1] = 1;
    expect(findRouteCostOutcome(g, 1, 1, 1, 1, 0).cost).toBeNull();
  });

  it('snaps blocked A* endpoints farther than three tiles to the nearest open tile', () => {
    const g = grid(16, 16);
    g.blocked.fill(1);
    for (let x = 9; x <= 13; x++) g.blocked[9 * g.cols + x] = 0;
    const route = findPath(g, 5, 5, 13, 9);
    expect(route?.[0]).toEqual({ x: 9, y: 9 });
    expect(route?.at(-1)).toEqual({ x: 13, y: 9 });
  });

  it('chooses the physically closest tile even when it lies in a later square ring', () => {
    const map = testWorldMap({
      tilesX: 12, tilesY: 12, seed: 2711,
      tileType: (x, y) => (x === 4 && y === 4) || (x === 7 && y === 5)
        ? undefined : TerrainType.River,
    });
    expect(nearestWalkableWorldPoint(map, [], 5.99 * PATH_CELL, 5.99 * PATH_CELL))
      .toEqual({ x: center(7), y: center(5) });
  });

  it('keeps a bounded-out search pending instead of claiming the destination is unreachable', () => {
    const map = testWorldMap({
      tilesX: 220, tilesY: 220, seed: 2712,
      tileType: (x) => x === 110 ? TerrainType.River : undefined,
    });
    expect(getRouteObstruction(map, [],
      { x: center(10), y: center(110) }, { x: center(200), y: center(110) }))
      .toBe('pending');
  });

  it('reports a proven disconnect as blocked', () => {
    const map = testWorldMap({
      tilesX: 12, tilesY: 12, seed: 2713,
      tileType: (x) => x === 6 ? TerrainType.River : undefined,
    });
    expect(getRouteObstruction(map, [],
      { x: center(2), y: center(6) }, { x: center(9), y: center(6) }))
      .toBe('blocked');
  });

  it('escapes when a blocked origin snaps to the same walkable tile as its destination', () => {
    const g = grid(3, 3);
    g.blocked.fill(1);
    g.blocked[2 * g.cols + 1] = 0;
    expect(findPath(g, 1, 1, 1, 2)).toEqual([{ x: 1, y: 1 }, { x: 1, y: 2 }]);
    expect(isWalkStepAllowed(center(1), center(1), center(1), center(2), g)).toBe(true);
  });

  it('keeps a cheaper slope-avoiding A* path instead of smoothing through costly hills', () => {
    const g = grid(5, 3);
    for (const x of [1, 3]) g.elevation![g.cols + x] = 32;
    const result = findPath(g, 0, 1, 4, 1);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(2);
    expect(result!.some(({ y }) => y !== 1)).toBe(true);
  });

  it('treats bridge entrances as traversable even over a steep riverbed', () => {
    const g = grid(3, 1);
    g.bridge = new Uint8Array([0, 1, 0]);
    g.elevation!.set([70, 0, 70]);
    expect(isWalkStepAllowed(center(0), center(0), center(2), center(0), g)).toBe(true);
    expect(findPath(g, 0, 0, 2, 0)).not.toBeNull();
  });

  it('rejects off-map walking and clamps restored points to walkable map bounds', () => {
    const g = grid(3, 3);
    expect(isWalkStepAllowed(center(0), center(0), -1, center(0), g)).toBe(false);
    expect(isWalkStepAllowed(-1, center(0), center(0), center(0), g)).toBe(false);
    const map = testWorldMap({ tilesX: 3, tilesY: 3, seed: 2714 });
    expect(nearestWalkableWorldPoint(map, [], -5, center(1))).toEqual({ x: 0, y: center(1) });
    expect(nearestWalkableWorldPoint(map, [], NaN, center(1))).toBeNull();
  });

  it('rejects invalid A* coordinates and nonpositive fractional search budgets', () => {
    const g = grid(3, 3);
    expect(findPath(g, NaN, 0, 2, 2)).toBeNull();
    expect(findPath(g, 0.5, 0, 2, 2)).toBeNull();
    expect(getNavigationQuote(g, { x: 0, y: 0 }, { x: 2, y: 2 }, { maxNodes: 0.5 }))
      .toEqual({ status: 'pending', reason: 'search-budget' });
  });

  it('does not turn a reused cached route into a route through a newly blocked tile', () => {
    const map = testWorldMap({
      tilesX: 15, tilesY: 15, seed: 2715,
      tileType: (x, y) => x === 7 && y !== 10 ? TerrainType.River : undefined,
    });
    resetPathGridCaches();
    setCurrentPathMap(map, []);
    try {
      const walker = human(2715, { x: center(4), y: center(4) });
      expect(steerWithPath(walker, center(10), center(4), 2, 'route-reuse')).toBe('path');
      walker.x = center(8);
      walker.y = center(4);
      // Teleporting to the other side invalidates the old segment and replans;
      // the remaining unobstructed leg should now be traversed directly.
      expect(steerWithPath(walker, center(10), center(4), 2, 'route-reuse')).toBe('direct');
    } finally {
      setCurrentPathMap(null);
      resetPathGridCaches();
    }
  });
});
