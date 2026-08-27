# Simulation Worker Logic Audit — 2026-08-20

## Scope

This audit examined the connected worker host, browser worker entrypoint, Node worker adapter, game-loop watchdog and fallback, command queue, optimistic command reconciliation, render-buffer lifecycle, protocol validation, shared command implementation, and available worker tests. The audit followed `docs/SIMULATION_AUTHORITY.md`, especially the worker invariants in §5.

## Baseline and confirmed repair

The focused worker and command suite initially passed **47/47** tests. The audit identified one uncovered correctness defect in the watchdog fallback: when a pending optimistic command existed and the worker stalled, `GameLoop.frame()` disposed and cleared `workerHost` before the command rejection could call `syncAfterWorkerMutation()`. That removed the only reference to the worker-authoritative world and could leave the optimistic assignment, demolition, or other command visible on the main display.

The fix restores the authoritative worker world, clears the optimistic marker, rebuilds the catalog, prunes stale selection, and notifies the UI **before** disposing the worker host. The defect is recorded and verified in `BUG REPORTS/2026-08-20-worker-stall-optimistic-revert.md`.

## Worker ownership findings

The worker owns the authoritative `WorldState` once initialized. `gameTick()` and `applyWorkerCommand()` remain the only simulation mutation boundaries. The main-thread fallback calls the same `applyWorkerCommand()` implementation as the worker. Ordinary commands dispatch without waiting for idle, while full-world import/export correctly uses idle sequencing.

The watchdog is latency-adaptive: it uses `max(2 seconds, 4× observed worker latency)` and only triggers when a tick is actually in flight. This avoids treating a busy high-population worker as dead merely because one tick takes longer than a fixed short timeout.

Worker command errors and protocol mismatches reject pending operations and decrement tick in-flight state. Render-buffer acquisition failures restore the simulation-prep snapshot before reporting the error. The current `simPrep` snapshot covers the authoritative collections and counters used by the worker protocol, but it is not a full deep-world transaction; if a future tick mutates a new state field outside `SimPrepKeys` before throwing, rollback coverage could regress. Any new authoritative field added to worker tick logic must therefore be reviewed against `simPrep.ts`.

## Test-surface gap

The connected project has no `vitest.browser-worker.config.ts` and no browser-worker integration test script. Existing tests cover command-domain round trips and GameLoop reconciliation with fakes, but do not boot a real browser `Worker` in a browser test environment. This is a test-surface gap, not a confirmed runtime defect, and should remain a separate objective.

The Node worker adapter is present and type-checks, but the current test suite does not exercise its startup and transferable-buffer behavior end to end. This should be covered when the browser-worker objective is implemented.

## Validation

| Check | Result |
|---|---:|
| Focused worker, command, validation, and invariant tests after repair | 48/48 passed |
| Full Vitest suite | 51 files / 336 tests passed |
| TypeScript | Passed |
| ESLint | Passed |

## Simulation Change Record

- **Owner module:** `src/game/gameLoop.ts`
- **Decision changed:** Worker-stall fallback reconciliation
- **Cadence:** Worker watchdog / player-command reconciliation
- **State fields written:** Main display world binding, optimistic-command marker, catalog and selection presentation state; no worker-authoritative state is mutated by the repair
- **Why the change is needed:** Preserve the worker-authority invariant when a worker stalls during an optimistic command
- **Player-visible behavior before:** A stalled worker could leave a rejected command visually applied
- **Player-visible behavior after:** The display reverts to the last authoritative world before main-thread fallback begins
- **Performance impact:** One catalog rebuild and notification only when a command is pending during a stall
- **New or updated tests:** `tests/gameLoop.commandDispatch.test.ts` adds the stalled-worker optimistic-revert regression
- **Invariants checked:** Worker command result authority, no stale tick overwrite, shared fallback command implementation, stale-selection cleanup
- **Save/migration impact:** None
- **Rollback plan:** Revert the watchdog branch and regression test together; do not restore the pre-fix teardown ordering without an equivalent authoritative-world handoff

## Remaining objectives

The highest-value worker follow-up is a real browser-worker integration test covering startup, protocol handshake, tick delivery, command dispatch, render-buffer return, worker error, and fallback. A second follow-up should review `SimPrepKeys` against all new mutable `WorldState` fields whenever simulation state expands.
