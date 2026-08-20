# Bug: Church auto-staffing — legacy Churches stay full without a manual priest

- Status: verified
- Date discovered: 2026-08-20
- Version/build: 0.6.1 (0.6.1-line development)
- Reporter: Deep Code (Objective 5)
- Area: Truth | save/migration
- Owner module: saveLoad.ts (migration) + workforce.ts (manual-staff rule)
- Cadence: new-calendar-day / player-command

## Status history
- 2026-08-20 — open (discovered in Objective 5: legacy Churches stayed auto-filled)
- 2026-08-20 — investigating (manual-staff rule confirmed correct in code; hole was legacy saves)
- 2026-08-20 — fixed (`church-manual-staffing` save migration via `clearAutoFilledChurches`)
- 2026-08-20 — verified (migration tests + full suite green)

## Observed behavior

The Church is a manual-staff building: only a player-selected priest is
required for the normal staffed bonus, and generic auto-staffing never fills
it. But a legacy save created before manual staffing existed can still contain
a Church with auto-filled occupants. On load those occupants persist — the
Church appears staffed even though the player never assigned a priest, and
reconciliation cannot tell a manual priest from an auto-filled one (no
assignment metadata exists in legacy saves).

## Expected behavior

A new or migrated Church starts with zero priests until the player explicitly
assigns one. The Church never refills itself on daily ticks or via
rebalance/auto-staff.

## Reproduction steps

1. Create a world where a Church has occupants that were auto-filled by an
   older 0.6.1-line build (no manual-assignment metadata).
2. Load that save under the current build.
3. Observe the Church still occupied, with no player assignment.

## Evidence

- `workforce.ts` `MANUAL_STAFF_BUILDINGS` includes `Church`; `staffJobBuildings`
  (auto path) skips manual buildings; `findOverstaffedDonorBuilding` never
  strips manual buildings; `syncJobBuildingOccupants` rebuilds occupants from
  `homeBuildingId` only (a manual priest survives; nothing is added).
- `saveLoad.ts` ran `assignMissingWorkers` on load without clearing legacy
  Church occupants — the migration hole this report fixes.
- The Moon Howler exorcism path only pushes priests already picked from
  `church.occupants` (never auto-fills) — verified, not part of this bug.

## Root cause

No one-time migration existed to reconcile legacy Churches that predate the
manual-staffing rule. Current auto-staff code was already correct; the legacy
state carried the violation forward.

## Fix

Added `clearAutoFilledChurches(world)` in `saveLoad.ts` — a one-time migration
(id `church-manual-staffing`, tracked in `appliedSaveMigrations`) that clears
every occupant of a completed player Church through the workforce owner's
`removeWorkerTransition` (keeping `homeBuildingId`/`occupation`/`job`
consistent) and logs the migration. Runs during `loadGameFromParsed`.

## Regression test

`tests/church.manualStaffing.test.ts`:
- new-save: empty Church is not filled by `assignMissingWorkers` (daily pass)
  nor by rebalance, even with idle adults available;
- manual assignment works (one priest via `assignIdleWorkerToBuilding`);
- daily reconciliation preserves the manually assigned priest and adds none;
- legacy-save migration clears auto-filled seats and resets the workers'
  assignment fields; idempotent on re-run; rival Churches untouched;
- Objective 1 invariants hold after migration.

## Invariants checked

- Manual buildings are never filled by generic auto-staffing.
- The Church has capacity for four but requires only the player-selected priest.
- A new or migrated Church starts with zero priests until explicitly assigned.

## Save/migration impact

One-time `church-manual-staffing` migration id added; legacy 0.6.1-line saves
with auto-filled Churches get cleared on first load. No save shape change.

## Verification result

Focused tests pass; full suite green (see commit record).

## Related commits or files

- `src/game/saveLoad.ts` (clearAutoFilledChurches + load wiring)
- `src/game/workforce.ts` (removeWorkerTransition, manual-staff rules)
- `tests/church.manualStaffing.test.ts`
