# 2026-09-29-people-walk-through-water.md

- Bug: settlers walk straight through water when no route exists
- Status: investigating
- Date discovered: 2026-09-29
- Version/build: 0.6.5.1 (working tree, `main`)
- Reporter: owner, from play — *"people walk trough the water......."*
- Area: Play
- Owner module: `src/game/pathfinding.ts` (grid + routing), `src/game/simulation/humanMovement.ts` (steering)
- Cadence: per tick (movement)

## Status history

- 2026-09-29 — open (reported from play, no reproduction steps beyond the observation)
- 2026-09-29 — investigating (mechanism located in `pathfinding.ts`; report written before any fix, per `BUG_REPORTS/Readme.md`)

## Observed behavior

Settlers are seen standing on, and crossing, water tiles.

## Expected behavior

Water is impassable. `buildPathGrid` already marks it so — a tile is blocked when
`map.pathGrid[i] !== Walkability.Open`, falling back to `!isWalkableTerrainType(t.type)` for maps with
no L0 occupancy layer (`pathfinding.ts:116-118`) — so the grid is **not** the defect. A settler should
never occupy a blocked tile, and a walk with no route around water should stop or re-target rather
than cross it.

## Reproduction steps

Not yet reproducible on demand. The owner's report is an observation from play with no seed, save or
screenshot attached, so the trigger condition is inferred from code rather than demonstrated.

1. Play a valley whose settlement and a destination are separated by water (a river or lake between
   them).
2. Watch a settler whose workplace or home is across that water.
3. Reported: they cross the water instead of routing around it or not making the trip.

## Evidence

Two code facts, both read from the tree:

1. **The fallback is explicit and documented at the point of use.** `RouteObstruction` declares
   `'blocked'` as *"The line is blocked and no route exists — the walk falls back to the straight
   line"* (`pathfinding.ts:481-482`). `commuteHumanToBuilding` (`simulation/humanMovement.ts:155-172`)
   calls `steerWithPath`; when that returns anything other than `'path'` or `'arrived'`, the function
   steers **directly** at the target — `entity.vx = (dx / dist) * step` — with no passability test on
   the way. So a leg with no route is walked straight across whatever is in between.
2. **Content of the water is therefore decided by whether a route exists at all.** The same water is
   impassable for a settler with a detour and passable for one without, which is why the report is
   intermittent rather than constant.

## Root cause

Not yet established. The surviving candidate is the documented `'blocked'` fallback above: a
straight-line steer is the one movement path that does not consult `blocked[]`, so it is the only
mechanism found that can put a settler on a water tile. **Not yet confirmed**, because two things
would have to be true and neither has been measured:

- that a real commute in a generated valley actually reaches `'blocked'` (rather than re-routing),
  and
- that the fallback is reached through `commuteHumanToBuilding` rather than one of the other steering
  callers (`humanLeisureBehavior`, `humanVenueBehavior`, `tickTavernService`), which pass different
  `rush` values and are not all routed through the same branch.

Also unchecked: whether `findNearestUnblockedTile` (`pathfinding.ts:235`) can place a settler's start
or target *inside* a large water body, which would be a second and independent way onto the water.

## Invariants checked

None yet. The measurement needed first is how often a walk reports `RouteObstruction === 'blocked'`
in a real run, and whether any settler's position lands on a `blocked[]` tile. `logisticsOverlayData`
already classifies blocked commutes for the overlay, so the counting surface exists.

## Save/migration impact

None expected: this is movement, not stored state. A settler standing on water at save time would
persist their position across a load, but no new field is required.

## Related commits or files

- `src/game/pathfinding.ts` — `buildPathGrid`, `RouteObstruction`, `steerWithPath`
- `src/game/simulation/humanMovement.ts` — `commuteHumanToBuilding` (the fallback), `commuteLeadHoursFor`
- `src/game/logisticsOverlayData.ts` — the existing blocked-commute projection, a ready measurement surface

## Fix

None yet. Deliberately not guessed at: the honest first step is to measure whether `'blocked'` is
actually reached and whether any settler occupies a blocked tile, because a fix that made the
fallback refuse to move would also stop a settler that is merely stuck, and that is a worse bug.
