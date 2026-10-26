import { describe, expect, it } from 'vitest';
import { findPath, findRouteCost } from '../src/game/pathfinding';
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
  });
});
