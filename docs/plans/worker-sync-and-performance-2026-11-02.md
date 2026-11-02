# Worker sync and performance implementation register — 2026-11-02

## Mini-RFC

**Problem:** worker admission can race the full census, rollback can lose elapsed sim time, stress tests can manufacture pool exhaustion, and full-state deltas/rebuilds are expensive at large population.

**Minimal change:** repair admission, rollback and buffer lifecycles first; eliminate demonstrably redundant render data and cache work; preserve a single authoritative worker, deterministic tick order and save semantics.

**Risk-impact:** P1 makes worker message dispatch asynchronous until the shared gate resolves. PERF8 increments the transient SimTickDelta protocol to 2. No persisted save migration, player rule, producer-colony policy or housing rule changes. Runtime verification and CI remain required.

## Work register

| ID | Status in this branch | Reason and verification requirement |
|---|---|---|
| P1 | Implemented and verified | Shared async name-pool gate now awaited before all worker dispatch. Gate regressions cover init/tick ordering and rejected loads. |
| P2 | Implemented and verified | Fallback accumulator debit occurs only after a successful tick. The rollback regression covers retained debt, one attempt per frame and recovery. |
| T1 | Implemented and verified at 5,000 ticks | Stress harness returns command/tick render buffers, detects outstanding leases, waits for export ack, and fails on incomplete run. |
| D1 | Implemented and verified | Pool now accepts only exact schema lengths. The stress regression covers 200,000 acquire/release cycles and invalid returns. |
| PERF1 | Implemented and measured; dirty sections still open | Redundant catalogue payload removed, event-log transfer limited to entries since the last acknowledged head, and the per-slot render sidecar moved off the wire (host rebuilds it from the buffer ids). Measured deltas, before -> after: huge 120-day V8 4,044,851 -> 2,749,091 (-32.0%), JSON 1,642,881 -> 1,439,671 (-12.4%); huge 3-day V8 3,897,476 -> 2,627,841 (-32.6%); medium 3-day V8 1,152,395 -> 774,651 (-32.8%); 120-settler render stress 3,085,389 -> 1,890,015 (-38.7%). Full alive entity snapshots remain authoritative; dirty section revisions still require a field matrix and boundary audit. |
| PERF2 | Partly implemented; benchmark required | Removed duplicate invalidate-before-hydrate passes and retains road avoidance, adjacency and beauty only across a verified unchanged building delta. Dirty-field ownership and save/import regression coverage are still required for broader retention. |
| PERF3 | Closed by adoption | `EntityCatalog.adoptWorldIndex` shares the validated authoritative lookup instead of rescanning entities per worker tick; the identity/removal regression lives in `tests/workerDisplayCache.ownership.test.ts`, and `rebuild` remains for save import, recovery and debug validation. |
| PERF4 | Implemented and verified | Worker passes the precomputed alive roster into render packing; parity regression pins render SoA and overflow ordering. |
| PERF5 | Open | Building fingerprint removal requires auditing all mutable building writers and ensuring revision bumps on every occupancy/staffing/upgrade/production change. Keep fingerprints until coverage is proven. |
| PERF6 | Implemented and verified | The six history families ship by per-world owner revisions (`bumpHistoryRevision`), so the worker no longer JSON-fingerprints grave, genealogy, population, yearly, chronicle and village-request history every tick. `tests/historyRevisions.test.ts` pins every owner bump, the yearly rollover and a seeded run in which any content change without a bump fails. |
| PERF7 | Partly implemented; profile required | Reuses worker render slot lookup and avoids a non-overflow copy; render metadata is now packed once on the host from the buffer ids instead of twice, and never crosses the port. Heap and overflow top-k allocations still require a 10,000-tick profile. |
| PERF8 | Implemented and verified | Removed unused catalogue entity payload; the transient delta protocol has since advanced to 3 for the render-sidecar move. Boundary audit is unchanged from the pre-change baseline and worker/main parity passes. |
| PERF9 | Existing behavior confirmed | Worker profiler samples stay behind the explicit enable flag with the 3,000 ms publication gap; no per-tick production logging was added. |
| PERF10 | Deliberately gated | Do not increase single in-flight production depth until end-to-end command ordering, upload/save barriers, held display buffer and memory tests establish safe additional slots. |

## Exact verification commands

```sh
npm ci --ignore-scripts
npm run test:types
npm run lint
npm run build
npm run audit:deps:cycles
npm run test:standard
npx vitest run tests/gameWorker.namePool.dispatchGate.test.ts tests/gameWorker.seed.test.ts tests/gameLoop.fallbackTickRollback.test.ts tests/renderBufferPool.stress.test.ts tests/renderPacking.aliveRosterParity.test.ts tests/renderMeta.hostParity.test.ts tests/workerDisplayCache.ownership.test.ts tests/workerMainThread.parity.test.ts
npx tsx scripts/worker-boundary-audit.mts
$env:TICKS='5000'; npx tsx scripts/repro-worker-stall.mts
```

## Verification (merged into `main`, 2026-11-02)

