# Pathfinder counters never left their tick bucket

- Bug: the A* counters accumulated per tick but were never folded into the session bucket or shown anywhere, so the pathfinder report always read zero.
- Status: resolved
- Severity: low
- Date discovered: 2026-10-29
- Version/build: V.0.6.5.1, branch `multithreaded-game-support`
- Reporter: code trace while reading the CPU-profiler stage table of a 2021-settler colony
- Area: development instrumentation (pathfinding, CPU profiler)
- Owner module: `src/game/pathfindingMetrics.ts`, flushed by `src/game/gameTick.ts`, surfaced by `src/game/simWorker/gameWorker.ts` and `src/components/PerformanceProfilerPanel.tsx`
- Related PR/commit: none yet — commit on `multithreaded-game-support`

## Status history
- 2026-10-29 — open: `flushPathfinderTickToSession` and `resetPathfinderTickMetrics` had no caller in `src/`; only tests called them.
- 2026-10-29 — resolved: per-tick flush and reset wired into the tick, the report attached to worker profiler snapshots, and the panel renders it. Type, lint, build and four focused test files pass; the panel line itself was not verified in a running colony.

## Observed behavior
With `PATHFINDING_METRICS` enabled and the simulation ticking, `getPathfinderReport()` reported `findPathCalls: 0` and `ticks: 0`. `recordFindPathCall` had written the tick bucket, but nothing copied it into `sessionCounters`, so `formatPathfinderReport` had nothing to report and no surface displayed it at all.

## Expected behavior
The counters exist to explain what the profiler's `pathfinding.findPath` stage is doing — calls per tick, nodes per search, node-cap and early-reject shares, waypoint cache hit rate. That requires the tick bucket to be folded into the session bucket once per tick while measurement is on.

## Reproduction steps
1. Enable the counters (`PATHFINDING_METRICS=1`, or `setPathfindingMetricsEnabled(true)`).
2. Run at least one `gameTick` that performs a route search.
3. Read `getPathfinderReport()`: `ticks` stays 0 and `session.findPathCalls` stays 0, while `getCurrentPathfinderTickCounters().findPathCalls` is non-zero.

## Evidence
`grep -rn "flushPathfinderTickToSession" src` returned no result outside `src/game/pathfindingMetrics.ts`; the only callers were `tests/pathfindingMetrics.test.ts` and `tests/commuteRouteEstimate.test.ts`. The spatial equivalent is flushed from the tick (`gameTick.ts`), which is what made the omission visible.

## Root cause
Missing wiring, not a faulty counter: the flush/reset pair was never called from the fixed-layer tick, and no profiler response carried the report.

## Fix / proposed fix
The tick now resets the tick bucket when the counters are enabled and flushes it at the end, exactly as the spatial counters already do. A worker profiling session switches the counters on and resets the session, and each profiler snapshot carries the pathfinder report, which the profiler panel prints as one compact "A* shape" line. No simulation rule, RNG draw or route changes.

## Save/migration impact
None — development instrumentation only, off unless a profiler session or the environment flag enables it.

## Verification result
- `npm run test:types` — PASS
- `npm run lint` — PASS (0 warnings, 0 errors)
- `npm run build` — PASS, including the semantic-overlap gate with one recorded approval for the worker's install/dispatch split
- `npx vitest run tests/gameWorker.profilerStop.test.ts tests/performanceProfiler.test.ts tests/pathfindingMetrics.test.ts` — PASS (12 tests); the worker handshake test now asserts the counters switch on with the session and that the stopped snapshot carries a report with one recorded call
- `npx vitest run tests/medium-A-movement.test.ts tests/commuteRouteEstimate.test.ts` — PASS (29 tests)
- The panel line in a running colony — NOT VERIFIED automatically; the sandbox preview stayed on the intro screens, so the owner should confirm it on their save.
