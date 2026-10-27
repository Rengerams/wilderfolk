/**
 * Pathfinder instrumentation — the real A* counters the performance harness was missing.
 *
 * `spatialQueryMetrics` counts *spatial searches* (graze/flee/hunt/social/road), which the
 * perf harness reports under the name `pathCalls`. That name was always a proxy: the harness
 * record itself carries `pathCalls.source` telling a reader not to quote the number as
 * pathfinding. This module is the real thing —  A* invocations, node expansions, cache
 * behaviour and passability-grid rebuilds — so path calls can be reported honestly.
 *
 * Follows the established `spatialQueryMetrics` contract: opt-in via env flag, per-tick and
 * session buckets, and **zero overhead when disabled** (every recorder returns immediately on a
 * module-level boolean, so the hot path pays one predictable branch per call site).
 *
 * Owner: `src/game/pathfinding.ts` is the only writer. There is no second home for these
 * counters — `spatialQueryMetrics` deliberately stays the spatial-search owner (AGENTS.md §5.2).
 */

export interface PathfinderCounters {
  /** `findPath` invocations, including the cheap pre-A* rejects. */
  findPathCalls: number;
  /** Nodes popped and expanded inside the A* loop. */
  nodesExpanded: number;
  /** A* runs that produced a route. */
  pathsFound: number;
  /** A* runs that exhausted the open set without reaching the goal. */
  pathsFailed: number;
  /** Failed runs that stopped because `maxNodes` was reached (not because no route exists). */
  maxNodesExceeded: number;
  /** Calls rejected before A* ran (out of bounds, no walkable endpoint, start === goal). */
  earlyRejects: number;
  /** `lineCrossesBlocked` line-of-sight samples (the cheap pre-A* gate). */
  lineChecks: number;
  /** Passability-grid rebuilds — the whole-map scan, so this should stay near 1 per map. */
  gridRebuilds: number;
  /** Waypoint cache hits in `steerWithPath` (an A* run avoided). */
  cacheHits: number;
  /** Waypoint cache misses that triggered an A* run. */
  cacheMisses: number;
}

export interface PathfinderReport {
  /** Ticks in which any pathfinding activity was recorded. */
  ticks: number;
  /** Absolute counters for the whole measured session. */
  session: PathfinderCounters;
  /** Session totals divided by `ticks`, so the figures are comparable with the spatial report. */
  perTick: PathfinderCounters;
  /** Mean expanded nodes per A* run — the shape of the search, not just its volume. */
  nodesPerCall: number;
  /** Share of A* runs served from the waypoint cache, 0 when no run happened. */
  cacheHitRate: number;
}

const COUNTER_KEYS = [
  'findPathCalls',
  'nodesExpanded',
  'pathsFound',
  'pathsFailed',
  'maxNodesExceeded',
  'earlyRejects',
  'lineChecks',
  'gridRebuilds',
  'cacheHits',
  'cacheMisses',
] as const satisfies readonly (keyof PathfinderCounters)[];

function envFlagEnabled(val: string | undefined): boolean {
  if (val == null || val === '') return false;
  return /^(1|true|yes|on|enabled)$/i.test(val.trim());
}

function isMetricsEnvEnabled(): boolean {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  if (envFlagEnabled(runtime.process?.env?.PATHFINDING_METRICS)) return true;
  if (typeof import.meta !== 'undefined') {
    return envFlagEnabled(import.meta.env?.VITE_PATHFINDING_METRICS);
  }
  return false;
}

