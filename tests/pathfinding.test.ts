import { applyHumanWalkStep, commuteHumanToBuilding, steerHumanToward } from '../src/game/simulation/humanMovement';
import { getCurrentPathfinderTickCounters, resetPathfinderSession, setPathfindingMetricsEnabled } from '../src/game/pathfindingMetrics';
/**
 * Pathfinding routes around water and mountains instead of walking through them, over real maps
 * whose passability grid is rebaked from the production tile projection.
 */
import { describe, expect, it } from 'vitest';
import {
  findPath, getPathGrid, getRouteObstruction, lineCrossesBlocked, setCurrentPathMap, steerWithPath, invalidateCommutePathsForWalker,
} from '../src/game/pathfinding';
import { BuildingType, PATH_CELL, TerrainType } from '../src/game/gameTypes';
import type { Building, Entity, WorldMap } from '../src/game/gameTypes';
import { testWorldMap } from '../src/test/worldMapFixtures';

function makeMap(width: number, height: number, seed: number, blocker: (x: number, y: number) => boolean) {
  return testWorldMap({
    tilesX: width,
    tilesY: height,
    seed,
    tileType: (x, y) => (blocker(x, y) ? TerrainType.River : undefined),
  });
}

describe('pathfinding', () => {
  it('uses the single terrain walkability policy for shallow water, with a completed bridge exception', () => {
    const map = testWorldMap({
      tilesX: 10, tilesY: 10, seed: 20261127,
      tileType: (x) => x === 5 ? TerrainType.ShallowWater : TerrainType.Grassland,
    });
    const bare = getPathGrid(map, []);
    expect(bare.blocked[5 * bare.cols + 5]).toBe(1);
    expect(findPath(bare, 0, 5, 9, 5)).toBeNull();

    const bridge: Building = {
      id: 202, type: BuildingType.Bridge, x: 55, y: 55,
      width: 10, height: 10, occupants: [], level: 1,
      constructionProgress: 100, completed: true, health: 100, maxHealth: 100,
      spriteScale: 1, buildAnimTimer: 0,
    };
    const crossed = getPathGrid(map, [bridge]);
    expect(crossed.blocked[5 * crossed.cols + 5]).toBe(0);
    expect(findPath(crossed, 0, 5, 9, 5)).not.toBeNull();
  });

  it('detects a thin completed building along a long straight line', () => {
    // The former 128 samples were ~39 pixels apart and could skip a one-tile footprint.
    const map = makeMap(500, 12, 73, () => false);
    const blocker: Building = {
      id: 101, type: BuildingType.House, x: 1250, y: 55,
      width: 10, height: 10, occupants: [], level: 1,
      constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    };
    const grid = getPathGrid(map, [blocker]);
    expect(grid.blocked[5 * grid.cols + 125]).toBe(1);
    expect(lineCrossesBlocked(grid, 25, 55, 4975, 55)).toBe(true);
  });

  it('stops mixed-sign diagonal traversal at exact corner endpoints', () => {
    const grid = getPathGrid(makeMap(8, 8, 749, () => false));
    for (const [x0, y0, x1, y1] of [
      [5, 35, 20, 20],
      [20, 20, 5, 35],
      [35, 5, 20, 20],
      [20, 20, 35, 5],
    ]) {
      expect(lineCrossesBlocked(grid, x0, y0, x1, y1)).toBe(false);
    }
  });

  it('blocks an exactly diagonal line between two solid corner neighbours', () => {
    const map = makeMap(8, 8, 74, (x, y) => (x === 3 && y === 2) || (x === 2 && y === 3));
    const grid = getPathGrid(map);
    expect(lineCrossesBlocked(grid, 25, 25, 45, 45)).toBe(true);
  });

  it('finds a straight path when nothing blocks', () => {
    const grid = getPathGrid(makeMap(10, 10, 1, () => false));
    const path = findPath(grid, 0, 5, 9, 5);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, y: 5 });
    expect(path![path!.length - 1]).toEqual({ x: 9, y: 5 });
  });

  it('routes along a built road instead of the open ground beside it', () => {
    // One blocked tile forces A* off the straight line, and row 1 is paved: the route should use the
    // road rather than the equally short open row below it.
    const map = makeMap(12, 5, 41, (x, y) => x === 5 && y === 2);
    const road: Building = {
      id: 1,
      type: BuildingType.Road,
      x: (11 * PATH_CELL) / 2,
      y: 1.5 * PATH_CELL,
      width: 11 * PATH_CELL,
      height: PATH_CELL,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    };
    const grid = getPathGrid(map, [road]);
    const path = findPath(grid, 0, 2, 10, 2);

    // The mask the A* cost reads: row 1 paved, row 3 not.
    expect(grid.road?.[1 * grid.cols + 5]).toBe(1);
    expect(grid.road?.[3 * grid.cols + 5]).toBe(0);

    expect(path).not.toBeNull();
    expect(path!.some((p) => p.y === 1)).toBe(true);
    expect(path!.some((p) => p.y === 3)).toBe(false);
  });

  it('selects a faster paved detour without a blocking obstacle', () => {
    const map = makeMap(22, 8, 420, () => false);
    const road: Building = {
      id: 44, type: BuildingType.Road,
      x: 11 * PATH_CELL, y: 2.5 * PATH_CELL,
      width: 19 * PATH_CELL, height: PATH_CELL,
      occupants: [], level: 1, constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    };
    const grid = getPathGrid(map, [road]);
    const route = findPath(grid, 2, 3, 19, 3);
    expect(lineCrossesBlocked(grid, 2.5 * PATH_CELL, 3.5 * PATH_CELL, 19.5 * PATH_CELL, 3.5 * PATH_CELL)).toBe(false);
    expect(route).not.toBeNull();
    expect(route!.some((tile) => tile.y === 2)).toBe(true);
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

  it('snaps a blocked start or goal to the nearest walkable tile', () => {
    // Column 5 is river for every row, so columns 0–4 and 6–9 are separate.
    const grid = getPathGrid(makeMap(10, 10, 4, (x) => x === 5));

    // A blocked goal is resolved to the walkable tile beside it rather than
    // failing outright — that is what keeps a settler off an impassable tile.
    const toBlockedGoal = findPath(grid, 0, 5, 5, 5);
    expect(toBlockedGoal).not.toBeNull();
    expect(toBlockedGoal![0]).toEqual({ x: 0, y: 5 });
    expect(toBlockedGoal!.some((p) => p.x === 5)).toBe(false);
    const end = toBlockedGoal![toBlockedGoal!.length - 1];
    expect(Math.max(Math.abs(end.x - 5), Math.abs(end.y - 5))).toBe(1);

    // Snapping cannot bridge the river: the far bank stays unreachable.
    expect(findPath(grid, 5, 5, 9, 5)).toBeNull();
  });

  it('routes to the stand tile beside a blocked goal instead of accepting the walker own tile', () => {
    // One river tile is the destination and the walker starts inside the outer stand rings, so a
    // single shared target set would let the walker's own tile win and freeze it in place.
    const map = makeMap(20, 20, 20261122, (x, y) => x === 10 && y === 10);
    setCurrentPathMap(map, []);
    try {
      expect(getRouteObstruction(map, [], { x: 65, y: 105 }, { x: 105, y: 105 })).toBe('rerouting');
      const walker = { id: 9, x: 65, y: 105, vx: 0, vy: 0 } as unknown as Entity;
      expect(steerWithPath(walker, 105, 105, 5, 'blocked-goal')).toBe('path');
      expect(walker.vx, 'the walker advances toward the destination').toBeGreaterThan(0);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('does not cut diagonally through two blocked orthogonal corners', () => {
    const grid = getPathGrid(makeMap(3, 3, 6, (x, y) => (x === 1 && y === 0) || (x === 0 && y === 1)));
    expect(findPath(grid, 0, 0, 2, 2)).toBeNull();
  });

  it('keeps distant-road movement detours inside the default node budget', () => {
    const grid = getPathGrid(makeMap(400, 400, 20261026, (x, y) => x === 102 && y === 100));
    // A single far-away road must not weaken all movement searches on the map.
    grid.road = new Uint8Array(grid.cols * grid.rows);
    grid.road[0] = 1;
    const path = findPath(grid, 100, 100, 250, 100);
    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual({ x: 250, y: 100 });
  });

  it('respects the bounded-search guard on an otherwise open grid', () => {
    const grid = getPathGrid(makeMap(10, 10, 7, () => false));
    expect(findPath(grid, 0, 0, 9, 9, 5)).toBeNull();
  });

  it('lineCrossesBlocked detects a river between two points', () => {
    const grid = getPathGrid(makeMap(20, 20, 5, (x) => x === 10));
    const sx = 2 * PATH_CELL;
    const sy = 10 * PATH_CELL;
    const ex = 18 * PATH_CELL;
    expect(lineCrossesBlocked(grid, sx, sy, ex, sy)).toBe(true);
    expect(lineCrossesBlocked(grid, sx, sy, 8 * PATH_CELL, sy)).toBe(false);
  });

  it('makes a completed farm footprint solid so walkers go around it', () => {
    const map = makeMap(14, 8, 432, () => false);
    const farm: Building = {
      id: 901,
      type: BuildingType.Farm,
      x: 6.5 * PATH_CELL,
      y: 4 * PATH_CELL,
      width: 5 * PATH_CELL,
      height: 3 * PATH_CELL,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    };
    const grid = getPathGrid(map, [farm]);
    const path = findPath(grid, 1, 4, 12, 4);

    expect(grid.blocked[4 * grid.cols + 6], 'the farm centre is still walkable').toBe(1);
    expect(path, 'there is still a route around the farm').not.toBeNull();
    expect(path!.some((tile) => tile.x >= 4 && tile.x <= 9 && tile.y >= 3 && tile.y <= 5)).toBe(false);
  });

  it('routes around a generator-reserved boulder and still crosses decorative buildings', () => {
    const map = makeMap(12, 8, 2031, () => false);
    // The L3 decor pass reserves the cell of a big rock (`Walkability.Reserved`) and the build
    // grid already refuses to build there, so the walker must treat it as solid.
    const rock = 3 * map.width + 6;
    map.pathGrid![rock] = 2;
    const decor: Building = {
      id: 901, type: BuildingType.Garden, x: 8.5 * PATH_CELL, y: 3.5 * PATH_CELL,
      width: PATH_CELL, height: PATH_CELL,
      occupants: [], level: 1, constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    };
    const grid = getPathGrid(map, [decor]);
    expect(grid.blocked[rock], 'a reserved boulder bars walking').toBe(1);
    expect(grid.blocked[3 * grid.cols + 8], 'a decorative structure stays walkable').toBe(0);
    expect(lineCrossesBlocked(grid, 15, 35, 105, 35), 'no straight line through the rock').toBe(true);
    const path = findPath(grid, 1, 3, 10, 3);
    expect(path, 'there is still a route around the rock').not.toBeNull();
    expect(path!.some((tile) => tile.x === 6 && tile.y === 3)).toBe(false);
  });

  it('rebuilds the route when a completed solid structure is removed', () => {
    const map = makeMap(12, 8, 2032, () => false);
    const wall: Building = {
      id: 902, type: BuildingType.Wall, x: 6.5 * PATH_CELL, y: 3.5 * PATH_CELL,
      width: PATH_CELL, height: PATH_CELL,
      occupants: [], level: 1, constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    };
    const blocked = getPathGrid(map, [wall]);
    expect(blocked.blocked[3 * blocked.cols + 6]).toBe(1);
    expect(lineCrossesBlocked(blocked, 15, 35, 105, 35)).toBe(true);
    const clear = getPathGrid(map, []);
    expect(clear).not.toBe(blocked);
    expect(clear.blocked[3 * clear.cols + 6]).toBe(0);
    expect(lineCrossesBlocked(clear, 15, 35, 105, 35)).toBe(false);
  });

  it('keeps roads, squares and unfinished buildings walkable', () => {
    const map = makeMap(12, 8, 433, () => false);
    const square: Building = {
      id: 902,
      type: BuildingType.Square,
      x: 4.5 * PATH_CELL,
      y: 3.5 * PATH_CELL,
      width: 3 * PATH_CELL,
      height: 3 * PATH_CELL,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    };
    const unfinished: Building = {
      ...square,
      id: 903,
      type: BuildingType.Farm,
      x: 8.5 * PATH_CELL,
      completed: false,
    };
    const grid = getPathGrid(map, [square, unfinished]);

    expect(grid.blocked[3 * grid.cols + 4]).toBe(0);
    expect(grid.blocked[3 * grid.cols + 8]).toBe(0);
  });

  it('treats completed walls as impassable terrain', () => {
    const map = makeMap(8, 8, 431, () => false);
    const wall: Building = {
      id: 900, type: BuildingType.Wall, x: 3.5 * PATH_CELL, y: 3.5 * PATH_CELL,
      width: PATH_CELL, height: PATH_CELL,
      occupants: [], level: 1, constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    };
    const grid = getPathGrid(map, [wall]);
    expect(grid.blocked[3 * grid.cols + 3]).toBe(1);
    expect(findPath(grid, 1, 3, 6, 3)?.some((tile) => tile.x === 3 && tile.y === 3)).toBe(false);
  });

  it('opens the water a bridge spans, so the deck is a crossing and not decoration', () => {
    // River column 5 for every row: the two banks are separate unless a deck connects them.
    const map = makeMap(10, 10, 8, (x) => x === 5);
    const bridge: Building = {
      id: 2,
      type: BuildingType.Bridge,
      x: 5.5 * PATH_CELL,
      y: 5.5 * PATH_CELL,
      width: PATH_CELL,
      height: PATH_CELL,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    };

    // Fixture premise: with no bridge the river separates the banks for the router.
    const bare = getPathGrid(map, []);
    expect(bare.blocked[5 * bare.cols + 5]).toBe(1);
    expect(findPath(bare, 0, 5, 9, 5)).toBeNull();

    // `isWalkableRoad` calls a completed bridge walkable, so its footprint must clear the blocked
    // water it spans — a walkable deck the router still refuses connects nothing.
    const grid = getPathGrid(map, [bridge]);
    expect(grid.road?.[5 * grid.cols + 5]).toBe(1);
    expect(grid.blocked[5 * grid.cols + 5], 'the deck tile is still water to the router').toBe(0);
    // The crossing is walkable end to end, so no straight line over it is "blocked" any more.
    const mid = 5 * PATH_CELL + 5;
    expect(lineCrossesBlocked(grid, 5, mid, 9 * PATH_CELL + 5, mid)).toBe(false);

    // The two banks are now one connected walk. (The route is simplified to line-of-sight corners, so
    // it need not name the deck tile itself — the connectivity is the contract.)
    const path = findPath(grid, 0, 5, 9, 5);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, y: 5 });
    expect(path![path!.length - 1]).toEqual({ x: 9, y: 5 });
  });
});

describe('path reuse and walk integration', () => {
  /** World-pixel center of a tile. */
  function pixel(tileX: number): number {
    return tileX * PATH_CELL + PATH_CELL / 2;
  }

  function human(id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
    return {
      id,
      type: 'human',
      x,
      y,
      vx: 0,
      vy: 0,
      alive: true,
      age: 25,
      energy: 100,
      maxEnergy: 100,
      gender: 'female',
      isJuvenile: false,
      ...overrides,
    } as Entity;
  }

  describe('patrol route reuse', () => {
    it('reuses one planned route while a patrol target moves within one tile', () => {
      const road = {
        id: 812, type: BuildingType.Road, x: 300, y: 55,
        width: 90, height: 10, completed: true,
      } as Building;
      setCurrentPathMap(makeMap(60, 20, 891, () => false), [road]);
      setPathfindingMetricsEnabled(true);
      resetPathfinderSession();
      try {
        const guard = human(13, 25, 55);
        for (let tick = 0; tick < 12; tick++) {
          const tx = 245 + tick * 0.1;
          const ty = 55 + tick * 0.1;
          steerHumanToward(guard,
            (Math.floor(tx / PATH_CELL) + 0.5) * PATH_CELL,
            (Math.floor(ty / PATH_CELL) + 0.5) * PATH_CELL,
            2, 0.65, `patrol_${guard.id}`);
          applyHumanWalkStep(guard, 1);
        }
        const counters = getCurrentPathfinderTickCounters();
        expect(counters.cacheMisses).toBe(1);
        expect(counters.cacheHits).toBeGreaterThan(0);
      } finally {
        setCurrentPathMap(null);
        setPathfindingMetricsEnabled(false);
        resetPathfinderSession();
      }
    });
  });

  describe('fast road waypoint steering', () => {
    it('crosses ten-pixel road tiles without oscillating at a waypoint or repeatedly searching', () => {
      const road = {
        id: 803, type: BuildingType.Road, x: pixel(20), y: pixel(15),
        width: 30 * PATH_CELL, height: PATH_CELL, completed: true,
      } as Building;
      setCurrentPathMap(makeMap(45, 35, 20261028, () => false), [road]);
      setPathfindingMetricsEnabled(true);
      resetPathfinderSession();
      try {
        // pixel() converts the tile axis to its centre. The target Y must be row 18,
        // not row 36 (which lies outside this 35-row fixture and correctly blocks travel).
        const walker = human(803, pixel(4), pixel(18));
        const goalX = pixel(36);
        const goalY = pixel(18);
        const steps: number[] = [];
        let arrived = false;
        for (let tick = 0; tick < 90; tick++) {
          const mode = steerWithPath(walker, goalX, goalY, 28, 'fast-road');
          if (mode === 'arrived') { arrived = true; break; }
          if (mode === 'direct') {
            const dx = goalX - walker.x;
            const dy = goalY - walker.y;
            const dist = Math.hypot(dx, dy);
            walker.vx = dx / dist * Math.min(28, dist / 1.5);
            walker.vy = dy / dist * Math.min(28, dist / 1.5);
          } else {
            expect(mode).toBe('path');
          }
          const roadMult = 1.5;
          steps.push(Math.hypot(walker.vx, walker.vy) * roadMult);
          applyHumanWalkStep(walker, roadMult);
        }
        expect(arrived).toBe(true);
        expect(steps.some((step) => step > PATH_CELL * 2)).toBe(true);
        expect(getCurrentPathfinderTickCounters().findPathCalls).toBeLessThan(15);
      } finally {
        setPathfindingMetricsEnabled(false);
        setCurrentPathMap(null);
      }
    });
  });

  describe('accepted road detour final approach', () => {
    it('continues on accepted waypoints once closer than the initial search threshold', () => {
      const road = {
        id: 802, type: BuildingType.Road, x: pixel(20), y: pixel(18),
        width: 34 * PATH_CELL, height: PATH_CELL, completed: true,
      } as Building;
      setCurrentPathMap(makeMap(45, 35, 20261027, () => false), [road]);
      try {
        const walker = human(802, pixel(4), pixel(18));
        const targetX = pixel(36);
        const targetY = pixel(18);
        expect(steerWithPath(walker, targetX, targetY, 5, 'accepted-road')).toBe('path');
        let enteredFinalApproach = false;
        for (let step = 0; step < 120; step++) {
          const result = steerWithPath(walker, targetX, targetY, 5, 'accepted-road');
          const remaining = Math.hypot(walker.x - targetX, walker.y - targetY);
          if (remaining < 150 && remaining > 35) {
            expect(result).toBe('path');
            enteredFinalApproach = true;
            break;
          }
          expect(result).toBe('path');
          walker.x += walker.vx;
          walker.y += walker.vy;
        }
        expect(enteredFinalApproach).toBe(true);
      } finally {
        setCurrentPathMap(null);
      }
    });
  });

  describe('road detour negative caching', () => {
    it('keeps a rejected detour cached as the walker crosses tiles on a clear route', () => {
      const farRoad = {
        id: 801, type: BuildingType.Road, x: pixel(30), y: pixel(30),
        width: PATH_CELL, height: PATH_CELL, completed: true,
      } as Building;
      setCurrentPathMap(makeMap(40, 40, 20261026, () => false), [farRoad]);
      setPathfindingMetricsEnabled(true);
      resetPathfinderSession();
      try {
        const walker = human(801, pixel(2), pixel(5));
        expect(steerWithPath(walker, pixel(35), pixel(5), 5, 'negative-road')).toBe('direct');
        const searches = getCurrentPathfinderTickCounters().findPathCalls;
        expect(searches).toBeGreaterThan(0);
        for (let tile = 3; tile <= 12; tile++) {
          walker.x = pixel(tile);
          expect(steerWithPath(walker, pixel(35), pixel(5), 5, 'negative-road')).toBe('direct');
        }
        expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(searches);
      } finally {
        setPathfindingMetricsEnabled(false);
        setCurrentPathMap(null);
      }
    });
  });

  describe('M22 path cache origin', () => {
    it('retains routes for hundreds of simultaneous commuters and invalidates topology changes', () => {
      const map = makeMap(40, 40, 934, (x, y) => y === 20 && x !== 35);
      setCurrentPathMap(map, []);
      setPathfindingMetricsEnabled(true);
      resetPathfinderSession();
      try {
        const walkers = Array.from({ length: 300 }, (_, id) => human(id, pixel(5), pixel(35)));
        for (const walker of walkers) {
          expect(steerWithPath(walker, pixel(20), pixel(10), 5, `load_${walker.id}`)).toBe('path');
        }
        const searches = getCurrentPathfinderTickCounters().findPathCalls;
        for (const walker of walkers) {
          expect(steerWithPath(walker, pixel(20), pixel(10), 5, `load_${walker.id}`)).toBe('path');
        }
        expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(searches);
        setCurrentPathMap(makeMap(40, 40, 935, (x, y) => y === 20), []);
        expect(steerWithPath(walkers[0], pixel(20), pixel(10), 5, 'load_0')).toBe('blocked');
        expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(searches + 1);
      } finally {
        setPathfindingMetricsEnabled(false);
        setCurrentPathMap(null);
      }
    });

    it('retries a failed route when the same key moves to another origin or destination', () => {
      setCurrentPathMap(makeMap(40, 40, 936, (x, y) => y === 20), []);
      const walker = human(1, pixel(5), pixel(35));
      expect(steerWithPath(walker, pixel(20), pixel(10), 5, 'retry')).toBe('blocked');
      setPathfindingMetricsEnabled(true);
      resetPathfinderSession();
      try {
        walker.x += PATH_CELL;
        steerWithPath(walker, pixel(20), pixel(10), 5, 'retry');
        expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(1);
        steerWithPath(walker, pixel(22), pixel(10), 5, 'retry');
        expect(getCurrentPathfinderTickCounters().findPathCalls).toBe(2);
      } finally {
        setPathfindingMetricsEnabled(false);
        setCurrentPathMap(null);
      }
    });

    it('recomputes a cached path started from a different origin', () => {
      // Horizontal river at tile row 20 with a single gap at column 35.
      setCurrentPathMap(makeMap(40, 40, 922, (x, y) => y === 20 && x !== 35), []);
      // A walkable target north of the river: a blocked target is now approached from the walker's
      // own side, which would make "did it steer back to the stale origin?" unanswerable. `pixel`
      // reads one tile index, so each axis is converted on its own.
      const target = { x: pixel(20), y: pixel(10) };
      const entity = human(7, pixel(5), pixel(35));
      const cacheKey = 'c_7_42_h';

      // First leg: cached from the bottom-left corner.
      expect(steerWithPath(entity, target.x, target.y, 5, cacheKey)).toBe('path');

      // Same commute leg from a different origin: the cached waypoints must be recomputed, not reused
      // to steer the settler back toward the stale origin.
      entity.x = pixel(25);
      entity.y = pixel(25);
      expect(steerWithPath(entity, target.x, target.y, 5, cacheKey)).toBe('path');

      const toStaleOriginX = pixel(5) - entity.x;
      const toStaleOriginY = pixel(35) - entity.y;
      const steeredBackToOrigin = entity.vx * toStaleOriginX + entity.vy * toStaleOriginY;
      expect(steeredBackToOrigin).toBeLessThanOrEqual(0);
    });
  });

  describe('path cache reuses the route through forward progress', () => {
    it('does not re-run A* while the settler is still walking the cached route', () => {
      setPathfindingMetricsEnabled(true);
      resetPathfinderSession();
      // A river with one gap keeps the direct line blocked for the whole first stretch of the walk.
      setCurrentPathMap(makeMap(40, 40, 931, (x, y) => y === 20 && x !== 35), []);
      const target = { x: pixel(20), y: pixel(20) };
      const entity = human(7, pixel(5), pixel(5));
      const cacheKey = 'c_7_42_h';

      // First leg computes A* exactly once.
      expect(steerWithPath(entity, target.x, target.y, 5, cacheKey)).toBe('path');

      // Walk the route forward: each step must be a cache hit, never a fresh A* run.
      for (let step = 0; step < 12; step++) {
        entity.x += entity.vx;
        entity.y += entity.vy;
        expect(steerWithPath(entity, target.x, target.y, 5, cacheKey)).toBe('path');
      }

      const counters = getCurrentPathfinderTickCounters();
      expect(counters.findPathCalls).toBe(1);
      expect(counters.cacheMisses).toBe(1);
      expect(counters.cacheHits).toBeGreaterThan(0);

      setPathfindingMetricsEnabled(false);
      resetPathfinderSession();
    });
  });

  describe('water and walls are solid under every walk', () => {
    /** The grid's own verdict for the tile a world point stands in. */
    function blockedAt(map: WorldMap, buildings: Building[], x: number, y: number): boolean {
      const grid = getPathGrid(map, buildings);
      const tx = Math.floor(x / PATH_CELL);
      const ty = Math.floor(y / PATH_CELL);
      return grid.blocked[ty * grid.cols + tx] === 1;
    }

    it('stops a walker at the riverbank instead of letting it ford', () => {
      const map = makeMap(40, 40, 941, (x) => x === 20);
      setCurrentPathMap(map, []);
      const walker = human(3, pixel(19), pixel(10));
      walker.vx = 2;

      for (let tick = 0; tick < 30; tick++) applyHumanWalkStep(walker, 1);

      // Straight east is the river; blocked steps cannot carry the walker into it.
      expect(Math.floor(walker.x / PATH_CELL), 'the settler walked into the river').toBeLessThan(20);
      expect(blockedAt(map, [], walker.x, walker.y), 'the settler stood in the river').toBe(false);
    });

    it('lets a walker already standing on a blocked tile walk off it', () => {
      const map = makeMap(40, 40, 944, (x) => x === 20);
      setCurrentPathMap(map, []);
      // Settlers can end up on water, so the occupied cell is not an obstacle to leaving it; testing
      // the whole step instead of the ground ahead would freeze them there.
      const walker = human(5, pixel(20) + 2, pixel(10));
      walker.vx = -2;
      for (let tick = 0; tick < 20; tick++) applyHumanWalkStep(walker, 1);

      expect(Math.floor(walker.x / PATH_CELL), 'the settler could not leave the water').toBeLessThan(20);
    });

    it('routes a walker from blocked ground onto walkable ground before continuing', () => {
      const map = makeMap(40, 40, 945, (x, y) => (x === 20 || x === 21) && y !== 20);
      setCurrentPathMap(map, []);
      const walker = human(6, pixel(20), pixel(10));
      const targetX = pixel(25);
      const targetY = pixel(10);

      expect(steerWithPath(walker, targetX, targetY, 2, 'blocked-start')).toBe('path');
      expect(walker.vx, 'the route should first steer toward nearby walkable ground').toBeLessThan(0);

      for (let tick = 0; tick < 20; tick++) {
        applyHumanWalkStep(walker, 1);
        if (!blockedAt(map, [], walker.x, walker.y)) break;
        steerWithPath(walker, targetX, targetY, 2, 'blocked-start');
      }
      expect(blockedAt(map, [], walker.x, walker.y), 'the settler remained on blocked ground').toBe(false);
    });

    it('stops a walker at a wall instead of letting it pass through', () => {
      const map = makeMap(40, 40, 942, () => false);
      const wall: Building = {
        id: 5,
        type: BuildingType.Wall,
        x: pixel(20),
        y: pixel(10),
        width: PATH_CELL,
        height: PATH_CELL,
        occupants: [],
        level: 1,
        constructionProgress: 100,
        completed: true,
        health: 100,
        maxHealth: 100,
        spriteScale: 1,
        buildAnimTimer: 0,
      } as Building;
      expect(blockedAt(map, [wall], pixel(20), pixel(10)), 'fixture premise: the wall blocks its own tile').toBe(true);
      setCurrentPathMap(map, [wall]);

      const walker = human(4, pixel(19), pixel(10));
      walker.vx = 2;
      for (let tick = 0; tick < 30; tick++) applyHumanWalkStep(walker, 1);

      expect(blockedAt(map, [wall], walker.x, walker.y), 'the settler walked through the wall').toBe(false);
      expect(walker.x, 'the settler should be backed away from the wall after repeated blocked steps')
        .toBeLessThan(wall.x);
    });

    it('stops repeated blocked steps without teleporting or entering solid terrain', () => {
      const map = makeMap(40, 40, 946, (x) => x === 20);
      setCurrentPathMap(map, []);
      const walker = human(7, pixel(19), pixel(10));
      const startX = walker.x;
      const startY = walker.y;

      // A stale steering request can recur while the route is invalidated. It must not move the
      // settler backwards, snap to a remote cell or push through the impassable river column.
      for (let tick = 0; tick < 20; tick++) {
        walker.vx = 2;
        applyHumanWalkStep(walker, 1);
        expect(blockedAt(map, [], walker.x, walker.y), 'step entered blocked ground').toBe(false);
        expect(walker.x, 'blocked recovery jumped behind the starting point').toBeGreaterThanOrEqual(startX);
        expect(walker.x, 'blocked recovery crossed the river boundary').toBeLessThan(20 * PATH_CELL);
        expect(walker.y, 'blocked recovery changed the walk row').toBe(startY);
      }

      expect(walker.vx, 'blocked steering should stop movement until a valid new route exists').toBe(0);
      expect(walker.vy).toBe(0);
    });

    it('routes a short leg through a gap instead of fording it', () => {
      // River column 20 with a gap at row 12, and a workplace 20 px east: a leg under LONG_RANGE_DIST
      // (50) must route through the gap rather than ford.
      const map = makeMap(40, 40, 943, (x, y) => x === 20 && y !== 12);
      const buildings: Building[] = [];
      setCurrentPathMap(map, buildings);
      const workplace = { id: 7, x: pixel(23), y: pixel(10) - 25, width: 40, height: 30, completed: true } as Building;
      const walker = human(3, pixel(19), pixel(10));

      let arrived = false;
      let forded = false;
      for (let tick = 0; tick < 600 && !arrived; tick++) {
        arrived = commuteHumanToBuilding(walker, workplace, 1);
        applyHumanWalkStep(walker, 1);
        if (blockedAt(map, buildings, walker.x, walker.y)) forded = true;
      }

      expect(forded, 'the settler stood in the river').toBe(false);
      // And it really crossed, through the gap: a walker merely stopped at the bank never arrives.
      expect(arrived, 'the settler never reached the far bank').toBe(true);
      expect(walker.x).toBeGreaterThan(pixel(20));
    });

    it('routes a fixed-place approach around a solid building instead of pressing into it', () => {
      const map = makeMap(40, 40, 947, () => false);
      const blocker = {
        id: 12,
        type: BuildingType.Farm,
        x: pixel(20),
        y: pixel(15),
        width: 120,
        height: 120,
        completed: true,
        occupants: [],
        level: 1,
        constructionProgress: 100,
        health: 100,
        maxHealth: 100,
        spriteScale: 1,
        buildAnimTimer: 0,
      } as Building;
      setCurrentPathMap(map, [blocker]);
      const walker = human(8, pixel(2), pixel(10));
      const targetX = pixel(37);
      const targetY = pixel(10);
      let insideFootprint = false;

      for (let tick = 0; tick < 500 && Math.hypot(targetX - walker.x, targetY - walker.y) > 8; tick++) {
        steerHumanToward(walker, targetX, targetY, 8, 1, 'fixed-place-test');
        applyHumanWalkStep(walker, 1);
        if (blockedAt(map, [blocker], walker.x, walker.y)) insideFootprint = true;
      }

      expect(insideFootprint, 'the walker entered the building footprint').toBe(false);
      expect(walker.x, 'the walker never reached the far side').toBeGreaterThan(pixel(30));
    });
  });

  describe('blocked commuter path recovery', () => {
    it('invalidates only the stalled settler commute route for replanning', () => {
      const map = makeMap(40, 40, 921, (x, y) => x === 20 && y !== 20);
      setCurrentPathMap(map, []);
      const first = human(9901, pixel(12), pixel(12));
      const second = human(9902, pixel(12), pixel(12));
      const targetX = pixel(28);
      const targetY = pixel(25);
      expect(steerWithPath(first, targetX, targetY, 2, 'c_9901_8_w')).toBe('path');
      expect(steerWithPath(second, targetX, targetY, 2, 'c_9902_8_w')).toBe('path');
      invalidateCommutePathsForWalker(first.id);
      expect(steerWithPath(first, targetX, targetY, 2, 'c_9901_8_w')).toBe('path');
      expect(steerWithPath(second, targetX, targetY, 2, 'c_9902_8_w')).toBe('path');
      setCurrentPathMap(null);
    });
  });
});
