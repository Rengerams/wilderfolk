# Settlers could not enter their home from a non-south approach

- Bug: A settler whose house was approached from the north, east or west could remain outside at night even with a valid residence and an open frontage.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-02
- Version/build: 0.6.5.2
- Reporter: player observation
- Area: home commute, sleep and indoor occupancy
- Owner module: `src/game/simulation/humanMovement.ts`
- Related PR/commit: none

## Status history
- 2026-11-02 — open: player reported that some humans could not enter their house to sleep.
- 2026-11-02 — resolved: side-agnostic entry and footprint-correct porch geometry committed with focused regressions.

## Observed behavior
Some residents with `residenceBuildingId` set stayed outdoors at night. The failure was most visible around larger houses or houses whose south side was blocked: the settler walked toward a fixed south “porch” that could sit inside the building footprint or be unreachable.

## Expected behavior
A resident should enter an assigned completed residence from whichever side they reach it. The approach direction must not determine whether sleep is possible.

## Reproduction steps
1. Create a completed House, Mansion or Leader's House with residents.
2. Place a resident on the north, east or west side, within a few pixels of the wall.
3. Call `commuteHumanToBuilding(person, home, 2, true)`.
4. Before the fix the resident did not enter from those sides; the new regression expects `indoorBuildingId === home.id` from all four sides.

## Evidence
`homeStandPosition` targeted `building.y + building.height / 2 + 12`, which is inside the lower half of the footprint, despite its comment requiring a point south of the entire footprint. `commuteHumanToBuilding` always targeted that south point and only entered within 8 px of it, so a reachable north/east/west wall never counted.

## Root cause
The entry target had two coupled assumptions: a south-only porch and a porch offset based on half the building height. Both fail for tall houses and for approaches from another side.

## Fix / proposed fix
`homeStandPosition` now targets `building.y + building.height + 12`. Added `homeEntryPosition` (nearest walkable side) and `isAtBuildingEdge` (24 px, any wall) in the movement owner; `commuteHumanToBuilding` uses the nearest side when arriving home and enters immediately from any wall.

## Save/migration impact
None. No persisted fields or save schema changed.

## Verification result
- `node scripts/test.mjs unit homeEntry.geometry settlers.indoors` — PASS, 33 tests.
- `npm run test:types` — PASS.
- Full `npm run build` and lint results recorded in the session report.
