# Bug: Worker assignment panel shows manual pick list in auto mode; auto/manual toggle seemed inert

- Status: resolved — focused validation passed
- Date discovered: 2026-08-24
- Version/build: Wilderfolk v0.6.3 working tree
- Reporter: Dev
- Area: UI
- Owner module: `src/components/SelectedBuildingPanel.tsx`, `src/game/buildingActions.ts` (assignable worker list)
- Cadence: Render-time and player interaction

## Status history

- 2026-08-24 — open (Dev report)
- 2026-08-24 — resolved (manual pick list now only renders when the building is in manual staffing mode; TypeScript + full suite pass)

## Observed behavior

I still see all citizens by buildings even if there are no workers free, or if it's in auto mode. If I want to manually choose workers, I only want to see the citizens who don't have a job yet; switching between auto and manual doesn't seem to do anything.

## Expected behavior

- Auto mode: the game auto-fills the building; the player is not shown a manual "choose worker" list.
- Manual mode: the player sees only unemployed adult settlers who can be assigned.
- Switching auto/manual visibly changes the available controls.

## Reproduction steps

1. Open the game and select a job building.
2. Toggle between Auto-fill and Handmatig.
3. Observe the "Choose worker" pick list.

## Evidence

- `listAssignableWorkersForBuilding()` already filters to settlers without a work assignment.
- The pick list in `SelectedBuildingPanel.tsx` rendered whenever assignable workers existed, regardless of the building's staffing mode.

## Root cause

The manual worker pick list was gated only on "has assignable workers" and "has open slots", not on the building's staffing mode. In auto mode the panel still offered hand-picking, which made the auto/manual toggle appear inert.

## Fix

- Added `isManualStaffing` in `SelectedBuildingPanel.tsx` using the same default-mode rule as the toggle (manual by default for Church/Prison/Barracks/School/TownHall; otherwise auto unless overridden).
- The "Choose worker" pick list now renders only when `isManualStaffing` is true.
- Auto mode still shows the Auto-staff / Fill buttons; manual mode shows the filtered unemployed-settler list.

## Regression test

No UI unit test exists for this panel; validation is TypeScript + full Vitest suite (**89 files / 504 tests**) and the existing worker-assignment command tests (`tests/workerCommand.roundtrip.test.ts`, `tests/workforce.transitions.test.ts`).

## Invariants checked

- No simulation state changed; this is presentation-only.
- Worker authority, typed commands, and save state are untouched.

## Save/migration impact

None.
