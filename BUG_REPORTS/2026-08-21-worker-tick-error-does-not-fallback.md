# Bug: Worker tick errors do not trigger an immediate fallback

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: Manus AI worker audit
- Area: worker | Truth | Play
- Owner module: `src/game/simWorker/GameWorkerHost.ts` and `src/game/gameLoop.ts`
- Cadence: realtime worker tick transport

## Status history

- 2026-08-21 — open (static audit of worker error handling)
- 2026-08-21 — fixed (added a typed tick-fault callback and reused the existing GameLoop fallback path)
- 2026-08-21 — verified (focused worker tests: 2 files / 17 tests; full suite: 51 files / 338 tests)

## Observed behavior

When the browser worker posts an `error` response with `source: 'tick'`, `GameWorkerHost.handleMessage()` decrements `ticksInFlight` and rejects pending command/export promises, but it does not notify `GameLoop` that the worker is unhealthy or force fallback. The loop can remain in worker mode and continue requesting ticks after a tick failure.

## Expected behavior

A tick-level worker error should mark the worker unhealthy and cause one controlled fallback to the main-thread simulation, restoring the last authoritative worker shadow before disposal. The player should receive a diagnostic warning, not a silent retry loop or frozen simulation.

## Evidence

`GameWorkerHost.ts` handles `msg.type === 'error'` by logging, decrementing tick count for `source === 'tick'`, and clearing pending promises. `GameLoop.ts` only disposes the worker through the stall watchdog when `hasTickInFlight()` remains true beyond its timeout. A tick error clears that flag, so the watchdog condition may never fire.

Existing tests cover command rejection and stall fallback, but no test covers a worker `tick` error response followed by recovery.

## Root cause

The worker host has no fatal-error callback or unhealthy state consumed by GameLoop. Tick errors are treated as ordinary message failures rather than a transport-health failure.

## Fix

Implemented. `GameWorkerHost` now exposes a typed worker-fault callback and reports tick errors after clearing in-flight state. `GameLoop` uses the existing restore-authoritative-shadow, dispose, and main-thread-resume path shared with stall fallback. The fallback is idempotent because it returns immediately once worker mode is disabled.

## Regression test

Added a GameLoop regression that injects a tick error and asserts worker disposal, authoritative-state restoration, and main-thread mode afterward.

## Invariants checked

Worker-owned state remains authoritative until fallback. Optimistic commands must be reverted before disposal. No second simulation mutation path may be introduced.

## Save/migration impact

No save schema impact expected.

## Verification result

Focused worker tests passed: 2 files / 17 tests. Full suite passed: 51 files / 338 tests. Scoped ESLint passed for the changed files. TypeScript/build checks remain blocked by the pre-existing TypeScript 6 deprecation error for `baseUrl` in `tsconfig.app.json`; this change did not modify that configuration.

## Related files

- `src/game/simWorker/GameWorkerHost.ts`
- `src/game/gameLoop.ts`
- `tests/gameLoop.commandDispatch.test.ts`
- `tests/workerCommand.roundtrip.test.ts`

