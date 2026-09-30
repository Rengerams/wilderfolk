/**
 * Pathfinder instrumentation contract (roadmap O4/P2).
 *
 * The perf harness reported `pathCalls` for months while the repository had **no pathfinder
 * counter at all** — the number was a spatial-query proxy, and nothing failed. These tests pin the
 * real counters that replaced it, so a recorder that silently stops firing is a red test rather
 * than a believable zero in a report.
 *
 * The risk each case guards:
 *   1. disabled means *no* counting (the zero-overhead claim, and no phantom numbers);
 *   2. a successful A* run is counted with its expanded nodes;
 *   3. a node-capped search is reported as failed **and** capped — not as "no route exists";
 *   4. a cheap pre-A* reject is not laundered into a search failure;
 *   5. the tick→session flush is what advances `measuredTicks`, so per-tick averages are honest.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPath, type PathGrid } from '../src/game/pathfinding';
import {
  flushPathfinderTickToSession,
  getPathfinderReport,
  resetPathfinderSession,
  resetPathfinderTickMetrics,
  setPathfindingMetricsEnabled,
} from '../src/game/pathfindingMetrics';

function makeGrid(cols: number, rows: number, isBlocked: (x: number, y: number) => boolean = () => false): PathGrid {
  const blocked = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (isBlocked(x, y)) blocked[y * cols + x] = 1;
    }
  }
  return { cols, rows, blocked };
}

beforeEach(() => {
  setPathfindingMetricsEnabled(true);
  resetPathfinderSession();
  resetPathfinderTickMetrics();
});

afterEach(() => {
  setPathfindingMetricsEnabled(false);
});

describe('pathfinding metrics', () => {
  it('counts nothing at all while disabled', () => {
    setPathfindingMetricsEnabled(false);
    const grid = makeGrid(10, 10);
    findPath(grid, 0, 5, 9, 5);

    const report = getPathfinderReport();
    expect(report.session.findPathCalls).toBe(0);
    expect(report.session.nodesExpanded).toBe(0);
    expect(report.session.pathsFound).toBe(0);
  });

  it('counts a successful A* run and the nodes it expanded', () => {
    const grid = makeGrid(10, 10);
    const path = findPath(grid, 0, 5, 9, 5);
    expect(path).not.toBeNull();

    flushPathfinderTickToSession();
    const report = getPathfinderReport();
    expect(report.session.findPathCalls).toBe(1);
    expect(report.session.pathsFound).toBe(1);
    expect(report.session.pathsFailed).toBe(0);
    expect(report.session.nodesExpanded).toBeGreaterThan(0);
    expect(report.nodesPerCall).toBeGreaterThan(0);
    expect(report.ticks).toBe(1);
  });

  it('reports a node-capped search as failed and capped, not as an unreachable goal', () => {
    const grid = makeGrid(10, 10);
    // 5 expansions cannot reach the far corner — pinned by tests/pathfinding.test.ts.
    expect(findPath(grid, 0, 0, 9, 9, 5)).toBeNull();

    flushPathfinderTickToSession();
    const report = getPathfinderReport();
    expect(report.session.pathsFailed).toBe(1);
    expect(report.session.maxNodesExceeded).toBe(1);
    expect(report.session.pathsFound).toBe(0);
  });

  it('keeps a cheap pre-A* reject out of the search-failure count', () => {
    const grid = makeGrid(10, 10);
    expect(findPath(grid, -1, 0, 5, 5)).toBeNull(); // out of bounds
    expect(findPath(grid, 5, 5, 5, 5)).toBeNull(); // start === goal

    flushPathfinderTickToSession();
    const report = getPathfinderReport();
    expect(report.session.findPathCalls).toBe(2);
    expect(report.session.earlyRejects).toBe(2);
    expect(report.session.pathsFailed).toBe(0);
    expect(report.session.nodesExpanded).toBe(0);
  });

  it('advances measuredTicks only through the tick flush, so per-tick rates stay honest', () => {
    const grid = makeGrid(10, 10);
    findPath(grid, 0, 5, 9, 5);

    // Unflushed: the session bucket is still empty.
    expect(getPathfinderReport().ticks).toBe(0);
    expect(getPathfinderReport().session.findPathCalls).toBe(0);

    flushPathfinderTickToSession();
    const flushed = getPathfinderReport();
    expect(flushed.ticks).toBe(1);
    expect(flushed.perTick.findPathCalls).toBe(1);

    // A second, empty tick must not inflate the divisor.
    resetPathfinderTickMetrics();
    flushPathfinderTickToSession();
    expect(getPathfinderReport().ticks).toBe(1);
    expect(getPathfinderReport().perTick.findPathCalls).toBe(1);
  });
});
