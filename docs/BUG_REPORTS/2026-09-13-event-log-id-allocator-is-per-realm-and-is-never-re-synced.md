# Event-log id allocator is per-realm and is never re-synced when a world is handed to the worker, so worker chronicle entries are dropped by the delta dedupe

- **Bug:** Event-log id allocator is per-realm and is never re-synced when a world is handed to the worker, so worker chronicle entries are dropped by the delta dedupe
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A22-misc-log-tutorial; adversarially verified) — audit id H4
- **Area:** save/migration
- **Owner module:** `src/game/eventLog.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

Any freshly created (or recovered) worker starts allocating ids from 1 while the imported log already holds ids 1..N (N = entries in the save, up to the 2000 cap). `applySimTickDelta` skips tail entries whose id already exists (`simDelta.ts:513 if (!existingIds.has(entry.id))`), so the first N events the worker logs never reach the display copy: after loading a mid/late game the in-game Chronicle silently freezes for hundreds-to-thousands of events even though the simulation keeps logging. The same untracked counter is used by the optimistic display path (`gameLoop.ts:540-542 applyWorkerCommand` on a clone of the worker's shadow world), which can allocate an id that the worker has already used, producing duplicate ids in one log (duplicate React `key={evt.id}` in EventLogPanel.tsx:197).

## Expected behavior

Make the allocator travel with the log: add `import { syncEventLogIdFromState } from '../eventLog';` to `simPrep.ts` and call `syncEventLogIdFromState(world)` immediately after `world.eventLog = prep.eventLog;` (L245) — alternatively call it in `gameWorker.ts resetWorkerSession` (L118-124) so the worker's ids continue above the restored log.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/eventLog.ts` at lines 4, 10-14, 24 (worker entry points simPrep.ts:245, gameWorker.ts:118-124) | 4, 10-14, 24.
2. Note the offending code: `L4: `let nextEventLogId = 1;`  L12: `nextEventLogId = Math.max(...state.eventLog.map((e) => e.id)) + 1;`  L24: `id: nextEventLogId++,` — the only callers of `syncEventLogIdFromState` are `saveLoad.ts:445` and `worldGen.ts:683` (both main thread). The worker entry points `simPrep.ts:245 world.eventLog = prep.eventLog;` and `gameWorker.ts:118-124 resetWorkerSession` never call it, and `SimPrepPayload` carries `eventLog` (simPrep.ts:67,161) but no id counter.`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> `nextEventLogId` is module-scoped (4) and `syncEventLogIdFromState` has only the two main-thread callers saveLoad.ts:445 and worldGen.ts:683, while `resetWorkerSession` (gameWorker.ts:118-124) installs the imported world — whose `eventLog` carries ids 1..N from the save — without resyncing, so a fresh worker allocates ids from 1 again (24). `applySimTickDelta` skips incoming tail entries whose id already exists in the display log (simDelta.ts:504-517), so after loading a save in worker mode the main-thread Chronicle silently ignores the worker's new entries until its counter passes the saved maximum (up to the 2000-entry cap), while the worker's own log holds duplicate ids; tests/simDelta.eventLog.test.ts only uses non-colliding ids and does not lock the allocator. Fix: import and call `syncEventLogIdFromState(world)` in the worker right after the world is installed (`simPrep.ts:245` or preferably `gameWorker.resetWorkerSession`), or compute the next id from `state.eventLog` inside `logEvent`.

## Root cause

`nextEventLogId` is module-scoped (4) and `syncEventLogIdFromState` has only the two main-thread callers saveLoad.ts:445 and worldGen.ts:683, while `resetWorkerSession` (gameWorker.ts:118-124) installs the imported world — whose `eventLog` carries ids 1..N from the save — without resyncing, so a fresh worker allocates ids from 1 again (24). `applySimTickDelta` skips incoming tail entries whose id already exists in the display log (simDelta.ts:504-517), so after loading a save in worker mode the main-thread Chronicle silently ignores the worker's new entries until its counter passes the saved maximum (up to the 2000-entry cap), while the worker's own log holds duplicate ids; tests/simDelta.eventLog.test.ts only uses non-colliding ids and does not lock the allocator. Fix: import and call `syncEventLogIdFromState(world)` in the worker right after the world is installed (`simPrep.ts:245` or preferably `gameWorker.resetWorkerSession`), or compute the next id from `state.eventLog` inside `logEvent`.

## Fix

`logEvent` derives the next id from the log it writes to (`state.eventLog[0].id + 1`, the log is newest-first) instead of trusting a module counter. A realm that receives a world — the simulation worker, or the main thread's optimistic display copy — can no longer re-issue an id the imported log already uses, which is what made `applySimTickDelta` skip every new worker event (`if (!existingIds.has(entry.id))`) until its counter passed the save's maximum.

## Regression test

`tests/eventLog.idMonotonic.test.ts` (3) — a log imported with ids up to 5000 continues at 5001, successive writes stay increasing and unique, and the 2000-entry bound still applies.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

This finding is itself about state not surviving save/worker handoff; the fix must add the field to the save allow-list **and** the worker prep/delta paths, and must tolerate older saves that lack it.

## Verification result

`npm run test:all` passes; `tests/simDelta.eventLog.test.ts` and `tests/eventLogPanel.filters.test.ts` (the delta/dedupe and panel consumers) still pass.

## Related commits or files

- `src/game/eventLog.ts` (lines 4, 10-14, 24 (worker entry points simPrep.ts:245, gameWorker.ts:118-124) | 4, 10-14, 24)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H4)
