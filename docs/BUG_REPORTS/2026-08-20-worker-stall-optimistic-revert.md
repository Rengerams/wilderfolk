# Bug: Worker-stall fallback can leave an optimistic command visible

- Status: resolved
- Date discovered: 2026-08-20
- Version/build: Wilderfolk 0.6.1.1
- Reporter: Full worker-logic audit using `wilderfolk-simulation-audit`
- Area: worker | Truth | Play
- Owner module: `src/game/gameLoop.ts`
- Cadence: player-command / worker watchdog

## Status history

- 2026-08-20 — open (worker stall fallback disposes the host before reverting an optimistic command)
- 2026-08-20 — verified (fallback now restores the worker authoritative world before disposal; 51 files / 336 tests, TypeScript, and lint passed)

## Observed behavior

When a player command is optimistically applied while the worker is active and the worker later trips the stall watchdog, `GameLoop.frame()` disposes the worker and sets `workerHost` to `null`. The pending command then rejects. The command-chain catch attempts to revert the optimistic state through `syncAfterWorkerMutation()`, but that method can no longer read the worker's authoritative `worldRef` because the host was already cleared. The display world can therefore retain an assignment, demolition, or other command that the worker never accepted.

## Expected behavior

Worker-stall fallback must revert any pending optimistic command to the last authoritative worker world before disposing and clearing the worker host, then continue on the main-thread simulation.

## Reproduction steps

1. Start with the simulation worker active.
2. Apply a typed player command so `optimisticCommand` is set.
3. Prevent the worker from returning the command result and force the tick watchdog to trip.
4. Observe that the fallback disposes and clears `workerHost` before the command-chain rejection runs.
5. The display may retain the optimistic mutation instead of reverting.

## Evidence

- `gameLoop.ts` worker-stall branch clears `workerHost` at lines 641–649.
- `applyCommand()` command-chain catch relies on `syncAfterWorkerMutation()` at lines 381–393.
- `syncAfterWorkerMutation()` only reads `this.workerHost?.getAuthoritativeWorld()`.
- `SIMULATION_AUTHORITY.md` §2 and §5 require authoritative command-result replacement or revert.

## Root cause

The fallback teardown order destroys the only reference used to recover the authoritative worker world before the pending optimistic command rejection is processed.

## Fix

Revert the optimistic command from the worker host's authoritative world before disposing the host. The fallback must clear the optimistic marker, rebuild the catalog, prune stale selection, and notify the display before continuing on the main thread.

## Regression test

Add a GameLoop worker-stall regression test that starts an optimistic command, disposes the worker host before the command rejects, and asserts the display returns to the authoritative pre-command state.

## Invariants checked

- A command result cannot be overwritten by an older tick delta.
- Optimistic display state is temporary and never remains after worker rejection.
- Main-thread fallback uses the same `applyWorkerCommand` implementation.
- Worker state remains authoritative until fallback begins.

## Save/migration impact

None.

## Verification result

Verified. The watchdog fallback now restores the authoritative worker world before disposing the host. Focused worker tests passed 48/48; the full suite passed 51 files / 336 tests; TypeScript and ESLint passed.

## Related files

- `src/game/gameLoop.ts`
- `src/game/simWorker/GameWorkerHost.ts`
- `tests/gameLoop.commandDispatch.test.ts`
- `docs/SIMULATION_AUTHORITY.md`
