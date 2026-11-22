# Blocked destination snaps across the obstacle, so settlers walk the long way round

- Bug: A route to a blocked destination snapped the goal to the tile nearest the destination's centre, which can lie on the far bank of a river or the far side of a wall, so the settler walked a long detour to the wrong side before stopping.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-22
- Version/build: Wilderfolk 0.6.5.2 development
- Reporter: code review of `steerWithPath`, reproduced with a probe
- Area: movement / pathfinding steering
- Owner module: `src/game/pathfinding.ts` (`steerWithPath`, `nearestStandTileToWalker`)
- Related PR/commit: none

## Status history
- 2026-11-22 — resolved: a blocked goal now takes its stand point from the walker's side of the obstacle.
- 2026-11-22 — resolved (review follow-up): the first stand tile chosen was never checked for connectivity, so a walkable tile inside a water pocket ended the walk even though the same ring held an open approach. Stand points are now tried in preference order and the first one that actually routes wins.

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
`steerWithPath` now approaches a blocked goal through `routeToBlockedGoal`: `standTilesForWalker` orders the stand points on the walker's side (nearest ring around the requested tile, bounded to four rings, then nearest to the walker) and the first candidate that actually routes wins, so a tile sealed in a pocket is skipped instead of stopping the walk. When no candidate routes, the requested tile is the last resort and the previous nearest-tile behaviour still applies. `findPath`/`findRouteCostOutcome` keep their documented nearest-tile contract because they have no walker to prefer.

## Save/migration impact
None. Transient route cache only.

## Verification result
- `npx vitest run tests/pathfinding.segmentTraversal.test.ts` — PASS, including "stands on the walker's own bank of a blocked destination" and "keeps a blocked destination reachable when its nearest stand tile is sealed off" (that case returned `blocked` with zero velocity before the reachability fix).
- Movement and commute suites (14 files, 194 tests) — PASS, including commute, work absence, movement explanation, home entry and indoors arrival.
- `npx vitest run tests/medium-A-movement.test.ts` — PASS after its fixture was corrected (its `pixel()` helper reads one tile index, so the walker had been placed at the origin tile).
- Full unit suite (537 files, 3584 tests) — PASS.
- Probe: east-bank walk 918 px → 33 px, ending on the correct bank.
