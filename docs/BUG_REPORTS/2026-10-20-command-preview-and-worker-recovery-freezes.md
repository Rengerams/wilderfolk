# Command previews and worker recovery can block the UI

- Bug: expensive optimistic replay, command starvation and heavy fallback ticks during recovery
- Status: resolved — live verification pending
- Date discovered: 2026-10-20
- Version/build: base 46b4890, version 0.6.5.1
- Reporter: Renger and code review
- Area: performance
- Owner module: gameLoop
- Cadence: player commands and animation frames

## Status history

- 2026-10-20 — open: user supplied a 93,003 ms maximum frame, command-in-flight logs and a CPU report.
- 2026-10-20 — investigating: main-thread optimistic replay runs colony-wide reconciliation; tick submissions continue while commands wait for idle; recovery permits expensive local ticks.
- 2026-10-20 — resolved — live verification pending: focused regression cases reproduce the three failure modes before the patch and pass afterward; a live browser/Windows replay remains pending.

## Observed behavior

Worker-mode command previews can run staffing and demolition reconciliation on the UI thread. A busy worker queue can keep accepting ticks while a command waits for it to empty. A worker silence switches to local ticks during the recovery delay, so an expensive simulation tick blocks controls and rendering. The supplied profiler records main-thread staffing despite worker authority; the recovery log records a 12,202 ms silence followed by a 12,789 ms frame and automatic worker recovery.

## Expected behavior

Colony-wide commands execute once on the simulation worker. Pending commands allow the tick queue to drain. While worker recovery is scheduled or in flight, simulation advancement waits and the UI continues drawing; commands are deferred until recovery. Unconfirmed commands retain their order across a restart; an epoch invalidates the old asynchronous command chain so it cannot replay them again. Local simulation remains available in runtimes without worker support.

## Reproduction steps

1. Load a large colony and enable worker mode.
2. Queue Auto-staff or demolish a building while the worker has outstanding ticks.
3. Observe synchronous assignment in the display replica and continued tick requests while the command awaits idle.
4. Schedule recovery with an overdue local tick: the old frame loop runs that tick on the UI thread.

## Evidence

The existing game-loop tests include observable command deferral, command queue draining/resumption, recovery command retention, a recovery tick hold and two queued demolitions replayed exactly once after restart. The first three reproduce before the respective fixes. The real-save performance record is in `docs/plans/performance-roadmap-2026-10-20.md`.

## Root cause

Unbounded domain commands were replayed optimistically. The frame loop did not account for commands waiting on its own command chain or a scheduled worker recovery.
