# Worker sync and performance implementation register — 2026-11-02

## Mini-RFC

**Problem:** worker admission can race the full census, rollback can lose elapsed sim time, stress tests can manufacture pool exhaustion, and full-state deltas/rebuilds are expensive at large population.

**Minimal change:** repair admission, rollback and buffer lifecycles first; eliminate demonstrably redundant render data and cache work; preserve a single authoritative worker, deterministic tick order and save semantics.

**Risk-impact:** P1 makes worker message dispatch asynchronous until the shared gate resolves. The incremental entity delta advances the transient SimTickDelta protocol to 3. No persisted save migration, player rule, producer-colony policy or housing rule changes. Runtime verification and CI remain required.

## Work register

| ID | Status in this branch | Reason and verification requirement |
|---|---|---|
| P1 | Implemented; final CI pending | Every worker request awaits the same name-load gate and a rejected load cannot partially dispatch. |
| P2 | Implemented; final CI pending | Local fallback tick time is debited only after success; rollback and recovery regression added. |
| T1 | Implemented; render stress pending | Return and count all tick/command buffers, verify real save export, and run 5,000 ticks plus 1,000 refresh commands. |
| D1 | Implemented; final CI pending | Exact buffer lengths, invalid releases and 200,000 acquisition cycles covered. |
| PERF1 | Implemented; size benchmark pending | Versioned entity-change transport sends only changed entities, removed ids and authoritative order on structural change, with full fallback; history and event tails also reduced. |
| PERF2 | Implemented; parity benchmark pending | Acknowledged empty building diffs preserve geometry caches; entity, scent and transient caches still refresh. |
| PERF3 | Implemented; parity benchmark pending | EntityCatalog adopts the already rebuilt canonical lookup on worker ticks instead of scanning the full alive roster twice; full rebuild retained for recovery and commands. |
| PERF4 | Implemented; byte parity pending | Render packing receives the worker's already filtered alive list. |
| PERF5 | Implemented through equivalent change detection; benchmark pending | Replace per-building JSON serialization with reusable independent structural snapshots; accurately detect nested array, occupant, upgrade and construction changes without auditing every writer. |
| PERF6 | Implemented with hybrid revisions; benchmark pending | Five histories use actual owner-marked revisions; genealogy uses full structural comparison because additional writers mutate it. No normal history JSON fingerprint remains. |
| PERF7 | Implemented in safe allocation paths; heap profile pending | Reuse alive lists and slot lookup scratch, avoid unneeded non-overflow copies; preserve overflow result isolation. |
| PERF8 | Implemented; boundary audit pending | Remove unused duplicated catalogue humans, transient delta protocol now 3; full/patch path must pass parity. |
| PERF9 | Implemented; profile verification pending | Existing worker profiling is opt-in and throttled; identical worker errors are now aggregated in host logs while faults still propagate. |
| PERF10 | Default depth 2 implemented; performance proof pending | Reserve one display and one command buffer, bound at depth 3 with five slots, and block further ticks during command/upload/export. Tests cover depth 1–4 clamp. |

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
TICKS=5000 COMMANDS=1000 PERF_MEASURE=1 node --expose-gc --import tsx scripts/repro-worker-stall.mts
```

The GitHub connector cannot execute these in a checkout, and this branch has not passed these commands locally. CI may expose additional integration fixtures to correct. Use identical seed/map/population and record tick p50/p95/p99, clone/delta bytes, worker gaps, heap after forced GC, catalog/cache rebuild counts, error/fallback counts and buffer counts before making a performance claim.

## Acceptance

Retain existing worker/main parity, producer-colony invariants, housing and career attendance rules, real-time work-hours application, and deterministic saves. Pipeline depth two is enabled in the branch but must be reverted if the dedicated transport stress or performance comparison fails. Record performance changes individually and keep the authoritative producer-colony and catalogue contracts unchanged.
