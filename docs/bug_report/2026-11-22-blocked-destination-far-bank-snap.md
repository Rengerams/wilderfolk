# Blocked destination snaps across the obstacle, so settlers walk the long way round

- Bug: A route to a blocked destination snapped the goal to the tile nearest the destination's centre, which can lie on the far bank of a river or the far side of a wall, so the settler walked a long detour to the wrong side before stopping.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-22
- Version/build: Wilderfolk 0.6.5.2 development
- Reporter: code review of `steerWithPath`, reproduced with a probe
- Area: movement / pathfinding steering
- Owner module: `src/game/pathfinding.ts` (`steerWithPath`, `routeToBlockedGoal`, `standTilesForWalker`, `searchRoute`)
- Related PR/commit: PR #181

## Status history
- 2026-11-22 — resolved: a blocked goal now takes its stand point from the walker's side of the obstacle.
- 2026-11-22 — resolved (review follow-up): the first stand tile chosen was never checked for connectivity, so a walkable tile inside a water pocket ended the walk even though the same ring held an open approach. Stand points are tried in preference order and the first one that actually routes wins.
- 2026-11-22 — resolved (second review follow-up): trying only the four nearest candidates still let a sealed neighbourhood exhaust the list, and the requested blocked tile remained as a last resort whose nearest-tile snap could cross to the far bank. One search now targets every walkable stand tile around the goal and stops at the cheapest it can actually reach.
- 2026-11-22 — resolved (third review follow-up): searching whole rings around the goal made a settler walk around an entire walled yard to a stand tile beside the goal although a reachable stand tile stood two tiles away. Stand tiles are now grouped into distance bands measured from the walker and the nearest band that routes wins, so the walk ends at the closest reachable stand instead of a far ring.

## Observed behavior
A settler standing on the east bank of a one-tile river, told to walk to a point on the river itself 50 px away, walked 918 px south to a bridge, crossed, came back north and stopped on the **west** bank. The west-bank settler walked 33 px and stopped on its own bank.

## Expected behavior
A destination that cannot be stood on is approached from the walker's own side: the walker stops at the nearest walkable stand point it can actually reach, and never crosses water or a wall to reach the opposite side.

## Reproduction steps
1. Build a one-tile-wide river column with a single bridge far to the south.
2. Put a settler on the east bank and steer it to a world point on the river 50 px away.
3. Before the fix the route crosses the bridge and ends on the west bank.

## Evidence
`searchRoute` snaps a blocked goal with `findNearestWalkable`, which ranks candidate tiles by distance to the goal's centre only; both banks are equidistant, and the tie broke to the lower column. Probe before the fix: `east bank { walked: 918, endedTile: '19,11' }`; after: `{ walked: 33, endedTile: '22,10' }`.

## Root cause
The nearest-stand-point rule ignored which side the walker is on. Connectivity was never part of the choice, so the chosen stand tile could be in a different region of the map.

## Fix / proposed fix
`steerWithPath` now approaches a blocked goal through `routeToBlockedGoal`. `standTilesForWalker` collects every walkable tile within four rings of the requested tile, except the walker's own tile, and groups them into bands by distance from the walker; `routeToBlockedGoal` searches the nearest band first and keeps the first band that routes. Distance orders the attempts and reachability decides them, so a walkable tile sealed in a pocket is skipped instead of ending the walk, and the walk ends at the closest reachable stand rather than a far ring around the obstacle. When no stand point routes the leg reports blocked; there is no distance-based last resort that could cross the obstacle. `findPath`/`findRouteCostOutcome` keep their documented nearest-tile contract because they have no walker to prefer.

## Save/migration impact
None. Transient route cache only.

## Verification result
- `npx vitest run tests/pathfinding.segmentTraversal.test.ts` — PASS, including "stands on the walker's own bank of a blocked destination", "keeps a blocked destination reachable when its nearest stand tile is sealed off", "stands on a reachable tile when every nearby stand tile is sealed in a courtyard" and "stops at the nearest reachable stand tile instead of a far ring around the goal"; the courtyard case returns `blocked` on the distance-only implementation and routes on the target-set search, and the far-ring case walks around a walled yard on ring-first selection and stops west of the wall on distance bands.
- Movement, navigation and commute suites (23 files, 227 tests) — PASS after the `main` merge, including commute, work absence, movement explanation, home entry and indoors arrival.
- Full unit suite (537 files, 3584 tests) — PASS after the `main` merge.
- Probe from the first report: east-bank walk 918 px → 33 px, ending on the correct bank.
