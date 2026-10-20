# Roadmap performance implementation — 20 October 2026

## Scope and evidence

Base: `46b4890` on `Rengerams/wilderfolk`. Linux x64, Node 24.19.0, npm lockfile install. The workspace is Bash, not the Windows shell described in the local engineering instructions.

Use the existing `scripts/perf-at-pop.ts` harness; no separate game harness was created. The supplied day-267 save has 1,689 living player settlers and 1,051 buildings. Runs use 12 warmup ticks plus 72 measured ticks and the normal viewport focus. Timing on this shared host is descriptive, not a CI threshold or Windows/browser FPS measurement.

The first unprofiled baseline averaged 937.49 ms/tick (p95 3,828.02 ms). The profiled baseline recorded 13,380 A* calls, 46.60 seconds total in A*, and 13.84 seconds in automatic job staffing over 72 measured ticks. Nested profiler stages overlap and must not be summed.

## Implementation

- One synchronous, generation-stamped A* workspace per realm, resized for a new grid size and released by the existing cache-reset API. Float64 scores preserve JS arithmetic and deterministic heap ordering; the search limit, neighbor order and smoothing are unchanged.
- The existing route cache holds at most 4,096 entries, with LRU refresh. A changed destination invalidates a route; a failed route is retried after its origin tile changes. Map/topology invalidation still clears all routes. This improves reuse without a second routing cache.
- The social grid consumes the pre-existing human bucket. Full reconciliation still handles movement, replacements and removals.
- Commute eligibility first checks both speed bounds; only ambiguous distances need road sampling. The road loop rejects non-road buildings once instead of once per sample.
- Automatic rebalancing builds one assignment/eligible-donor index and updates it after each transfer. Donor ranking, stable ties, manual staffing, minimum crews and cooldowns retain their owner rules.
- Opt-in profiling stores at most 512 duration samples per stage. Percentiles summarize that rolling window; totals, maxima and one-second overrun counts span the full measurement. Disabled profiling does not allocate samples or read the timing clock at instrumentation sites.
- Production eliminates the conditional dynamic imports of developer panels. The live `?debug=1` browser smoke remains pending because this environment has no installed browser.

## Reproduction

```bash
PERF_SAVE='/absolute/path/to/save.json' PERF_TICKS=72 PERF_WARMUP=12 PERF_PROFILE=1 PERF_ROUNDTRIP=1 PERF_REPORT=tmp/report.json node --import tsx scripts/perf-at-pop.ts
PERF_POPS=250,750,1800,3000 PERF_TICKS=72 PERF_WARMUP=12 PERF_PROFILE=1 PERF_SEED=12345 PERF_REPORT=tmp/tiers.json node --import tsx scripts/perf-at-pop.ts
```

Set `PERF_BASELINE=tmp/baseline.json` for the existing comparison output. Run before/after sequentially on the same hardware. JSON reports include wall/CPU times, percentiles, over-budget ticks, stage timings, population/relationship summaries and optional roundtrip timings. Delta hashes include presentation timestamps and are not deterministic gameplay equality checks.

## Verification and limitations

Final reports are in `docs/log/performance-roadmap-2026-10-20.json`.

| Same day-267 save, 72 measured ticks | Base | Optimized | Optimized repeat |
|---|---:|---:|---:|
| Average wall time / tick | 1,478.15 ms | 385.69 ms | 310.90 ms |
| p95 wall time / tick | 4,997.54 ms | 1,340.42 ms | 1,188.11 ms |
| Over 1,000 ms | 26 / 72 | 6 / 72 | 5 / 72 |
| A* calls | 13,380 | 2,214 | 2,214 |

The earlier unprofiled base was 937.49 ms/tick; host contention clearly affects timing. The reduction in search count is more robust evidence than a percentage speed claim. Optimized repeats match population and relationship summaries. Base versus optimized has identical population, marriages, pregnancies, youth-love and affair counts, but 123 versus 122 courtships: retaining routes changes movement and therefore encounters. This is not a bit-for-bit gameplay replay claim.

