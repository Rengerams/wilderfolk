import { describe, expect, it } from 'vitest';
import { findPath, lineCrossesBlocked, type PathGrid } from '../src/game/pathfinding';

const grid = (cols: number, rows: number): PathGrid => ({
  cols, rows, blocked: new Uint8Array(cols * rows),
  elevation: new Float32Array(cols * rows),
});

describe('pathfinding cliff and corner safety', () => {
  it('detects a cliff immediately beyond the origin cell', () => {
    const g = grid(2, 1);
    g.elevation![0] = 90;
    g.elevation![1] = 5;
    expect(lineCrossesBlocked(g, 9.9, 5, 10.1, 5)).toBe(true);
    g.elevation![1] = 75;
    expect(lineCrossesBlocked(g, 9.9, 5, 10.1, 5)).toBe(false);
  });

  it('does not smooth an A* route through diagonal wall corners', () => {
    const g = grid(5, 5);
    g.blocked[1 * 5 + 2] = 1;
    g.blocked[2 * 5 + 1] = 1;
    const route = findPath(g, 0, 0, 4, 4);
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThan(2);
  });
});
