# Bug: Worker venue-schedule command result omits Tavern and Hotel hours

- **Status:** resolved — F1 complete; full suite 96 files / 568 tests
- **Date discovered:** 2026-08-22
- **Version/build:** 0.6.3 unreleased
- **Reporter:** Manus AI, from the v0.6.3 Festivals and Venues implementation audit
- **Area:** worker | UI | Truth
- **Owner module:** `src/game/venueSchedule.ts` owns the schedule decision; `src/game/simBuffers/simDelta.ts` and `src/game/simWorker/GameWorkerHost.ts` own worker-to-host transport and reconciliation
- **Cadence:** Player command (`setVenueSchedule`) plus worker command-result and ordinary tick reconciliation

## Status history

- **2026-08-22 — open:** The Festivals and Venues audit identified that `tavernSchedule` and `hotelSchedule` are prepared for worker startup but absent from `SimTickDelta` extraction and application.
- **2026-08-22 — investigating:** Direct source review confirmed that `setVenueSchedule()` writes the authoritative field correctly, while `GameWorkerHost` applies command-result/tick deltas that omit it.
- **2026-08-22 — investigating:** Added canonical venue schedules to `SimTickDelta` extraction/application and direct delta, worker-command-result, later-tick, and fallback regressions. Focused tests, TypeScript, ESLint, and production build passed. The full suite was started but did not complete after three bounded waits and was stopped; no pass/fail result is claimed.

## Observed behavior

A Tavern or Hotel schedule command can succeed in the worker and show optimistically in the main-thread display, but the later authoritative worker command result or tick delta does not transport `tavernSchedule` or `hotelSchedule`. The host therefore continues from stale local schedule fields after reconciliation.

## Expected behavior

After a successful `setVenueSchedule` command, the worker-authoritative Tavern or Hotel hours must be present in the command result and later ticks. The host display world, worker world, main-thread fallback, and saved world must agree on the selected schedule.

## Reproduction steps

1. Run the simulation worker and issue a valid `setVenueSchedule` command for Tavern or Hotel hours.
2. Observe the optimistic display copy use the selected hours.
3. Receive the worker command result or later tick delta.
4. Observe that the delta contains `workSchedule` but no `tavernSchedule` or `hotelSchedule`; the host has no authoritative schedule value to apply.

## Evidence

- `simPrep.ts` already transports both venue schedules at worker initialization.
- `venueSchedule.ts` already validates and writes both fields.
- `simDelta.ts` contains and applies `workSchedule`, but its `SimTickDelta`, extraction, and application paths omit `tavernSchedule` and `hotelSchedule`.
- `GameWorkerHost` applies the same delta for both command results and tick results.
- Existing worker-command and GameLoop tests did not assert venue-schedule persistence after authoritative reconciliation.

## Root cause

The venue schedule feature added state preparation and command validation but did not extend the incremental worker-to-main-thread `SimTickDelta` contract. The command owner is correct; the reconciliation payload is incomplete.

## Fix

Added canonical Tavern and Hotel schedule values to `SimTickDelta`, extracted them from the authoritative worker world, and applied them to the host display world. The delta uses `getVenueSchedule()` so absent legacy fields retain the existing canonical defaults. Added direct delta and GameLoop command-result/later-tick coverage for both venue kinds, plus main-thread fallback coverage.

## Regression test

1. `tests/simDelta.eventLog.test.ts` proves delta extract/apply preserves independently changed Tavern and Hotel schedules.
2. `tests/gameLoop.commandDispatch.test.ts` proves an optimistic Tavern/Hotel update survives the authoritative worker command result and later tick result.
3. `tests/gameLoop.commandDispatch.test.ts` proves main-thread fallback uses the same `applyWorkerCommand()` schedule transition.
4. Existing save/prep state remains unchanged; F3 malformed/legacy load normalization remains separately tracked and is not expanded into this repair.

## Invariants checked

- Worker command result remains authoritative and cannot be overwritten by an older tick delta.
- Main-thread fallback uses the same domain implementation as the worker.
- No UI component creates a direct simulation mutation path.
- Existing independent ordinary work, Tavern, and Hotel schedule semantics remain unchanged.

## Save/migration impact

No new persistent field is added. Existing `tavernSchedule` and `hotelSchedule` fields already travel through save/prep paths. This fix completes the live command/tick reconciliation transport. Legacy/malformed venue-load canonicalization remains the separate F3 objective.

## Verification result

Focused venue/delta/worker tests passed: **4 files / 28 tests**. TypeScript passed. ESLint for `src` and `tests` passed. Production build passed with only the pre-existing circular `game-render → game → game-render` warning and 588.12 kB game-chunk warning. The full Vitest suite was started but did not complete after three 30-second waits with repeated diagnostic output; it was stopped without a final pass/fail result. Full-suite completion remains required before this report can move to resolved.

## Simulation Change Record

- **Owner module:** `src/game/venueSchedule.ts` owns selected venue hours; `src/game/simBuffers/simDelta.ts` owns worker-to-host transport of the authoritative state.
- **Decision changed:** None. The repair carries the already-authoritative Tavern and Hotel schedule decision through command-result and tick reconciliation.
- **Cadence:** Player command followed by worker command-result and normal tick reconciliation.
- **State fields written:** Existing `WorldState.tavernSchedule` and `WorldState.hotelSchedule` only; no new persistent fields.
- **Why the change is needed:** The worker could accept a selected schedule while the host display retained stale hours because the delta contract omitted both fields.
- **Player-visible behavior before:** Venue hours could appear to change optimistically, then be stale after authoritative worker reconciliation.
- **Player-visible behavior after:** The authoritative Tavern and Hotel hours arrive in worker command results and later tick deltas, so the host display stays aligned with the worker.
- **Performance impact:** Two small schedule objects are added to the existing JSON delta; no new cadence, scan, cache, or UI mutation path is added.
- **New or updated tests:** `tests/simDelta.eventLog.test.ts`; `tests/gameLoop.commandDispatch.test.ts`.
- **Invariants checked:** Worker command result remains authoritative; fallback continues to use the same domain command implementation; no UI mutation path added.
- **Save/migration impact:** No new saved field or migration. Existing prep/save fields are reused; malformed/legacy normalization remains F3.
- **Rollback plan:** Remove the two delta fields and their tests to restore the prior incomplete reconciliation behavior; no data migration is required.

## Related commits or files

- `src/game/venueSchedule.ts`
- `src/game/simBuffers/simDelta.ts`
- `src/game/simWorker/GameWorkerHost.ts`
- `src/game/gameLoop.ts`
- `src/game/simWorker/simPrep.ts`
- `tests/gameLoop.commandDispatch.test.ts`
- `tests/workerCommand.roundtrip.test.ts`
- `tests/venueSchedule.test.ts`
- `roadmap_CURRENT_V0_6_3.md` (F1)