- `npm run test:types` — PASS. `npm run lint` — PASS, 0 errors (14 pre-existing warnings). `npm run build` — PASS, including the semantic-overlap gate after its pinned installer/handler fingerprint was refreshed for the changed handler body.
- Targeted suites above — PASS, 11 files / 28 tests (gate ordering and rejected load, fallback debt, pool stress, alive-roster parity, display-cache ownership, worker/main parity, decision registry).
- `TICKS=5000 npx tsx scripts/repro-worker-stall.mts` — PASS: 5,000 results, 0 errors, 5,007 render buffers received and 5,007 returned, 0 return failures, at most 1 lease outstanding, no pool exhaustion, p99 inter-result gap 27.6 ms, peak heap 59.8 MB, exit code 0.
- `npx tsx scripts/worker-boundary-audit.mts` — exits 1 with the same 13 measured differences / 4 unexplained findings as the pre-change `main` baseline (`graveRecords` ×2, `genealogyRegistry`, `nextBuildingId`); this change adds none.
- Render-sidecar move (per-slot metadata now rebuilt on the host): `tests/renderMeta.hostParity.test.ts` PASS (field-for-field parity, overflow slot order, and the render-enabled worker delta carries no sidecar); 20 affected suites / 113 tests PASS. Delta measurements on the same fixtures: huge 120-day V8 4,044,851 → 2,749,091 (-32.0%), JSON 1,642,881 → 1,439,671 (-12.4%), identical colony outcome (59 settlers) and a lower RSS peak; huge 3-day V8 3,897,476 → 2,627,841 (-32.6%), JSON 1,473,135 → 1,281,987 (-13.0%); medium V8 1,152,395 → 774,651 (-32.8%); the 120-settler render stress harness reports `renderDeltaV8Bytes` 3,085,389 → 1,890,015 (-38.7%). The perf harness's worker-transport phase is headless, so its number is unchanged by design.
- Long-horizon huge run (120 days, 34,560 ticks, forced GC): 0 stalled ticks, 0 invariant violations over 120 daily checks, tick p50 2.20 ms / p95 3.53 / p99 4.97, worker sample 0 fallbacks and 0 errors, delta V8 avg 2.75 MB, heap 39.9 → 91.2 MB (peak 91.2, peak RSS 594 MB). The pre-change run on the same seed reported the same colony outcome with a 635 MB RSS peak.
- `npm run test:standard`, `npm run audit:deps:cycles` and CI were not run in this session.
- Remaining measurement work: PERF2 cache-rebuild counts and PERF7 allocation profile, PERF5 building revisions, PERF10 pipeline depth.

## Save-scale round (2 November 2026, real 2,200-settler save)

Measured on `wilderfolk-New-Frontier-Y4-D64.json` (tick 329,744; 2,692 entities; 1,059 buildings; 2,027 living humans) with the existing harnesses (`scripts/perf-at-pop.ts` and `scripts/repro-worker-stall.mts`).

- Before: in-process avg 290 ms / p95 347 ms; worker `sim.totalTick` avg 739 ms, `realtime.tickHumans` 647 ms, `simulation.rollbackSnapshot` 58 ms, `worker.packRenderSoA` 6.3 ms, `worker.extractDelta` 1.4 ms; worker result gap p50 426 ms / p95 1111 ms / max 4804 ms; delta 6.79 MB (95 % `aliveEntities`).
- Caused by two O(settlers × buildings or entities) per-tick scans: hotel lodging asked every candidate hotel for its vacancy (scanning all entities per candidate) and the election ceremony ranked all attendees per settler.
- Fixes: one per-tick hotel list and settler-bed index with reserve/release, keeping a valid reservation without rescanning; one per-tick ceremony seat index (live single pass retained as the no-index fallback); PERF6 revisions remove the per-tick history JSON.
- After: in-process avg 95.6 ms / p50 75.9 / p95 122.3, throughput 10.46 ticks/s (was 290 ms / 4.0); worker `sim.totalTick` avg 227 ms, `tickHumans` 141 ms, rollback 54 ms, pack 6.2 ms, extract below the reported top sections; gap p50 244 ms / p95 325 ms / max 2444 ms (under the 2,500 ms stall threshold).
- Automatic staffing now keeps one per-building worker count for the whole pass, and the rebalance reuses that count for its cap instead of rescanning: the assignment pass fell from ~1.85 s to ~0.20 s (workforce.jobs), with the daily `sim.assign` at ~0.77 s including ~0.56 s of residence assignment.
- Copy-on-write for the relationship records landed: the snapshot shares `friendships`/`feuds`/`feudPeaks` and every writer replaces the record, so the rollback snapshot fell from 56.4 to 21.4 ms and `rollback.entities` from 54.6 to 19.6 ms per tick on the 2,200-settler save (the worker result-gap max dropped under the 2,500 ms stall threshold on that run). The remaining nested copies (career history, skills, needs, arrays) still cost ~10-18 ms.
- Rollback snapshot sections: `rollback.entities` is 54.6 of 56.4 ms; the shallow entity spread alone costs 9.3 ms, so the nested copies dominate (relationship records ≈32 ms before sharing).
- Residence assignment on load fell from 3.11 s to 2.21 s (-29%) after replacing the per-pair parent-array allocation with a per-unit kin index; an earlier attempt to check "needs reassignment" once per pass changed mid-pass convergence (moves update occupancy) and was reverted.
- Still open from this measurement: the 6.4 MB entity snapshot on the wire, the remaining rollback nested copies (~10-18 ms), the remaining load residence cost (~2.2 s, per-residence preference scoring), `workforce.rebalance` (~0.6 s) and the daily `assignMissingResidences` (~0.7 s).

Use identical seed/map/population and record tick p50/p95/p99, clone/delta bytes, worker gaps, heap after forced GC, catalog/cache rebuild counts, error/fallback counts and buffer counts before making a performance claim.

## Acceptance

Retain existing worker/main parity, producer-colony invariants, housing and career attendance rules, real-time work-hours application, and deterministic saves. No pipeline depth increase until validated. Record performance changes individually and keep the authoritative producer-colony and catalogue contracts unchanged.
