# Bug: Worker event-log tail sends oldest events instead of newly logged events

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: User-requested event-log audit
- Area: worker | UI | Truth
- Owner module: `src/game/simBuffers/simDelta.ts`
- Cadence: Worker tick delta publication and main-thread delta reconciliation

## Status history

- 2026-08-21 — open (discovered during an audit of Chronicle UI coverage and event producers)
- 2026-08-21 — investigating (root cause reproduced by source inspection; regression fixture pending)
- 2026-08-21 — resolved (newest-prefix delta merge implemented and deterministic regression passed)

## Observed behavior

When the simulation worker is active, newly created worker-side Chronicle entries can fail to reach the main-thread world snapshot and therefore do not appear in the player-facing Chronicle UI.

## Expected behavior

Every newly logged event created by the authoritative worker must be propagated to the main-thread presentation snapshot, remain newest-first, and be displayed by the Chronicle until its normal retention limit applies.

## Reproduction steps

1. Enable the simulation worker and cause an event that calls `logEvent`, such as a building completion, festival start, birth, trade trip, or wildlife event.
2. Open the right-side **Log → Chronicle** panel.
3. Compare the worker state with the main-thread display after the delta is applied.

## Evidence

`logEvent()` inserts events with `state.eventLog.unshift(...)`, so index `0` is the newest event. `extractSimTickDelta()` was selecting `world.eventLog.slice(Math.max(0, length - EVENT_LOG_DELTA_TAIL_MAX))`, which selects the oldest entries in this newest-first list. `applySimTickDelta()` then appended the received entries with `push`, leaving newly created entries absent from the presentation state.

## Root cause

The worker delta used an end-of-array “tail” convention that conflicts with the event log’s newest-first storage convention.

## Fix

Resolved. `extractSimTickDelta()` now sends `world.eventLog.slice(0, EVENT_LOG_DELTA_TAIL_MAX)`. Reconciliation deduplicates by event id, prepends genuinely new entries in delta order, and applies the shared 2,000-entry retention bound.

## Regression test

Implemented in `tests/simDelta.eventLog.test.ts`. The regression uses a 130-entry newest-first worker log, asserts the 128-entry newest prefix is sent, verifies a stale main-thread log becomes newest-first without duplicates, and confirms reapplying the delta is idempotent.

## Invariants checked

- Worker-owned `WorldState` remains authoritative.
- The UI receives event data only through a worker delta; it does not write event state.
- Existing event IDs remain unique and no delta reapplication creates duplicates.
- Chronicle ordering remains newest-first.

## Save/migration impact

No schema change. Existing saves retain their current event logs. The fix affects future worker-to-main synchronization only.

## Verification result

Resolved — `npm test -- --run tests/simDelta.eventLog.test.ts` passed on 2026-08-21. Full validation remains recorded in the session changelog entry.

## Related commits or files

- `src/game/eventLog.ts`
- `src/game/simBuffers/simDelta.ts`
- `src/game/EventLogPanel.tsx`
- `tests/simDelta.eventLog.test.ts`
- `BUG REPORTS/2026-08-21-worker-event-log-tail-sends-oldest-events.md`
