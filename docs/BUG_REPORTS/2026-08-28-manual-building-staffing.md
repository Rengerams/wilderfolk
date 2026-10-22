# Bug: Manual worker selection is unavailable or unclear in building panels

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer gameplay observation
- Area: Play | UI | worker
- Owner module: `workforce.ts` assignment transitions; selected-building presentation and typed command dispatch
- Cadence: Player command and assignment reconciliation

## Status history

- 2026-08-28 — investigating: developer could not choose manual staffing at buildings during normal gameplay.
- 2026-09-09 — resolved: the Manual staffing toggle command `setBuildingStaffingMode` was declared but missing from the `WORKER_COMMAND_OPS` allow-list and was silently rejected; added in `312ccef` (2026-08-31). The panel now shows the mode, switches Auto/Manual, lists eligible workers with blocking reasons, and removes/replaces workers via typed proto-1 commands.

## Observed behavior

The player cannot clearly switch an eligible building to manual staffing and select a specific worker. The relevant controls may be hidden by panel structure, unavailable due to UI eligibility gating, or rejected in the command path.

## Expected behavior

For buildings that support manual staffing, the player can clearly see the current staffing mode, switch to Manual, see eligible settlers and blocking reasons, select an individual worker, and remove or replace an assigned worker through authoritative typed commands.

## Reproduction steps

1. Complete a staffing-capable building with at least one eligible unassigned settler.
2. Select the building.
3. Open its Workers section.
4. Switch to Manual and select a named worker.
5. Verify the command result and occupancy state.

## Evidence

Developer gameplay report on 2026-08-28. Detailed reproduction pending code-path inspection.

## Root cause

Pending investigation of the selected-building panel, assignment eligibility, shell view layout, typed commands, and workforce owner.

## Fix

Pending investigation. The fix must retain workforce authority, manual-building restrictions, worker occupancy invariants, and worker-command confirmation.

## Regression test

Pending: focused UI/command test for selecting a worker in Manual mode and surfacing the reason when no worker is eligible.

## Invariants checked

A living human belongs to at most one workplace occupancy list; `homeBuildingId` matches workplace occupancy; manual-only buildings are not generic-auto-staffed; the main thread sends a typed command rather than mutating the worker state.

## Save/migration impact

Expected none — presentation and command availability only, unless command-state evidence proves otherwise.

## Verification result

Pending.

## Related files

- `src/components/SelectedBuildingPanel.tsx`
- `src/game/workforce.ts`
- `src/game/simWorker/commands.ts`
- selected-building command composition
