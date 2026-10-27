# Bug: Player commands wait for a permanently busy worker (dead clicks)

- Status: resolved
- Date discovered: 2026-08-20
- Version/build: 0.6.1 (0.6.1-line development)
- Reporter: Deep Code (Objective 6)
- Area: worker | UI
- Owner module: gameLoop.ts (applyCommand transport) — GameWorkerHost, commands.ts unchanged
- Cadence: player-command

## Status history
- 2026-08-20 — open (discovered in Objective 6: `applyCommand` gated dispatch on `whenIdle()`)
- 2026-08-20 — fixed (immediate dispatch; FIFO ordering makes stale overwrite impossible)
- 2026-08-20 — verified (dispatch regression tests + full suite green)

## Observed behavior

`GameLoop.applyCommand` dispatched player commands only after
`workerHost.whenIdle()` resolved. The worker pipeline runs up to
`MAX_PIPELINE_DEPTH = 4` ticks in flight and the frame loop refills it every
frame, so under load (large map, high population, high speed) the worker can
stay permanently busy: `ticksInFlight > 0` continuously, `whenIdle()` never
resolves, and every assignment / priest selection / demolition / repair /
upgrade / mode command dead-waits. Clicks appear dead while the sim runs.

## Expected behavior

SIMULATION_AUTHORITY.md §5: "Commands are dispatched without waiting for an
impossible permanently idle worker." §4 player-command cadence: "Must not do:
wait for a worker pipeline to become permanently idle." Full-world
import/export may wait for idle; ordinary player commands may not.

## Reproduction steps

1. Run the game with the worker enabled (default) at high population / speed so
   the pipeline stays full.
2. Click Assign on a building while ticks are continuously in flight.
3. Observe the command never applies until the worker happens to go idle.

## Evidence

- `src/game/gameLoop.ts` (before fix): `applyCommand` chain contained
  `return this.workerHost.whenIdle();` before `sendCommand(cmd)`.
- `src/game/simWorker/GameWorkerHost.ts`: `whenIdle()` resolves only when
  `ticksInFlight === 0 && pendingCommand == null && pendingExport == null`;
  `MAX_PIPELINE_DEPTH = RENDER_BUFFER_POOL_SIZE - 1 = 4`.

## Root cause

The transport gate was written when commands needed the worker quiescent, but
the worker processes messages FIFO: a command posted mid-pipeline applies to
the post-tick authoritative state, and its `commandResult` arrives after the
older in-flight `tickResult`s (each applied to the shared `worldRef` in arrival
order). Idle-waiting therefore buys nothing and costs dead clicks.

## Fix

Removed the `whenIdle()` gate from `GameLoop.applyCommand` — the command now
dispatches immediately (still serialized via `commandChain` so
`GameWorkerHost.sendCommand`'s single-in-flight rule holds). FIFO ordering
guarantees a command result cannot be overwritten by an older tick delta.
`importSave` / `exportSave` still wait for idle (sanctioned full-world
transfers).

## Regression test

`tests/gameLoop.commandDispatch.test.ts`:
- a fake worker host whose `whenIdle()` never resolves and whose
  `sendCommand` is a spy: `applyCommand` must call `sendCommand` and must NOT
  call `whenIdle`;
- main-thread fallback applies the same `applyWorkerCommand` implementation as
  the worker (parity);
- demolition clears stale building selection.
Plus `tests/workerCommand.roundtrip.test.ts` (assignment, priest selection,
reassignment, demolition, repair, upgrade, mode commands through the shared
`applyWorkerCommand`).

## Invariants checked

- A command result cannot be overwritten by an older tick delta (FIFO).
- Commands are dispatched without waiting for a permanently idle worker.
- Full-world import/export may wait for idle; ordinary player commands may not.
- Main-thread fallback uses the same domain command implementation as the worker.

## Save/migration impact

None.

## Verification result

Focused tests pass (9 round-trip + 3 dispatch); full suite green.

## Related commits or files

- `src/game/gameLoop.ts`
- `tests/gameLoop.commandDispatch.test.ts`
- `tests/workerCommand.roundtrip.test.ts`