function createEmptyCounters(): PathfinderCounters {
  return {
    findPathCalls: 0,
    nodesExpanded: 0,
    pathsFound: 0,
    pathsFailed: 0,
    maxNodesExceeded: 0,
    earlyRejects: 0,
    lineChecks: 0,
    gridRebuilds: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
}

/** In-place zeroing to avoid GC allocations during high-speed benchmark loops. */
function zeroCountersInPlace(counters: PathfinderCounters): void {
  for (let i = 0; i < COUNTER_KEYS.length; i++) {
    counters[COUNTER_KEYS[i]] = 0;
  }
}

let enabled = isMetricsEnvEnabled();
const tickCounters: PathfinderCounters = createEmptyCounters();
const sessionCounters: PathfinderCounters = createEmptyCounters();
let measuredTicks = 0;

/**
 * Hot-path read of the enable flag. Exported so `pathfinding.ts` can skip a whole recorder
 * call where the argument is expensive to compute; the recorders themselves also guard.
 */
export function isPathfindingMetricsEnabled(): boolean {
  return enabled;
}

export function setPathfindingMetricsEnabled(value: boolean): void {
  enabled = value;
}

export function resetPathfinderSession(): void {
  zeroCountersInPlace(tickCounters);
  zeroCountersInPlace(sessionCounters);
  measuredTicks = 0;
}

export function resetPathfinderTickMetrics(): void {
  zeroCountersInPlace(tickCounters);
}

/** Folds the tick bucket into the session bucket; called once per tick by the sim loop. */
export function flushPathfinderTickToSession(): void {
  if (!enabled) return;

  let hadActivity = false;
  for (let i = 0; i < COUNTER_KEYS.length; i++) {
    const key = COUNTER_KEYS[i];
    const tick = tickCounters[key];
    if (tick > 0) hadActivity = true;
    sessionCounters[key] += tick;
  }

  if (hadActivity) {
    measuredTicks++;
  }
}

export function recordFindPathCall(): void {
  if (!enabled) return;
  tickCounters.findPathCalls += 1;
}

export function recordPathNodes(count: number): void {
  if (!enabled || count <= 0) return;
  tickCounters.nodesExpanded += count;
}

export function recordPathFound(): void {
  if (!enabled) return;
  tickCounters.pathsFound += 1;
}

export function recordPathFailed(): void {
  if (!enabled) return;
  tickCounters.pathsFailed += 1;
}

export function recordPathMaxNodesExceeded(): void {
  if (!enabled) return;
  tickCounters.maxNodesExceeded += 1;
}

export function recordPathEarlyReject(): void {
  if (!enabled) return;
  tickCounters.earlyRejects += 1;
}

export function recordLineCheck(): void {
  if (!enabled) return;
  tickCounters.lineChecks += 1;
}

export function recordGridRebuild(): void {
  if (!enabled) return;
  tickCounters.gridRebuilds += 1;
}

export function recordPathCacheHit(): void {
  if (!enabled) return;
  tickCounters.cacheHits += 1;
}

export function recordPathCacheMiss(): void {
  if (!enabled) return;
  tickCounters.cacheMisses += 1;
}

/** Returns a detached snapshot of the current unflushed tick counters. */
export function getCurrentPathfinderTickCounters(): PathfinderCounters {
  return { ...tickCounters };
}

export function getPathfinderReport(): PathfinderReport {
  const perTick = createEmptyCounters();
  const divisor = measuredTicks > 0 ? measuredTicks : 1;

  for (let i = 0; i < COUNTER_KEYS.length; i++) {
    const key = COUNTER_KEYS[i];
    perTick[key] = sessionCounters[key] / divisor;
  }

  const calls = sessionCounters.findPathCalls;
  const cached = sessionCounters.cacheHits + sessionCounters.cacheMisses;

  return {
    ticks: measuredTicks,
    session: { ...sessionCounters },
    perTick,
    nodesPerCall: calls > 0 ? sessionCounters.nodesExpanded / calls : 0,
    cacheHitRate: cached > 0 ? sessionCounters.cacheHits / cached : 0,
  };
}

export function formatPathfinderReport(report: PathfinderReport): string {
  const s = report.session;
  return [
    `Pathfinder metrics — ${report.ticks} active ticks`,
    `  A* calls ${s.findPathCalls} (${report.perTick.findPathCalls.toFixed(1)}/tick), `
      + `nodes ${s.nodesExpanded} (${report.nodesPerCall.toFixed(1)}/call)`,
    `  found ${s.pathsFound} · failed ${s.pathsFailed} · node-cap ${s.maxNodesExceeded} · early rejects ${s.earlyRejects}`,
    `  line checks ${s.lineChecks} (${report.perTick.lineChecks.toFixed(1)}/tick) · grid rebuilds ${s.gridRebuilds}`,
    `  waypoint cache hit ${s.cacheHits} / miss ${s.cacheMisses} (${(report.cacheHitRate * 100).toFixed(1)}%)`,
  ].join('\n');
}
