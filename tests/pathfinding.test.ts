/**
 * Pathfinding routes around water/mountains instead of walking straight
 * through them (fixes settlers stuck at map edges on blocked lines).
 *
 * The fixtures are real maps built through the production tile model: a tile's type comes from
 * the projection, and the passability grid is rebaked from it, so these cases exercise the same
 * agreement between "what the tile is" and "what the pathfinder thinks" that ships.
 */
import { describe, expect, it } from 'vitest';
import { findPath, getPathGrid, lineCrossesBlocked } from '../src/game/pathfinding';
import { BuildingType, PATH_CELL, TerrainType } from '../src/game/gameTypes';
import type { Building } from '../src/game/gameTypes';
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

  it('treats completed rival or legacy walls as impassable terrain', () => {
    const map = makeMap(8, 8, 431, () => false);
    const wall: Building = {
      id: 900, type: BuildingType.Wall, faction: 'rival', x: 3.5 * PATH_CELL, y: 3.5 * PATH_CELL,
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
    // water it spans. Stamping only the road mask left the deck a cost discount on a tile the
    // router still refused: no route was found and the walk fell back to the straight line, so a
    // settler waded the river the bridge was built across.
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