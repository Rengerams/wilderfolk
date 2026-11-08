# The blocked-ground repair scanned its whole ring square and called `Math.hypot` per candidate

- Bug: one leaf function, `nearestWalkableWorldPoint`, spent 5.3 % of a profiled 1,800-settler run re-ranking every cell of a growing square around each blocked settler, because it walked the square and filtered by Chebyshev distance instead of visiting the ring, and compared candidates with `Math.hypot`.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-08
- Version/build: V.0.6.5.2 working tree, branch `master-approach-buglist`
- Reporter: CPU profile of the city harness (`scripts/perf-at-pop.ts`, tier 1800)
- Area: movement repair in the realtime human tick
- Owner module: `src/game/pathfinding.ts` (`nearestWalkableWorldPoint`, registered in `OWNERSHIP_OVERVIEW.md`)
- Related PR/commit: this change

## Status history

- 2026-11-08 — open: a 1,800-settler CPU profile put 353 of 6,699 samples (5.3 % of profiled time, 6.5 % of the measured tick) in the self time of `nearestWalkableWorldPoint`, reached from the blocked-ground repair loop in `tickHumans`.
- 2026-11-08 — resolved: the same profile now puts 153 samples (2.3 %) there; exact-equivalence check and targeted suites pass.

## Observed behavior

The human tick ends with a repair pass: every settler standing on a blocked grid cell asks `nearestWalkableWorldPoint` for the closest standable point. For each radius the function walked the **whole** `(2r+1)²` square and discarded interior cells with a `Math.max(Math.abs(...))` test, allocated one point object per walkable candidate plus a spread object per improvement, and measured every candidate with `Math.hypot` — the slowest distance primitive in the engine.

Profile at tier 1800 (`PERF_POPS=1800 PERF_TICKS=60 PERF_WARMUP=10`, `node --import tsx --cpu-prof`):

| function | self samples | share |
|---|---|---|
| `nearestWalkableWorldPoint` | 353 | 5.3 % |

## Expected behavior

The repair only needs the closest standable tile centre on the first ring that has one. Ring membership, nearest-centre choice and result object are all that matter; scanning interior cells of the square and calling a transcendental-free distance primitive are pure overhead.

## Reproduction steps

1. `PERF_POPS=1800 PERF_TICKS=60 PERF_WARMUP=10 PERF_PROFILE=1 npx tsx scripts/perf-at-pop.ts`, or capture a V8 profile with `node --import tsx --cpu-prof`.
2. Rank the profile with `node scripts/analyze-cpuprofile.mjs <file> --top=35`.
3. `nearestWalkableWorldPoint` is the largest leaf reached from `tickHumans` after the neighbour-scan fixes.

## Evidence

- Before: 353 self samples of 6,699 (5.3 %), total 355 — its children contributed 2 samples, so the scan body itself is the cost.
- After: 153 self samples of 6,779 (2.3 %) — a 57 % drop in the same leaf with the same harness settings.
- Micro-benchmark on a 60×60 fixture with a wide blocked band and scattered blocked cells (167 blocked cells × 20 repeats × 3 passes): old 3.12 µs/call, new 1.62 µs/call.
- Exactness: the old implementation and the new one were compared on 610 (blocked cell, in-cell position) samples across two fixtures (122 blocked starts); 0 mismatches in returned point or `null`.

## Root cause

Two avoidable costs inside one loop: the square-plus-filter traversal visits `(2r+1)²` cells to find `8r` ring cells, and `Math.hypot(dx, dy)` is used where a squared distance orders the same candidates. Per-candidate object allocation added garbage on a path that runs for hundreds of settlers per tick.

## Fix / proposed fix

Visit only the ring perimeter in the same row-major order the square scan produced (identical tie-breaking), keep the best candidate as three scalars, and compare squared distances — `sqrt` is monotonic, so the chosen cell and the returned centre are unchanged. The function signature, owner and all callers stay as they were.

## Save/migration impact

None. No state, saved field or RNG draw changes; the returned point is identical.

## Verification result

- `npx vitest run tests/pathfinding.nearestWalkable.test.ts` — PASS (5): walkable pass-through, two-ring search, nearest-of-two in one ring, corner clamp, all-blocked `null`.
- `npx vitest run tests/pathfinding.test.ts tests/pathfinding.cliffCorners.test.ts tests/pathfinding.terrainRevision.test.ts tests/pathfinding.roadBudget.test.ts tests/workerMainThread.parity.test.ts` — PASS (19), including worker/main-thread parity.
- Scratch equivalence and micro-benchmark scripts under `tmp/` — 0 mismatches; 3.12 → 1.62 µs/call; both deleted after the run.
- CPU profile before/after at tier 1800 — PASS: 353 → 153 self samples.
- Wall-clock tick average was not used as evidence: repeated runs of the fixture vary by ±5 ms, which is larger than the expected saving.
