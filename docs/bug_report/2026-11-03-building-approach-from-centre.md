# Building entry was measured from the footprint centre

- Bug: arrival at a building was tested against its footprint centre, which is inside the walls and unreachable. A large hospital could not be entered at all (the patient hovered at the wall and never rested), every school pupil snapped to the same neighbouring cell, and venue and well crowds converged on one point.
- Status: resolved
- Severity: high — exhausted and pregnant patients never reached a ward
- Date discovered: 2026-11-03
- Version/build: 0.6.5.1 working tree (0.6.5.2 development)
- Reporter: owner gameplay screenshots (`a lot of women are inside`, `he looked like he couldn't enter the hospital`, the stacked `SchoolTest…` pupils)
- Area: building approach, entry and distance rules
- Owner module: `src/game/humanHospitalBehavior.ts` (`isAtHospital`), `src/game/simulation/humanMovement.ts` (`humanBuildingTarget` school branch, commute distance), `src/game/humanTick.ts` (idle venue targets)
- Related PR/commit: fixed 3 November 2026

## Status history

- 2026-11-03 — open: found while checking every building's entry rule after the hospital observation.
- 2026-11-03 — resolved: entry accepts the nearest entrance, crowds use spread slots, and distance measures the building itself.

## Observed behavior

- **Hospital:** `needsMedicalCare` admits exhausted settlers (`energy < 42%`), but `tickHumanHospitalPatientCare` entered only within 36 px of the footprint centre. A 120 × 80 hospital puts its south wall 60 px from the centre, so an exhausted patient could stand at the door and never enter.
- **School:** `humanBuildingTarget` sent every pupil to `walkableStandPoint(building.x, building.y)` — the centre. The centre is not walkable, so every pupil snapped to the same fallback cell (`SchoolTest…` labels stacked on each other).
- **Venues and wells:** idle leisure steered to one front point (tavern, shop, church, hall) or the well centre, so crowds stacked on a pixel; only the social-impulse path used the spread arcs.

## Expected behavior

A settler enters at a reachable entrance; a crowd takes one distinct place per settler; distance-based assignment measures the building itself, not an individual's stand slot.

## Reproduction / evidence

1. `tests/hospitalWalk.regression.test.ts` — "admits an exhausted patient at a large hospital by its entrance, not its footprint centre": a patient 60 px from the centre but 8 px from the door was not admitted before the fix.
2. `tests/education.centerGeometry.test.ts` — a pupil at their own yard slot is in class; the class no longer collapses onto one cell.
3. `tests/humanMovement.test.ts` — venue and crowd slots are deterministic and distinct.

## Root cause

`enterHumanBuilding` is called only when the walker is close enough to a target; three callers measured that closeness from the footprint centre, and `walkableStandPoint` resolves an unwalkable centre to the same first walkable cell for every settler.

## Fix (applied)

- `isAtHospital` accepts the centre radius **or** the nearest entrance (`homeEntryPosition`), and the pregnant route steers to the entrance.
- School pupils use `venueGatherPosition` instead of the footprint centre; `isChildAtSchool` also counts a pupil inside the footprint, and commute distance now uses the building centre so roster order stays stable.
- Idle tavern, market/store, church, town-hall and well targets use `venueGatherPosition` / `crowdGatherPosition`.

## Regression coverage

`tests/hospitalWalk.regression.test.ts`, `tests/education.centerGeometry.test.ts`, `tests/school.test.ts`, `tests/humanMovement.test.ts`, `tests/residenceCommuteRelocation.test.ts`.

## Save compatibility

None: in-memory positions only.

## Verification

`npx vitest run tests/hospitalWalk.regression.test.ts tests/education.centerGeometry.test.ts tests/school.test.ts tests/humanMovement.test.ts tests/residenceCommuteRelocation.test.ts` — 46 passed. `npm run test:types`, `npm run lint`, `npm run build` — passed.