Generated-tier averages (6 warmup + 24 measured ticks) were 9.22 / 24.70 / 103.11 / 286.63 ms for 250 / 750 / 1,800 / 3,000 player settlers. These short, lightly housed fixtures do not represent the saved colony's buildings or relationship graph; all four reported zero simulation invariant errors. The other supplied saves were loaded, simulated and roundtripped too; day-247/day-252/later-day-267 averages were 502.43 / 462.72 / 255.43 ms across 12 measured ticks each.

All simulated saves reported zero final simulation invariant errors. Save/reload retained each player population but exposed pre-existing duplicate residence membership in the supplied saves (8 or 16 errors); the principal base and optimized runs produce the same 16 errors. These are recorded separately rather than suppressed. Live UI/Windows validation is pending.

The user-provided profiler independently showed 14,069 A* calls in 51 ticks, 768.5 ms average / 9,339.7 ms maximum worker ticks, 8.09 ms average draw time and main-thread staffing despite worker authority. A later log showed a 12,202 ms worker silence, main-thread fallback and a 12,789 ms main frame before recovery.

Command responsiveness changes prevent colony-wide optimistic replay on the main thread. Only venue-hour changes and explicit single-worker assignments preview immediately. Pending commands stop new tick submissions so the queue drains; worker recovery suspends simulation advancement and defers commands while preserving UI drawing. Unconfirmed commands replay in order against the last confirmed state after restart; a command epoch prevents the old promise chain from duplicating them. Unsupported runtimes still use the local fallback. Three regression cases failed before these fixes and pass afterward: command replay, command starvation and fallback ticks during recovery.

Typecheck, lint, production build and source/document/comment guards passed. The final selected regression run passed 126 tests across 16 files, covering game-loop recovery, command draining, worker commands, pathfinding, profiler, commute, staffing and transfers. Production bundle inspection found no unique profiler or simulation-diagnostics panel strings. The browser smoke harness was attempted and blocked because Chrome is not installed. Existing yearly-spawn and worker-boundary failures reproduce unchanged on the base checkout; neither was skipped or weakened. Do not infer that all performance roadmap items are complete: browser rendering, Windows desktop behavior, worker transfer costs, incremental terrain graph updates and long-run raid/school scenarios remain separate work.

## Leader household follow-up

The supplied residence-change logs exposed a guard-order defect: `housingUnitNeedsReassignment` checked ordinary capacity before its existing manor exemption. An oversized leader household was therefore reassigned before the exemption could run. The exemption now runs first only when every household member already shares that manor. A regression covers repeated full convergence and manor identifier zero; ordinary and split-family repairs retain normal validation. Earlier timing and roundtrip records above intentionally remain the pre-follow-up measurements.

A split-family regression also reproduced generic convergence moving manor residents into the partner's ordinary home. Generic housing units now leave any current manor household to the leader owner; that owner rebuilds residence occupant lists when moving a household, clearing the previous homes immediately. This follows the existing ownership rule and keeps genealogy/adoption inputs intact.

Final follow-up validation: 21 leadership/residency regressions pass. The supplied day-267 save was loaded, advanced 24 ticks (12 warmup plus 12 measured), saved and reloaded: player population is preserved and both simulation and roundtrip invariant lists are empty. The earlier 16 duplicate-residence errors are absent after the owner-reconciliation fix. Typecheck, lint, production build and source guards pass after this follow-up.

An additional housing regression run passed 24 of 25 cases; the day-boundary fixed-point case fails unchanged on the base (5 of 6 pass there). It remains recorded rather than weakened. The earlier 126 performance/command regressions and 21 targeted leader/residency regressions pass.

The final branch integrates main commit `25d619a`, which changed raid-choice behavior during the work. That upstream behavior is preserved unchanged; the initial unreachable-branch build fix is superseded by main and is not a performance change. Benchmark baselines remain explicitly anchored to `46b4890`.
