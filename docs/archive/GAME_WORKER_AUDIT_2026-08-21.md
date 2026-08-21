# Game Worker Health Audit

- Date: 2026-08-21
- Version/build: 0.6.1.1
- Scope: Browser worker, Node shim, GameWorkerHost, GameLoop, command transport, tick pipeline, fallback, render buffers, and tests
- Status: audit complete; one confirmed reliability gap recorded, no worker code changed in this audit

## Executive result

The worker architecture is **mostly functioning correctly**. The important reliability guarantees are present and tested: worker boot is gated, ordinary commands do not wait for idle, commands use FIFO dispatch, optimistic UI state is reconciled by an authoritative result, stale tick deltas do not overwrite pending command feedback, render buffers are pooled and transferred, and stalled-worker fallback restores the authoritative shadow before disposal.

The focused worker suite passed **2 test files / 16 tests**. The full project suite previously passed **52 test files**. However, the automated tests do not start a real browser `Worker`; they exercise shared worker logic, Node shims, and fake GameWorkerHost handlers. Real browser module loading and browser-specific transport failures remain unproven.

## What is working well

| Area | Assessment | Evidence |
|---|---|---|
| Worker startup | Good | `GameWorkerHost.init()` validates protocol/features, has a three-second init timeout, and listens for script errors |
| Main-thread split-brain protection | Good | `GameLoop` holds ticks while `workerBooting` and re-syncs the world after worker initialization |
| Command latency | Good | `applyCommand()` applies the shared command implementation optimistically and dispatches without waiting for worker idle |
| Command ordering | Good | `commandChain` serializes host dispatch while worker message order remains FIFO |
| Authoritative reconciliation | Good | `commandResult` replaces the display world; failed commands revert the optimistic state |
| Stalled worker | Good | watchdog restores the worker shadow before disposing the host and switching to main-thread ticks |
| Render transport | Good | render SoA buffers are pooled, transferred, adopted, and returned; pool exhaustion restores prep state and reports a tick error |
| Node parity | Good but limited | Node shim executes the shared browser worker module and command tests validate the shared domain path |
| Browser integration | Gap | No real browser-worker integration test file is present |

## Confirmed issue

A tick-level worker error does not immediately trigger fallback. In `GameWorkerHost.handleMessage()`, an error response with `source: 'tick'` decrements `ticksInFlight` and clears pending promises, but does not mark the worker unhealthy or notify `GameLoop`. The stall watchdog depends on `hasTickInFlight()` remaining true; after the error clears that flag, the watchdog may not fire. The loop can remain in worker mode and continue requesting ticks after a failed tick.

This is recorded in:

`BUG REPORTS/2026-08-21-worker-tick-error-does-not-fallback.md`

The preferred repair is a narrow one-shot worker-fault signal: GameWorkerHost reports a tick transport fault, GameLoop restores the authoritative shadow, disposes the worker through the existing fallback path, and resumes main-thread ticking. This should not add another simulation owner or mutate gameplay state outside existing boundaries.

## Important limitation in current tests

The current worker-related test surface contains:

- `tests/gameLoop.commandDispatch.test.ts`
- `tests/workerCommand.roundtrip.test.ts`

These tests prove command semantics, optimistic reconciliation, fake-host ordering, stall fallback, and shared-command parity. They do **not** prove that a real browser can load `gameWorker.ts` as a module, initialize the dialogue bank, transfer render buffers, return buffers after rendering, or recover from browser `error` events and `postMessage` failures.

`gameWorker.node.ts` is intentionally a Node `worker_threads` shim. It validates the shared module and message shape, but it is not a browser transport test.

## Recommended improvements, in priority order

### 1. Fix tick-error fallback

Add a typed `onWorkerFault` or equivalent one-shot signal from `GameWorkerHost` to `GameLoop`. Treat tick errors, protocol mismatches, invalid render buffers, and unrecoverable transfer failures as worker-health failures. Reuse the existing authoritative restore-before-dispose fallback path. Add a regression test for a tick error, optimistic command state, disposal, and continued main-thread ticks.

### 2. Add a real browser-worker smoke test

Run a small Playwright or browser-harness test against the built worker module. The test should initialize a minimal world, wait for `ready`, send one tick, verify a `tickResult`, return the render buffer, send a command, verify the command result, and terminate cleanly. This is the highest-value missing coverage because current tests cannot detect browser-only module, transfer, or worker lifecycle failures.

### 3. Add transport fault injection

Test `Worker` script error, init timeout, `postMessage` throw, protocol mismatch, render pool exhaustion, malformed render buffer, and worker termination while an optimistic command is pending. Each case should assert no stuck command promise, no stale optimistic state, no split-brain world, and a deterministic fallback or user-visible error.

### 4. Improve observability

Expose a small development-only worker health snapshot containing worker state, generation, ticks in flight, last activity time, smoothed tick latency, last error source, fallback count, and render-pool availability. Log only transitions and sampled latency, not every tick, so diagnostics remain cheap.

### 5. Measure before optimizing bundle/chunk structure

The prior production build reported a circular `game-render`/`game` chunk and a large worker bundle. Do not change manual chunks speculatively. First measure worker startup time, first-ready latency, first-tick latency, transfer size, and fallback frequency in a production build. Then split only modules proven to affect startup or frame responsiveness.

### 6. Keep the fallback path boring

The worker and main-thread paths already share `applyWorkerCommand()`. Preserve that rule. Do not create a second worker-only command implementation, second gameplay clock, or special fallback simulation rules. The fallback should differ only in execution host, not gameplay behavior.

## Validation record

Focused command/worker tests completed successfully:

```text
Test Files  2 passed (2)
Tests       16 passed (16)
```

The broader project suite previously completed with **52 test files passed**. No code changes were made during this worker audit, so no new full-suite run was required after the audit-only report.

## Simulation Change Record

- Owner module: Audit only; no gameplay owner changed
- Decision changed: None in this audit
- Cadence: Realtime worker transport and command boundary reviewed
- State fields written: None by the audit
- Player-visible behavior before: Worker-driven simulation with main-thread fallback
- Player-visible behavior after: No behavior change from this audit
- Performance impact: None; recommendations require measurement before implementation
- New or updated tests: None; existing focused suite passed
- Invariants checked: Authoritative worker shadow, optimistic reconciliation, command ordering, and fallback behavior reviewed
- Save/migration impact: None
- Rollback plan: No code rollback required; remove or supersede this audit record
