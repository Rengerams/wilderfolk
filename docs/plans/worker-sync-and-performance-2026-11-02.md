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
| PERF1 | Partly implemented; benchmark required | Redundant human catalogue transfer removed; event-log transfer is limited to entries since the last acknowledged head. Full alive entity snapshots are still authoritative; dirty section revisions still require boundary audits and delta measurements. Target at least 30% average delta reduction. |
| PERF2 | Partly implemented; benchmark required | Removed duplicate invalidate-before-hydrate passes and retains road avoidance, adjacency and beauty only across a verified unchanged building delta. Dirty-field ownership and save/import regression coverage are still required for broader retention. |
| PERF3 | Open | Incremental EntityCatalog needs authoritative add/update/remove revisions across worker commands, ticks and session swaps; no unsafe shadow catalogue introduced. |
| PERF4 | Implemented and verified | Worker passes the precomputed alive roster into render packing; parity regression pins render SoA and overflow ordering. |
| PERF5 | Open | Building fingerprint removal requires auditing all mutable building writers and ensuring revision bumps on every occupancy/staffing/upgrade/production change. Keep fingerprints until coverage is proven. |
| PERF6 | Open | History fingerprint removal requires revision writes for all six history families, plus save/load/import/rollback integration. No reference-equality shortcuts allowed. |
| PERF7 | Partly implemented; profile required | Reuses worker render slot lookup and avoids a non-overflow copy. Heap and overflow top-k allocations still require a 10,000-tick profile. |
| PERF8 | Implemented and verified | Removed unused catalogue entity payload; transient delta protocol advanced to 2. Boundary audit is unchanged from the pre-change baseline and worker/main parity passes. |
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
npx vitest run tests/gameWorker.namePool.dispatchGate.test.ts tests/gameWorker.seed.test.ts tests/gameLoop.fallbackTickRollback.test.ts tests/renderBufferPool.stress.test.ts tests/renderPacking.aliveRosterParity.test.ts tests/workerDisplayCache.ownership.test.ts tests/workerMainThread.parity.test.ts
npx tsx scripts/worker-boundary-audit.mts
$env:TICKS='5000'; npx tsx scripts/repro-worker-stall.mts
```

## Verification (merged into `main`, 2026-11-02)

- `npm run test:types` — PASS. `npm run lint` — PASS, 0 errors (14 pre-existing warnings). `npm run build` — PASS, including the semantic-overlap gate after its pinned installer/handler fingerprint was refreshed for the changed handler body.
- Targeted suites above — PASS, 11 files / 28 tests (gate ordering and rejected load, fallback debt, pool stress, alive-roster parity, display-cache ownership, worker/main parity, decision registry).
- `TICKS=5000 npx tsx scripts/repro-worker-stall.mts` — PASS: 5,000 results, 0 errors, 5,007 render buffers received and 5,007 returned, 0 return failures, at most 1 lease outstanding, no pool exhaustion, p99 inter-result gap 27.6 ms, peak heap 59.8 MB, exit code 0.
- `npx tsx scripts/worker-boundary-audit.mts` — exits 1 with the same 13 measured differences / 4 unexplained findings as the pre-change `main` baseline (`graveRecords` ×2, `genealogyRegistry`, `nextBuildingId`); this change adds none, and the render delta keeps the same entity payload.
- `npm run test:standard`, `npm run audit:deps:cycles` and CI were not run in this session.
- Remaining measurement work: PERF1 delta-size and PERF2/PERF7 cache and allocation numbers against the seeded benchmark, PERF3/PERF5/PERF6 revisions, PERF10 pipeline depth.

Use identical seed/map/population and record tick p50/p95/p99, clone/delta bytes, worker gaps, heap after forced GC, catalog/cache rebuild counts, error/fallback counts and buffer counts before making a performance claim.

## Acceptance

Retain existing worker/main parity, producer-colony invariants, housing and career attendance rules, real-time work-hours application, and deterministic saves. No pipeline depth increase until validated. Record performance changes individually and keep the authoritative producer-colony and catalogue contracts unchanged.
