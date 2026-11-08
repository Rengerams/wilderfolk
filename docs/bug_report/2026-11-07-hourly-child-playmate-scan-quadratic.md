# Every child rescans the whole neighbourhood for a playmate on the same hourly tick

- Bug: the hourly child-leisure refresh makes the whole colony of children scan their neighbourhood in one tick, and the scan collects every nearby child, so a crowded colony pays a quadratic cost every hour.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (A8, the unprofiled 3,000-tier spike)
- Reporter: A8/PERF follow-up profiling of the city harness
- Area: realtime settler AI / spatial queries
- Owner module: `humanLeisureBehavior.ts`, `adaptiveSpatialQuery.ts`, `spatialGrid.ts`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: hourly boundary tick measured at 1.5–2.5 s in the 3,000-settler tier; CPU profile attributes 80.8 % of self time to the child playmate scan.
- 2026-11-07 — resolved: the candidate list is bounded and the shared spatial walk can stop early.

## Observed behavior
In the city harness tier of 3,000 player humans, every 12th tick (the start of a clock hour) cost about two seconds against roughly 90 ms for an ordinary tick, so the p95 tick was 1,852 ms and the run peaked at 2,481 ms (4.22 ticks/s). A V8 profile of one boundary tick (1,494 ms, seeds 12345) put 90.8 % of total time in `tickHumanChildLeisure`; the anonymous spatial-query callback carried 80.8 % of self time and the tick visited 7.7 million candidates, because each of 2,998 player children built a list of every other child within 96 px (2,566 on average).

The refresh is keyed on the global hourly bucket (`CHILD_PLAYMATE_REFRESH_TICKS = TICKS_PER_HOUR`), so every child rebuilds its cache on the same tick, and nothing bounded how many neighbours that list held.

## Expected behavior
A child chooses *a* nearby playmate; the selection must not scale with the total number of children inside the social radius, and no hourly tick may cost seconds.

## Reproduction steps
1. `npx tsx scripts/perf-at-pop.ts` with `PERF_POPS=3000 PERF_TICKS=300 PERF_WARMUP=10 PERF_TRACE=1`; every twelfth traced tick costs ~2 s.
2. Profile one boundary tick (tick 132 in the same fixture) to see the playmate scan as the leaf cost.

## Evidence
- Before: 3,000 tier average 236.8 ms, p95 1,852.2 ms, max 2,481.0 ms, 4.22 ticks/s; one boundary tick 1,494 ms of which `realtime.tickHumans` was 1,470.6 ms.
- After: 3,000 tier average 105.9 ms, p95 150.1 ms, max 303.4 ms, 9.45 ticks/s; the same boundary fixture tick now costs 104.1 ms with `realtime.tickHumans` at 82.7 ms.
- 1,800 tier: average 64.1 ms, p95 100.2 ms.

## Root cause
The play roll gates the scan, but a passing child still materialises the complete list of nearby children, and the hourly bucket makes all children do it on one tick. In a settlement whose children stand within one social radius the pairs grow quadratically.

## Fix / proposed fix
`forEachAdaptiveInRadius` and `EntitySpatialGrid.forEachInRadius` accept a callback that returns `false` to stop the walk; `tickHumanChildLeisure` stops after `CHILD_PLAYMATE_CANDIDATE_LIMIT` (32) candidates. A realistic neighbourhood holds fewer than 32 children, so those colonies keep the exact previous selection; only an over-dense neighbourhood chooses among the first 32 candidates instead of the whole crowd.

## Save/migration impact
None; the playmate cache is runtime-only.

## Verification result
- `npx vitest run tests/adaptiveSpatialQuery.earlyStop.test.ts tests/humanLeisureBehavior.test.ts` — PASS (7).
- `npx vitest run` on the worker parity, grid-sync, delta, rollback and dialogue suites — PASS (67).
- `npm run test:types` — PASS.
- `scripts/perf-at-pop.ts` tiers 1800/3000 before and after — recorded above.
- The fixture packs 3,000 settlers into a few grid cells, so the cap binds there; a spread settlement sees far fewer children within 96 px. The change was not measured against the owner's own save.
