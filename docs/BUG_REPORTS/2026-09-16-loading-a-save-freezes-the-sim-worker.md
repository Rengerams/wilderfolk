# Loading a save mid-session sets `workerBooting` and then waits on that same flag, freezing the loaded village forever

- **Bug:** `GameLoop.adoptWorldSession()` sets `this.workerBooting = true` whenever the sim worker is
  enabled and ready (`gameLoop.ts:458-460`), and the import chain it queues immediately afterwards
  waits `while (this.workerBooting && …)` (`:497-499`) while being the **only** code that clears that
  flag (`:510`) — after the `importSave` the wait is blocking. Any in-game session replacement on a
  live worker loop therefore never posts the import, never requests a tick on either path, and defers
  every player command forever: the loaded village is permanently frozen
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous full-audit pass (game-worker subagent), reproduced and re-verified by the lead against the source
- **Area:** worker
- **Owner module:** `src/game/gameLoop.ts` (`adoptWorldSession`, `queueWorkerImport`, `frameBody`, `applyCommand`)
- **Cadence:** session replacement + animation-frame scheduler

## Status history

- 2026-09-16 — open (found by the worker-boundary audit subagent; runtime-reproduced with a fake `Worker`/RAF harness driving the real `GameLoop` class, then confirmed by the lead's own trace of the four code paths)
- 2026-09-16 — resolved (the import chain waits on the host handshake instead of the flag it clears itself; `GameWorkerHost.whenReady()` added; regression test `tests/gameLoop.sessionSwapWorker.test.ts`; suite, build, lint, the 360-day gate and the browser tier green)

## Observed behavior

The order of operations inside one call is self-blocking:

```ts
// src/game/gameLoop.ts:453-479  (adoptWorldSession)
if (this.workerEnabled && this.workerHost?.isReady()) {
  this.workerBooting = true;              // :458-460  — the flag is raised here
}
...
const sessionGen = this.sessionGen;
this.queueWorkerImport(world, () => {     // :475      — and the chain is queued right after
  if (sessionGen === this.sessionGen) this.notify(true);
});
```

```ts
// src/game/gameLoop.ts:489-513  (queueWorkerImport)
this.commandChain = this.commandChain
  .then(async () => {
    while (this.workerBooting && sessionGen === this.sessionGen && this.running) {
      await new Promise<void>((resolve) => setTimeout(resolve, 16));   // :497-499 spins here
    }
    ...
    await this.workerHost.importSave(world);   // :507  — never reached
    ...
    this.workerBooting = false;                // :510  — the only clear, after the wait
```

Because `sessionGen === this.sessionGen` (the generation was incremented one line earlier at `:454`)
and `this.running` is true, the loop never exits. Nothing rescues it:

- `frameBody` holds the tick accumulator while booting — `if (this.workerBooting) { /* Hold accumulator until worker is authoritative */ }` (`:834-836`), and the worker-stall watchdog lives in the `else if` branch that this skips (`:836-846`), so the watchdog never fires.
- The main-thread fallback ticks only when `!this.workerEnabled && !this.workerBooting` (`:868`), so the fallback cannot run either.
- `applyCommand` pushes every command into `deferredWorkerCommands` while `workerBooting && workerHost` (`:548-551`), so no player action reaches either path.

Result: the worker keeps simulating the **old** world while the UI shows the loaded one, the clock never
advances again, and the player's actions are accepted by the UI but never applied.

## Expected behavior

A session swap should hand the loaded world to the worker: `importSave` is posted, `workerBooting`
clears, deferred commands flush, and ticks resume against the loaded world.

## Reproduction steps

1. Start a game with the worker active (the default; the console logs `[GameLoop] Sim worker active — gameTick + commands run off the main thread`) and let it tick.
2. Load a save from the in-game header (**Load game**) or from a file (`App.tsx:969`, `:1017`, `:1032` → `applyLoadedSession` → `replaceSession` → `useGameSession.ts:107` `loopRef.current?.setSession(world, view)` → `gameLoop.ts:481` → `adoptWorldSession`).
3. Observed: the loaded colony renders but the clock is frozen; no `importSave` message is posted; `getDiagnostics()` reports `workerBooting: true`, `ticksInFlight: 0`; further clicks defer.
4. Headless equivalent (what the subagent ran): `tmp/audit-2026-09-16/repro-session-swap-deadlock.mts` — a fake global `Worker` plus an RAF stub driving the real `GameLoop`: control gives 4 tick messages over 2 s of frames before the swap; after `loop.setSession(loaded, view)` there are **0** messages, `workerBooting` is still `true` after 400 ms of 16 ms polls, and 0 ticks arrive over the next 2 s.

## Evidence

- `src/game/gameLoop.ts:454` (`this.sessionGen++`), `:458-460` (flag raised), `:475` (chain queued), `:494` (`const sessionGen = this.sessionGen` — already the new generation), `:497-499` (the wait), `:507` (`importSave`), `:510` (the only clear).
- `src/hooks/useGameSession.ts:102-107` — `replaceSession` reuses `loopRef.current`; it does **not** build a new `GameLoop`, so the flag survives into the load.
- `src/App.tsx:948-956, 969, 1017, 1032` — `applyLoadedSession` → `replaceSession` for the header load, the file load, and the map-setup paths.
- `src/game/gameLoop.ts:834-836`, `:868`, `:548-551` — the three paths that would otherwise keep the world alive are all gated on `workerBooting`.
- `src/game/gameLoop.ts:386-405` — `fallbackFromWorker` does clear the flag, but it is only reached from an explicit call or the stall watchdog, which `:834` disables while booting.
- Subagent runtime repro output (quoted in `docs/private/audits/2026-09-16/game-worker.md`): before the swap 4 tick messages; after `setSession` **none**, `workerBooting: true`, `diagnostics {"workerMode":"worker","workerBooting":true,"tick":24,"ticksInFlight":0}`.

## Root cause

`adoptWorldSession` raises `workerBooting` to mean "the worker does not yet hold this session", but
`queueWorkerImport` — the one function that ends that state — waits for the flag to be lowered first.
The two changes were presumably made at different times: the wait was written for the *boot* case
(where `adoptWorldSession` runs while the worker is still starting, so the flag is false and the chain
proceeds), and the raise at `:458-460` for the *ready-worker* case, without noticing that it inverts
the chain's precondition.

## Regression test

`tests/gameLoop.sessionSwapWorker.test.ts` (3 tests) drives the real `GameLoop` against a fake worker
host (the shape the audit asked for, without the RAF stub):

- **the deadlock case** — `setSession()` on a live, ready worker raises `workerBooting`, then the import
  chain must post `importSave` and lower the flag. Against the old flag poll this fails with
  `expected "vi.fn()" to be called 1 times, but got 0 times` (verified by temporarily restoring the
  poll);
- **the boot case** — with a host that is not ready yet, no import is posted; once the handshake
  resolves, the import is posted. This is what the original flag poll was for, so the fix had to keep
  it;
- **the stop case** — a loop that stops during the swap still clears `workerBooting` (the old code left
  it raised forever, which also blocked a later `start()`).

## Invariants checked

No simulation invariant is violated — the frozen world is internally consistent, which is exactly why
the 360-day gate, the 835-test suite and the browser smoke are all green while this is broken. The
broken contract is `GameLoopDiagnostics.workerBooting` and the "worker is authoritative for the current
session" invariant documented at `worldRuntimeCaches.ts:58-80`.

## Save/migration impact

None on the save data itself. The loaded world is adopted by the main thread (`this.world = world`,
`:465`) and rendered correctly; only the worker hand-off fails. Saving again would persist the frozen
world, so a player who loads, saves and continues has effectively lost the session's progress.

## Verification result

After the fix:

- `npx vitest run tests/gameLoop.sessionSwapWorker.test.ts tests/gameLoop.speedControl.test.ts tests/gameLoop.commandDispatch.test.ts tests/gameLoop.diagnostics.test.ts` — passed (18 tests). Negative check: with the old flag poll restored, the two swap cases fail (`importSave` never called); reverted.
- `npm test` — passed: 160 files / 865 tests, 0 failures.
- `npm run build`, `npm run lint` (0 warnings / 0 errors on 321 files), `npm run test:types` — passed.
- `npm run test:full-year` — passed (exit 0, 360 days / 25,920 ticks).
- `npm run test:browser` — passed (verdict pass, 0 console errors, 0 page errors, 0 failed requests).

Original audit evidence (before the fix): source trace of the four blocking paths at the cited lines;
subagent runtime repro with 4 control ticks before the swap and 0 messages afterwards, flag stuck.

## Related commits or files

- `src/game/gameLoop.ts:453-518` (the defect), `:834-836`, `:868`, `:548-551`
- `src/hooks/useGameSession.ts:102-107`, `src/App.tsx:948-1037`
- `docs/private/audits/2026-09-16/game-worker.md` (full context, request/response tables, other findings)
- `tmp/audit-2026-09-16/repro-session-swap-deadlock.mts` (reproduction)

## Fix

The chain no longer waits on a flag it owns. `GameWorkerHost` gained `whenReady()` — the same
waiter-list mechanism as the existing `whenIdle()`, resolved by the handshake and woken on `dispose()`
so a failed boot cannot hang a caller — and `queueWorkerImport` now reads:

```ts
try {
  await host.whenReady();                                  // handshake, not `workerBooting`
  if (sessionGen !== this.sessionGen || !this.running || this.workerHost !== host || !host.isReady()) return;
  await host.whenIdle();
  if (sessionGen !== this.sessionGen || !this.running || this.workerHost !== host || !host.isReady()) return;
  … import …
} finally {
  if (sessionGen === this.sessionGen && this.workerHost === host) this.workerBooting = false;
}
```

`workerBooting` is still raised by `adoptWorldSession` for its real purpose — the accumulator is held
and commands are deferred until the worker is authoritative for the loaded session — but the flag is
now lowered by the chain unconditionally for the session that raised it, including when the loop stops
mid-import. No simulation change, no protocol change: the message sequence on a swap is the same
`importSave` the boot path already posts.
