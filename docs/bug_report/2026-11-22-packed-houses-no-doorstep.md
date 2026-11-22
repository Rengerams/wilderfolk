# A house packed between neighbours has no doorstep, so its owner never moves

- Bug: A doorstep only counted when two path cells of open ground stood directly in front of the wall, so a building with neighbours closer than the standoff plus two cells had no valid approach on any side and its worker or owner stood still.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-22
- Version/build: Wilderfolk 0.6.5.2 development
- Reporter: commute probe over a packed housing block
- Area: movement / building access
- Owner module: `src/game/buildingAccess.ts` (`isOpenDoorstep`, `doorstepHasExit`)
- Related PR/commit: none

## Status history
- 2026-11-22 — resolved: a doorstep counts when the walker can step off it, so a narrow alley is a usable street.

## Observed behavior
In a 4 × 5 block of 40 × 30 houses spaced 60 px horizontally and 55 px vertically (20 px alleys, 25 px rows), the interior houses reported **zero** access points. `commuteHumanToBuilding` returned false with zero velocity, so 24 of 80 commutes never moved a single pixel over 3,000 ticks while the settlers stood beside the wall.

## Expected behavior
A house whose frontage is a two-tile alley is enterable: the walker stands at the door and walks along the street. Only a doorstep with no way off it (or with a wall or river between it and the facade) is rejected.

## Reproduction steps
1. Place houses 40 × 30 in a block with 20 px alleys.
2. Call `buildingAccessPoints` on an interior house: before the fix the array is empty.
3. Commute a settler into that house: it never enters and never moves.

## Evidence
`isOpenDoorstep` required `isGroundWalkableAt(x + normal * 2 * PATH_CELL)`, i.e. 20 px of open ground beyond a doorstep that already stands 12 px off the wall. A 20 px alley cannot satisfy 32 px of clearance, so every side failed. After the change the same probe reports 12 access points per house and 120 of 120 commutes arrive (previously 56 of 80, with 24 frozen).

## Root cause
The doorstep rule tested for empty ground instead of a usable stand point, and used the wrong measure: clearance straight out, rather than the walker's ability to step away along the street.

## Fix / proposed fix
`doorstepHasExit` replaces the clearance probe: the doorstep's own tile must have one walkable orthogonal neighbour that is not part of the building's stamped footprint, and the walker must be able to step to it through the shared traversal rule. The corridor check between the facade and the doorstep is unchanged, so a wall or river in front of a door still rejects that side. The rule is additive — every doorstep that passed before still passes.

## Save/migration impact
None. Access points are derived from the current grid and memoised per grid generation; no persisted field changed.

## Verification result
- `npx vitest run tests/buildingAccess.routeAround.test.ts` — PASS (17 tests), including the new packed-block case.
- `npx vitest run` over the pathfinding, navigation, commute, movement and indoor suites — PASS.
- Full unit suite (537 files, 3584 tests) — PASS.
- Probe: access points 0 → 12 for packed interior houses; commutes 56/80 → 120/120.
