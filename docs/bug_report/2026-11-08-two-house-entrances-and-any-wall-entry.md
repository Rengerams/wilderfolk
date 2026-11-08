# Houses had two different entrances and admitted settlers through any wall

- Bug: A residence's doorway depended on the approaching settler in one path and was fixed to the south wall in another, so settlers vanished into a house from a side or back wall while the porch, the commute target and the dashboard each assumed a different door.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-08
- Version/build: 0.6.5.2
- Reporter: player observation of settlers disappearing at the back or side of a house
- Area: building entry, home commute, frontage and dashboard route
- Owner module: `src/game/buildingAccess.ts` (new), `src/game/simulation/humanMovement.ts`
- Related PR/commit: none

## Status history
- 2026-11-08 — open: player reported settlers disappearing into houses from the back or side; code review found three different entrance definitions in the movement owner.
- 2026-11-08 — resolved: one building access for route, movement, arrival, frontage and dashboard; four-sided and walled-front regressions pass.

## Observed behavior
`homeEntryPosition` chose the nearest of four wall midpoints to the settler, so the door moved with the approach direction. `isAtBuildingEdge` then admitted anyone within 24 px of any facade, ignoring walls and obstacles. `homeStandPosition` independently hard-coded a south porch. A settler who idled at the south porch could be routed to a north or side "door" on the way home and enter through that wall, while the dashboard and the porch still described the south front.

## Expected behavior
A building has one doorway. It lies outside the collision footprint, opens onto walkable ground, and is the single point used by route calculation, movement, arrival, the porch slots and the dashboard. A settler is admitted when they reach that doorway — from whichever side they approach — and never merely because they are close to a random wall.

## Reproduction steps
1. Create a completed House with a resident whose south side is open.
2. Put the resident west of the house and commute home; compare the target with `homeStandPosition` and with the point the dashboard reports.
3. Before the fix, `homeEntryPosition` returned the west wall midpoint and `isAtBuildingEdge` admitted the settler at that wall, while `homeStandPosition` and `humanBuildingTarget(home, id, true)` reported a south porch.

## Evidence
The former movement code had three separate entrance rules in one module: approach-relative side pick, any-wall 24 px admission, and a fixed south porch. The regression `tests/homeEntry.geometry.test.ts` previously asserted immediate admission at 10 px from each of the four walls — the behaviour that let settlers disappear into a side wall.

## Root cause
No single owner for "where a building's door is". Each consumer recomputed an entrance from its own assumptions, and two of those definitions disagreed.

## Fix / proposed fix
Added `buildingAccessPoint` as the one access owner: a point 12 px outside the footprint, on the first side (south, then east, west, north) whose doorstep is walkable and has two cells of open ground in front of it, so the access is outside the collision zone and reachable. Route targets, the home porch, hotel, prison, hospital and tryst approaches, the logistics dashboard and the arrival radius now read that point. Entry is granted within 24 px of the doorway instead of anywhere along any wall. The hospital's centre check also uses the shared building-centre owner instead of adding half the width to a centre-based coordinate.

## Save/migration impact
None. No persisted field is added, changed or interpreted differently; the access is derived from footprint geometry and the current walk grid.

## Verification result
- `npx vitest run tests/homeEntry.geometry.test.ts tests/humanMovement.test.ts tests/affairTrystSite.walkIn.test.ts tests/settlers.indoors.test.ts tests/humanChat.sleepAtHome.test.ts tests/hospitalWalk.regression.test.ts` — PASS, 6 files, 80 tests.
- `npx tsc -p tsconfig.app.json --noEmit` — PASS.
- New coverage: doorway outside the footprint on walkable ground, entry from all four approach sides by walking to the one door, and the door moving to the first clear side when the south front is walled in.
- The reported Barracks stall for Sharda is the separate route-fallback defect; this report does not claim it fixed.
