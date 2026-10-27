# Prison cannot seat the guard crew its own shifts require: 2026-10-01

- Bug: the Prison holds two occupants while its guard rule needs three, so round-the-clock coverage is unreachable and every prisoner escapes
- Status: resolved — live verification pending
- Date discovered: 2026-10-01
- Version/build: 0.6.5.0
- Reporter: owner, from play
- Area: Play
- Owner module: `buildings.ts` (capacity) + `gameConstants.ts` (`Prison` shift constants) + `prisonGuardDuty.ts` (the rule)
- Cadence: daily — `tickPrisonGuardDuty` runs from the daily layer (`dailyWorldEvents.ts:148`)

## Status history

- 2026-10-01 — open (owner, from play: *"ontsnapt iedereen uit de gevangenis"*, with the cause in the same breath: *"ik kan maar 2 bewakers aanstellen"*)
- 2026-10-01 — resolved — live verification pending (capacity raised to four and the prisoner cap derived from the crew the shifts need; `tsc` clean and three new tests green; the remaining check is a reload of the owner's save)

## Observed behavior

Prisoners do not serve their sentence: they slip out within days, one after another, so a save ends up with an empty prison and every jailed settler back in the colony. The Prison also accepts only **two** workers, and the staff picker refuses a third — so the coverage the game asks for cannot be assembled.

## Expected behavior

Three 8-hour guard shifts cover a full day (`Prison.GUARD_SHIFT_HOURS` 8 × `Prison.GUARDS_FOR_FULL_COVERAGE` 3 = 24 h), which is the design the constant carries in its own comment. A prison staffed with that crew has **no** unguarded hours and therefore no escape rolls, and the building must be able to seat the crew plus the prisoner it holds.

## Reproduction steps

1. Build a completed Prison and assign guards — no more than two are accepted.
2. Jail a settler (a caught affair: `arrestForScandal`).
3. Advance a few days. The chronicle logs *"<name> slipped out while the Prison was understaffed (2 guards for 24 h)"* repeatedly until the prison is empty.

## Evidence

- The rule: `src/game/prisonGuardDuty.ts:56-59` — `coverageHours = min(24, guards × 8)`; anything below 24 leaves that many escape attempts per day at 5 % each.
- The constants: `src/game/gameConstants.ts:203-207` — `GUARD_SHIFT_HOURS: 8`, `GUARDS_FOR_FULL_COVERAGE: 3`, `ESCAPE_CHANCE_PER_UNGUARDED_HOUR: 0.05`.
- The capacity, before the fix: `src/game/buildings.ts:488` — `maxOccupants: 2`.
- The staffing cap reads that same field: `src/game/buildingStaffingActions.ts:147`, `:200`, `:422`, `:430` (`building.occupants.length >= config.maxOccupants`).
- The arrest path, before the fix: `src/game/simulation/humanRelationships.ts:1308` — `prisonerCap = maxOccupants − 1`, i.e. it assumed exactly one guard slot.
- Arithmetic: two guards leave 8 unguarded hours → `1 − 0.95⁸ ≈ 34 %` per day that a prisoner escapes; one guard leaves 16 → `≈ 56 %`. With fewer than three guards a prisoner is out within days, which is what the owner saw as "everyone escapes".
- The owner's save, independently: the imprisonments filter shows four jailings (two at Y2 D48, two at Y2 D57), and the 360-day harness run reports `scandalImprisonments: 1` — consistent with prisoners not staying long.

## Root cause

Two owners of the same building disagreed about how many people it holds. `prisonGuardDuty` derives coverage from **8-hour shifts**, so its own comment requires three guards for 24 h; the building config allowed **two occupants in total**, and the arrest path reserved only one of them for a guard. Full coverage was therefore unreachable by construction, and every prison a player could actually staff ran with eight unguarded hours a day — the escape chance was not a risk the player could manage, it was a certainty.

## Regression test

Three tests in `tests/low-2-events-defense.test.ts`, `describe('prison coverage …')`:

1. **`maxOccupants ≥ GUARDS_FOR_FULL_COVERAGE + 1`** — the data guard that would have caught this bug: a prison must seat the crew the shifts need plus the prisoner it holds.
2. A prison with the full crew holds its prisoner for 120 simulated days, invariants clean.
3. A prison one shift short still leaks — so the fix does not quietly disarm the mechanic.

## Invariants checked

`collectSimulationInvariantErrors(world)` is empty with the full crew on the roster; the §5 occupant rule (every id in a building's `occupants` is a prisoner by `prisonBuildingId` or a guard by `homeBuildingId`) holds after the capacity change.

## Save/migration impact

None. Capacity is configuration, not saved state: existing saves get four slots on load, held prisoners stay held, and the escape rolls stop as soon as three guards are assigned. No schema change, no save version bump.

## Verification result

- `tsc -p tsconfig.app.json` — exit 0.
- `vitest run tests/low-2-events-defense.test.ts` — 14 passed (11 pre-existing + 3 new).
- `node scripts/test.mjs standard` — PASS, 247 files, 0 failed.

## Related commits or files

- `src/game/buildings.ts` — `maxOccupants: 2 → 4` plus the description
- `src/game/gameConstants.ts` — `Prison.GUARDS_FOR_FULL_COVERAGE` (already present, now the source the cap is derived from)
- `src/game/simulation/humanRelationships.ts` — the prisoner cap
- `src/game/prisonGuardDuty.ts` — unchanged; it was already right
- `tests/low-2-events-defense.test.ts` — the three tests

## Fix

The Prison seats **four**: three guard slots, which is exactly what `GUARDS_FOR_FULL_COVERAGE` says a full day needs, plus one for the prisoner they hold. The arrest path no longer hardcodes the single reserved slot — it derives its prisoner cap from the same constant (`maxOccupants − GUARDS_FOR_FULL_COVERAGE`), so the crew the shifts require is always seizable and the two numbers can no longer drift apart. The building's description now says *"Three guards cover a full day."* instead of *"Requires a Guard."*
