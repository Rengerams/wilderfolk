# Bug: Demolition cleanup bypasses the workforce owner and drifts the building counter

- Status: resolved
- Date discovered: 2026-08-20
- Version/build: 0.6.1 (0.6.1-line development)
- Reporter: Deep Code (Objective 7)
- Area: Truth
- Owner module: buildingActions.ts (demolishBuilding) — workforce.ts (owner)
- Cadence: player-command

## Status history
- 2026-08-20 — open (discovered in Objective 7: demolition wrote workforce fields directly + counter drift)
- 2026-08-20 — fixed (cleanup via `removeWorkerTransition`; `totalBuildingsCompleted` decremented for completed buildings)
- 2026-08-20 — verified (demolish round-trip tests incl. 3-day gameTick no-reappearance + full suite green)

## Observed behavior

`demolishBuilding` cleared `homeBuildingId` / `occupation` / `job` on affected
settlers by writing the fields directly (a second mutation path for workforce
state), and never decremented `totalBuildingsCompleted` when a completed
player building was demolished — so the in-session stat drifted from the
load-time recompute (which counts CURRENT completed buildings).

## Expected behavior

- Demolition cleans assignments through the workforce owner (single writer).
- A completed player building being demolished decrements
  `totalBuildingsCompleted` (matching `saveLoad`'s current-count recompute).

## Reproduction steps

1. Build and staff a Farm; select it and click Demolish.
2. Observe the settler's `homeBuildingId`/`occupation`/`job` cleared by direct
   field writes inside `buildingActions.demolishBuilding` (not via the owner).
3. Check the Village stats: `totalBuildingsCompleted` still counts the
   demolished Farm in-session, but drops after a save/load.

## Evidence

- `src/game/buildingActions.ts` (before fix): inline `cleared.homeBuildingId /
  occupation / job` writes in `demolishBuilding`.
- `saveLoad.ts` recomputes `totalBuildingsCompleted` as a current count on
  load; `tickLayerDaily` increments it on completion; nothing decremented it.

## Root cause

The command was written before the workforce owner was extracted; its cleanup
never migrated to the named transition, and the denormalized counter had no
demolition path.

## Fix

`demolishBuilding` now routes worker cleanup through the workforce owner's
`removeWorkerTransition` (keeping `homeBuildingId`/`occupation`/`job`
consistent, leader-safe) and decrements `totalBuildingsCompleted` for a
completed non-rival building. Deliberately NOT changed: rival-faction
buildings (never counted) and incomplete buildings (never counted).

## Regression test

`tests/demolish.roundtrip.test.ts` (5 tests): removes once + cleans worker,
cleans resident + prisoner, does not reappear after 3 days of real
`gameTick`, safe when already removed, counter decremented only for completed
buildings. Selection clearing is covered by
`tests/gameLoop.commandDispatch.test.ts`.

## Invariants checked

- Workforce fields written only by the workforce owner.
- A removed building is absent from the authoritative building array.
- Denormalized `totalBuildingsCompleted` matches current completed buildings.

## Save/migration impact

None (no save shape change; runtime now matches load-time counter semantics).

## Verification result

Focused tests pass; full suite green.

## Related commits or files

- `src/game/buildingActions.ts`
- `tests/demolish.roundtrip.test.ts`
