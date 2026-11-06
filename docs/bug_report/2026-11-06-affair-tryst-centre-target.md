# Lovers walk into the tryst house wall instead of using its doorstep

- Bug: Both partners of an affair steer at the chosen house's blocked footprint centre, so they press against opposite walls and the rendezvous never reaches the intimate range or indoor entry.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: Wilderfolk 0.6.5.2 development
- Reporter: player observation
- Area: relationships / human movement
- Owner modules: `src/game/humanTick.ts` (tryst approach steering), `src/game/simulation/humanMovement.ts` (shared outdoor entry point)
- Related PR/commit: none

## Status history
- 2026-11-06 — resolved: the tryst target is now the shared walkable doorstep and the walk is routed by the path owner; targeted affair, indoor and movement regressions pass.

## Observed behavior
A settler with an established affair walks toward the selected lover's house, reaches a wall and stays there. The other lover can approach the same footprint from another side, so the two never get close enough for `isValidAffairTrystSite`, and neither enters the house. It reads as someone repeatedly trying to walk through a building.

## Expected behavior
An indoor tryst is entered through a reachable outdoor point on the chosen residence. Both partners must target the same point, route around obstacles, and only enter after the shared tryst condition is satisfied.

## Reproduction steps
1. Give two lovers an established mutual affair and a completed residence assigned to one of them.
2. Place one partner north of the house and the other south, both within the tryst-selection radius.
3. Let the night tryst branch run. Before the fix both steered at the centre and stalled on opposite walls.

## Evidence
`getAffairTrystTarget` returned `getBuildingCenter(trystBuilding)`, a point the path grid marks blocked. The affair branches then set a straight-line velocity toward it instead of asking the path owner. `affairTrystSite.walkIn.test.ts` now asserts the shared entry point lies outside the footprint, and the existing indoor/affair suites remain green.

## Root cause
The rendezvous target was the building centre, which is unwalkable, and the approach bypassed `steerWithPath`; the pair therefore had no common reachable point.

## Fix / proposed fix
Added `affairTrystEntry` in `humanMovement` to return the same walkable doorstep for both partners. The two tryst approach branches in `humanTick` now steer through `steerWithPath`, so walls and water are routed around while the direct fallback is retained only when the line is clear.

## Save/migration impact
None. No persisted fields or save schema changed.

## Verification result
- `npm test -- unit affairTrystSite.walkIn` — PASS (11 tests).
- `npm test -- unit settlers.indoors` — PASS (28 tests).
- `npm run test:types` — PASS.
- `npm run build` — PASS (includes TypeScript, ownership/overlap, lint, duplicate scan and Vite build).
- Full `npm test -- unit` — 3020 passed; one dashboard call-site assertion in `uiSingleOwner` was stale after the chart change, updated, and its targeted rerun passed. No pathfinding test failed.
