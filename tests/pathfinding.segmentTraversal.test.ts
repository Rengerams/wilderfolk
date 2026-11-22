import { describe, expect, it } from 'vitest';
import {
  findPath, findRouteCostOutcome, getRouteObstruction, isWalkStepAllowed,
  lineCrossesBlocked, nearestWalkableWorldPoint, type PathGrid,
} from '../src/game/pathfinding';
import { PATH_CELL, TerrainType } from '../src/game/gameTypes';
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
});
