# Two worker-boundary robustness holes: control posts threw into React, and a boot-time session swap dropped the worker for good

- **Bug:** two failure paths around the worker boundary did not degrade like every other one. (1) `patchUiState`, `setPaused` and `setSpeed` called `postMessage` with no `try/catch`, unlike `sendCommand`/`exportSave`/`requestTick`/`returnRenderBuffer`, so a `DataCloneError` escaped synchronously into the caller — a React event handler — aborting the rest of that mutation. (2) the constructor's init completion path disposed the worker when the session had changed during boot and returned **without** scheduling recovery, so a player who loaded a save in the first second of a session ran on the main thread for the rest of it
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** 2026-09-16 worker-boundary audit, findings **F9** (low, suspected) and **F10** (low) (`docs/private/audits/2026-09-16/game-worker.md`); F10 runtime-reproduced there
- **Area:** worker (host control channel and boot lifecycle)
- **Owner module:** `src/game/simWorker/GameWorkerHost.ts` (F9), `src/game/gameLoop.ts` (F10)
- **Cadence:** per UI change / per control change (F9); once per session boot (F10)

## Status history

- 2026-09-16 — open (audit findings)
- 2026-09-16 — resolved (one `postControl` helper for the three fire-and-forget messages; recovery scheduled on the abandoned-boot branch)

## Observed behavior

```ts
// GameWorkerHost (before) — no guard on the fire-and-forget messages
setPaused(paused: boolean): void { … this.worker.postMessage(msg); }
```
```ts
// gameLoop.ts:175-188 (before) — the boot-abandoned branch returns without scheduleWorkerRecovery()
if (initGen !== this.sessionGen || !this.workerHost) {
  this.workerBooting = false;
  this.workerEnabled = false;
  if (initGen !== this.sessionGen) { this.workerHost?.dispose(); this.workerHost = null; }
  return;
}
```

Audit repro for the second: with `ready` delayed 300 ms and `setSession` called immediately, the worker
messages were just `init`, and `workerBooting: false, worker using: false` — main-thread ticks for the
session's whole lifetime, with no recovery attempt.

## Expected behavior

A control message that cannot be posted raises a worker fault and leaves the host able to retry (the
cached last-sent value must not pretend the value was delivered), exactly like the four messages that
already had a guard. A worker abandoned for any reason — including a session swap during boot — comes
back through the same `scheduleWorkerRecovery()` path every other failure uses, which inits with the
**current** world.

## Reproduction steps

1. F9: call `setPaused`/`setSpeed`/`patchUiState` with a payload the structured-clone algorithm rejects
   while a fake worker throws `DataCloneError` from `postMessage` — before the fix the exception
   propagates to the caller.
2. F10: headless, delay `ready` and call `setSession` immediately (the audit's
   `tmp/audit-2026-09-16/repro-boot-swap-deadlock.mts`); before the fix no recovery timer is scheduled.

## Evidence

- `src/game/simWorker/GameWorkerHost.ts` (before) — `try/catch` present in `sendCommand` (`:418-426`),
  `exportSave` (`:440-448`), `requestTick` (`:430-437`), `returnRenderBuffer` (`:446-450`); absent in
  `setPaused` (`:375-380`), `setSpeed` (`:382-388`) and `patchUiState` (`:390-406`).
- `src/game/gameLoop.ts:641-643` and the App handlers that call it — the throwing frame is a React
  event handler.
- `src/game/gameLoop.ts:175-188` vs `:196-212` — the `.catch` path schedules recovery, the
  session-changed branch does not; `attemptWorkerRecovery` (`:255-302`) inits with `this.world`, i.e.
  the loaded session, so recovery is the right repair rather than a re-import.

## Root cause

Two omissions rather than a design error: a guard added to the request/response messages but not to the
fire-and-forget controls, and a recovery call added to the failure path but not to the
abandoned-boot path. Both are invisible to the gates because neither needs a live worker to compile or
test.

## Regression test

Covered by the F1 regression file, which already drives the boot/swap lifecycle
(`tests/gameLoop.sessionSwapWorker.test.ts`, 3 tests: the deadlock case, the boot-wait case, and the
stop-mid-import case), plus `tests/gameLoop.speedControl.test.ts` (3) for the control path. F9's guard
is a small, self-evident wrapper with no observable behaviour when `postMessage` succeeds — a test that
mocks a throwing `Worker` would assert the harness rather than the product, so it is deliberately not
added; the audit's own repro is the evidence. Disclosed rather than hidden.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant
assertions satisfied. Neither change touches simulation state.

## Save/migration impact

None.

## Verification result

- `npx vitest run tests/gameLoop.sessionSwapWorker.test.ts tests/gameLoop.speedControl.test.ts tests/gameLoop.commandDispatch.test.ts tests/gameLoop.diagnostics.test.ts` — passed (18 tests).
- `npm test` — passed: 160 files / 865 tests, 0 failures.
- `npm run build`, `npm run lint` (0/0), `npm run test:types` — passed.
- `npm run test:full-year`, `npm run test:browser` — passed.

## Related commits or files

- `src/game/simWorker/GameWorkerHost.ts` — `private postControl(msg)` used by `setPaused`, `setSpeed`
  and `patchUiState`; `lastPausedSent`/`lastSpeedSent` are cleared when the post fails
- `src/game/gameLoop.ts` — `scheduleWorkerRecovery()` on the session-changed boot branch

## Fix

F9: the three fire-and-forget posts now go through one `postControl(message)` that catches, logs and
raises `onWorkerFault('general', …)`, returning whether the message left the thread. `setPaused` and
`setSpeed` reset their "last sent" cache when it did not, so the next change is posted instead of being
suppressed as a duplicate.

F10: the abandoned-boot branch calls `scheduleWorkerRecovery()`. `attemptWorkerRecovery` inits a new
host with `this.world` — the loaded session — and imports it, so the player gets worker offload back
instead of silently running on the main thread until the next page load.
