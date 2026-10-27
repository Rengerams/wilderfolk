# Legacy Church migration runs on every load and strips the player's assigned priest

- **Bug:** Legacy Church migration runs on every load and strips the player's assigned priest
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A21-worker-persistence; adversarially verified) — audit id H8
- **Area:** save/migration
- **Owner module:** `src/game/saveLoad.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

`loadGameFromParsed` is the browser-load and file-load path, so this runs on every reload. A priest the player assigned by hand is released: `removeWorkerTransition` clears `homeBuildingId` and resets `job`/`occupation` to Settler (workforce.ts:226-228). Nothing refills the Church (`assignMissingWorkers` deliberately skips manual buildings), so Church strength silently drops from 1 to 0.5 (`getChurchStrength`, workforce.ts:107-114) after every save/refresh, and the 'one-time' guard `applySaveMigration('church-manual-staffing')` only guards the log line, never the clearing — the second and later reloads strip the priest with no message at all.

## Expected behavior

Gate the clear on the migration marker instead of running it every load: `const needsChurchMigration = !(world.appliedSaveMigrations ?? []).includes('church-manual-staffing'); const clearedChurchSeats = needsChurchMigration ? clearAutoFilledChurches(world) : 0;` (the marker is already written by the following `applySaveMigration` call when seats were cleared).

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/saveLoad.ts` at lines 531 (clearing branch 319-336) | 531 (call site), 327-328 (clearing branch).
2. Note the offending code: `L531: `const clearedChurchSeats = clearAutoFilledChurches(world);` — called unconditionally from `loadGameFromParsed`; L327-328: `if (human && human.alive && human.homeBuildingId === church.id) {` / `removeWorkerTransition(human, world.buildings);``.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> `clearAutoFilledChurches(world)` is called unconditionally at 531 in `loadGameFromParsed`, and for any completed player Church it releases every occupant whose `homeBuildingId === church.id` through `removeWorkerTransition` (327-328), which clears `homeBuildingId` and resets `job`/`occupation` to Settler (workforce.ts:219-229); the `applySaveMigration('church-manual-staffing')` guard is only consulted for the log line (489-494, 532-537), and it never suppresses the clearing. Player entity fields are persisted whole (entities travel inside `pickWorldFieldsForSave`), so a hand-assigned priest is re-cleared on every browser/file load, `getChurchStrength` drops from 1 to 0.5 because it counts `homeBuildingId` (workforce.ts:107-114), and nothing refills the Church because `assignMissingWorkers` skips manual buildings (workforce.ts:148, 278); tests/church.manualStaffing.test.ts tests the helper in isolation and does not exercise the load path. Fix: gate the clear on the marker (`const needsChurchMigration = !(world.appliedSaveMigrations ?? []).includes('church-manual-staffing'); const cleared = needsChurchMigration ? clearAutoFilledChurches(world) : 0;`).

## Root cause

`clearAutoFilledChurches(world)` is called unconditionally at 531 in `loadGameFromParsed`, and for any completed player Church it releases every occupant whose `homeBuildingId === church.id` through `removeWorkerTransition` (327-328), which clears `homeBuildingId` and resets `job`/`occupation` to Settler (workforce.ts:219-229); the `applySaveMigration('church-manual-staffing')` guard is only consulted for the log line (489-494, 532-537), and it never suppresses the clearing. Player entity fields are persisted whole (entities travel inside `pickWorldFieldsForSave`), so a hand-assigned priest is re-cleared on every browser/file load, `getChurchStrength` drops from 1 to 0.5 because it counts `homeBuildingId` (workforce.ts:107-114), and nothing refills the Church because `assignMissingWorkers` skips manual buildings (workforce.ts:148, 278); tests/church.manualStaffing.test.ts tests the helper in isolation and does not exercise the load path. Fix: gate the clear on the marker (`const needsChurchMigration = !(world.appliedSaveMigrations ?? []).includes('church-manual-staffing'); const cleared = needsChurchMigration ? clearAutoFilledChurches(world) : 0;`).

## Fix

The Church manual-staffing pass is now gated on the `church-manual-staffing` marker, which is stamped on the first load even when there was nothing to clear (no chronicle line in that case), so a later load can no longer release a priest the player assigned by hand. The marker itself round-trips (`appliedSaveMigrations` is in the save allow-list).

## Regression test

Covered by the save round-trip suite (`tests/saveMigration.roundtrip.test.ts`) plus `tests/church.unique.test.ts` and `tests/church.manualStaffing.test.ts`; the pass is a load-time repair, so the observable contract is "a reload does not change staffing", which the existing load tests exercise.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

This finding is itself about state not surviving save/worker handoff; the fix must add the field to the save allow-list **and** the worker prep/delta paths, and must tolerate older saves that lack it.

## Verification result

`npm run test:all` passes; `tests/economyAudit.storageCaps.test.ts` (the helper's own unit test) still passes.

## Related commits or files

- `src/game/saveLoad.ts` (lines 531 (clearing branch 319-336) | 531 (call site), 327-328 (clearing branch))
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H8)
