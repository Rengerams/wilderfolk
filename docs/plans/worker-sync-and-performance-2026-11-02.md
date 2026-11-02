# Worker sync and performance implementation register — 2026-11-02

## Mini-RFC

**Problem:** worker admission can race the full census, rollback can lose elapsed sim time, stress tests can manufacture pool exhaustion, and full-state deltas/rebuilds are expensive at large population.

**Minimal change:** repair admission, rollback and buffer lifecycles first; eliminate demonstrably redundant render data and cache work; preserve a single authoritative worker, deterministic tick order and save semantics.

**Risk-impact:** P1 makes worker message dispatch asynchronous until the shared gate resolves. PERF8 increments the transient SimTickDelta protocol to 2. No persisted save migration, player rule, producer-colony policy or housing rule changes. Runtime verification and CI remain required.

## Work register

| ID | Status in this branch | Reason and verification requirement |
|---|---|---|
| P1 | Implemented, not CI-verified | Shared async name-pool gate now awaited before all worker dispatch. Verify init/tick ordering and rejected loads. |
| P2 | Implemented, not CI-verified | Fallback accumulator debit occurs only after a successful tick. Verify rollback and recovery. |
| T1 | Implemented, not runtime-verified | Stress harness returns command/tick render buffers, detects outstanding leases, waits for export ack, and fails on incomplete run. Verify 5,000 render ticks. |
| D1 | Implemented, not CI-verified | Pool now accepts only exact schema lengths. Stress 200,000 acquire/release cycles and invalid returns. |
| PERF1 | Partly implemented; benchmark required | Redundant human catalogue transfer removed. Full alive entity snapshots are still authoritative; design dirty section revisions after boundary audits and baseline delta measurements. Target at least 30% average delta reduction. |
| PERF2 | Partly implemented; benchmark required | Removed duplicate invalidate-before-hydrate passes. Selective cache retention requires a proved dirty-field ownership model and save/import regression tests. |
| PERF3 | Open | Incremental EntityCatalog needs authoritative add/update/remove revisions across worker commands, ticks and session swaps; no unsafe shadow catalogue introduced. |
| PERF4 | Implemented, not CI-verified | Worker passes precomputed alive roster into render packing; no duplicate full-roster filter. Compare render SoA and overflow ordering. |
| PERF5 | Open | Building fingerprint removal requires auditing all mutable building writers and ensuring revision bumps on every occupancy/staffing/upgrade/production change. Keep fingerprints until coverage is proven. |
| PERF6 | Open | History fingerprint removal requires revision writes for all six history families, plus save/load/import/rollback integration. No reference-equality shortcuts allowed. |
| PERF7 | Partly implemented; profile required | Reuses worker render slot lookup and avoids a non-overflow copy. Heap and overflow top-k allocations still require a 10,000-tick profile. |
| PERF8 | Implemented, not CI-verified | Removed unused catalogue entity payload; bumped transient delta protocol. Boundary audit and parity required. |
| PERF9 | Existing behavior confirmed, verify in stress | Worker profiler samples already gated by explicit enable flag and a minimum 3,000 ms publication gap; regular production tick logging should remain absent. |
| PERF10 | Deliberately gated | Do not increase single in-flight production depth until end-to-end command ordering, upload/save barriers, held display buffer and memory tests establish safe additional slots. |

## Exact verification commands

```sh
npm ci --ignore-scripts
npm run test:types
npm run lint
npm run build
npm run audit:deps:cycles
npm run test:standard
npx vitest run tests/gameWorker.namePool.dispatchGate.test.ts tests/gameWorker.seed.test.ts tests/gameLoop.fallbackTickRollback.test.ts tests/renderBufferPool.stress.test.ts tests/workerMainThread.parity.test.ts
npx tsx scripts/worker-boundary-audit.mts
TICKS=5000 node --expose-gc --import tsx scripts/repro-worker-stall.mts
```

The GitHub connector cannot execute these in a checkout, and this branch has not passed these commands locally. CI may expose additional integration fixtures to correct. Use identical seed/map/population and record tick p50/p95/p99, clone/delta bytes, worker gaps, heap after forced GC, catalog/cache rebuild counts, error/fallback counts and buffer counts before making a performance claim.

## Acceptance

Retain existing worker/main parity, producer-colony invariants, housing and career attendance rules, real-time work-hours application, and deterministic saves. No pipeline depth increase until validated. Record performance changes individually and keep the authoritative producer-colony and catalogue contracts unchanged.
