# Bug: Venue schedules are missing from SimTickDelta reconciliation

- Status: resolved — F1 complete; full suite 96 files / 568 tests
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 unreleased
- Reporter: v0.6.3 Festivals and Venues Implementation Audit
- Area: Truth | worker | UI
- Owner module: `src/game/simBuffers/simDelta.ts`, worker command reconciliation, `src/game/simWorker/simPrep.ts`
- Cadence: Worker command result and simulation tick reconciliation

## Status history

- 2026-08-22 — open (static source review identified missing venue schedule fields in the authoritative delta protocol)

## Observed behavior

`simPrep.ts` prepares `tavernSchedule` and `hotelSchedule`, but the inspected `SimTickDelta` type, extraction path, and `applySimTickDelta()` path carry `workSchedule`, `festival`, and Town Hall festival cooldown state without carrying the two venue schedules. A worker-authoritative `setVenueSchedule` command can therefore update worker state while the host/main-thread authoritative shadow is rebound from a delta that lacks the new schedule.

## Expected behavior

A successful venue-schedule command must reconcile the changed Tavern or Hotel schedule into both worker and host state. Rejected commands and fallback reconstruction must preserve the previous valid schedule.

## Reproduction steps

1. Start with default Tavern and Hotel schedules.
2. Issue `setVenueSchedule` through the worker command path.
3. Reconcile the returned command result/tick delta into the host world.
4. Inspect the host schedule and Hours panel.
5. Repeat for Tavern and Hotel, then test rejection and fallback paths.

## Evidence

- `src/game/simBuffers/simDelta.ts` — `SimTickDelta`, extraction, and application paths.
- `src/game/simWorker/simPrep.ts` — initial preparation includes both venue schedules.
- v0.6.3 Festivals and Venues Implementation Audit — identifies the same worker reconciliation gap.

## Root cause

The initial worker preparation protocol includes venue schedules, but the ongoing simulation delta protocol omits them. Initial state and incremental authoritative state therefore have different field coverage.

## Fix

Add `tavernSchedule` and `hotelSchedule` to `SimTickDelta`, its extractor, and `applySimTickDelta()`. Keep the command result authoritative and remove any stale optimistic value only after the delta contains the canonical schedule.

## Regression test

Add a worker/host round-trip test for both venues: command, worker mutation, delta extraction, host application, equality assertion, rejected command, and fallback reconstruction.

## Invariants checked

- Worker and host schedules converge after successful command reconciliation.
- Rejected commands do not partially mutate venue schedules.
- Missing legacy fields use safe defaults during initial preparation.
- Venue schedule state is not inferred from UI.

## Save/migration impact

No save schema change is expected. This is a transport-protocol change; verify backward compatibility for old deltas if protocol versioning requires it.

## Verification result

Open. Static source evidence confirms the field omission. Browser/worker round-trip verification has not been performed.

## Related commits or files

- `src/game/simBuffers/simDelta.ts`
- `src/game/simWorker/simPrep.ts`
- Worker command dispatch and reconciliation files
- `tests/workerCommand.roundtrip.test.ts`
- `docs/PRISON_FUNCTION_AUDIT.md`
- `BUG_REPORTS/Readme.md`

## Unique ID

`2026-08-22-venue-schedules-missing-from-sim-tick-delta`

## Audit change references

- Change 20: profile and bound reconciliation work.
- Change 22: add worker round-trip regression validation.

## Practical advice

Treat this as a release blocker for worker-controlled venue schedules. Repair transport first; do not compensate by changing UI optimism, adding a second schedule cache, or moving venue ownership into the renderer.

