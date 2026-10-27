# 2026-09-29-people-walk-through-water.md

- Bug: settlers walk straight through water when no route exists
- Status: resolved
- Date discovered: 2026-09-29
- Version/build: 0.6.5.1 (working tree, `main`)
- Reporter: owner, from play — *"people walk trough the water......."*
- Area: Play
- Owner module: `src/game/pathfinding.ts` (grid + routing), `src/game/simulation/humanMovement.ts` (steering)
- Cadence: per tick (movement)

## Status history

- 2026-09-29 — open (reported from play, no reproduction steps beyond the observation)
- 2026-09-29 — investigating (mechanism located in `pathfinding.ts`; report written before any fix, per `BUG_REPORTS/Readme.md`)
- 2026-10-09 — investigating (measured on the owner's save `wilderfolk-New-Frontier-Y3-D3`: 57 settlers stood on grid-blocked ground at load, and the three leaks below were located in the walk path)
- 2026-10-09 — resolved (every human walk step now goes through one grid-aware integration; the same save ends a day with 0 settlers on blocked ground and 0 blocked steps taken; each named test fails before the fix and passes after)

## Observed behavior

Settlers are seen standing on, and crossing, water tiles.

Measured at last on the owner's own save (`wilderfolk-New-Frontier-Y3-D3`, 1303 settlers): 57 settlers stood on grid-blocked ground at load — 2 in water, 10 inside a wall's footprint, 45 on reserved decor.

## Expected behavior

Water is impassable. `buildPathGrid` already marks it so — a tile is blocked when
`map.pathGrid[i] !== Walkability.Open`, falling back to `!isWalkableTerrainType(t.type)` for maps with
no L0 occupancy layer (`pathfinding.ts:116-118`) — so the grid is **not** the defect. A settler should
never occupy a blocked tile, and a walk with no route around water should stop or re-target rather
than cross it.

## Reproduction steps

Reproducible on demand since 2026-10-09: the original report had no seed, save or screenshot, but the
owner's own save now shows the defect and the repair at load and after a day.

1. Load `wilderfolk-New-Frontier-Y3-D3` (1303 settlers) and audit the ground: 57 settlers stand on
   grid-blocked ground — 2 in water, 10 inside a wall's footprint, 45 on reserved decor.
2. Run one in-game day with the colony actually running: 1301 settlers moved, 0 were on blocked ground
   afterwards, and 0 steps onto blocked ground were taken; the count stays 0.
3. At the unit level the cases named under Regression test reproduce each half of the fix.

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

Measured, not inferred. The straight-line steer had three doors into it, and each was invisible to the
grid:

- `humanMovement.commuteHumanToBuilding` asked the path owner only for legs longer than
  `COMMUTE_CONFIG.LONG_RANGE_DIST` (50 px), so shorter legs — and the last 50 px of every leg — steered
  straight at the target; the documented no-route fallback (`steerWithPath` → `'direct'`) then walked
  the straight line.
- `buildPathGrid` stamped a bridge's footprint into the `road` mask but never cleared the blocked water
  under it, so a bridge was only a cost discount on a tile the router still refused.
- The path cache advanced to the next waypoint from 14 px away, which cut a one-tile gap.

## Regression test

`tests/medium-A-movement.test.ts` — a walker at a river bank never enters the river; a walker at a wall
never passes through; a walker already on a blocked tile can walk off it; a short leg with a gap detours
and arrives. `tests/pathfinding.test.ts` — a bridge opens the water it spans. Each fails before the fix
and passes after (verified by temporarily reverting).

## Invariants checked

No human ends a walk step on a grid-blocked tile, and a walker already standing on a blocked tile is
allowed to walk out of it (`isWalkStepAllowed` returns true when the cell it occupies is blocked), so
the fix cannot freeze a settler that was already in water. After one in-game day on the owner's save,
0 of the 1301 moved settlers were on blocked ground and 0 blocked steps had been taken.

## Save/migration impact

None expected: this is movement, not stored state. A settler standing on water at save time would
persist their position across a load, but no new field is required — and the fix lets such a settler
walk out rather than freezing them.

## Verification result

On the owner's save `wilderfolk-New-Frontier-Y3-D3` (1303 settlers): 57 settlers stood on grid-blocked
ground at load (2 in water, 10 inside a wall's footprint, 45 on reserved decor). After one in-game day
with the colony actually running (1301 settlers moved), 0 were on blocked ground and 0 steps onto
blocked ground were taken; the count stayed 0.

Harness note: `scripts/inspect-save.mts` gained `reportGroundAudit` (classified counts plus a
`--days=N` forward audit). It must unpause the world first, because a load restores `paused: true` and
`gameTick` returns immediately — an earlier reading of "0 steps" was vacuous because of that.

## Known follow-ups (not fixed)

- Job and housing assignment still measure commutes as a straight line
  (`commuteReach.isWithinAssignableCommute`), so a settler can be posted across a river with no crossing
  and will wait at the bank.
- Visitors now use the shared integration, but animals are still not gated.

## Related commits or files

- `src/game/pathfinding.ts` — `buildPathGrid`, `RouteObstruction`, `steerWithPath`, `isWalkStepAllowed`, `isGroundWalkableAt`
- `src/game/simulation/humanMovement.ts` — `applyHumanWalkStep` (the shared integration), `commuteHumanToBuilding`, `commuteLeadHoursFor`
- `src/game/humanTick.ts`, `src/game/hotelStay.ts` — call sites of the shared integration
- `tests/medium-A-movement.test.ts`, `tests/pathfinding.test.ts` — the guards
- `scripts/inspect-save.mts` — `reportGroundAudit`, the measurement that closed the report
- `src/game/logisticsOverlayData.ts` — the existing blocked-commute projection, the earlier measurement surface

## Fix

Every human walk step now goes through one grid-aware integration
(`simulation/humanMovement.applyHumanWalkStep`, which refuses a blocked step and slides along it),
backed by `pathfinding.isWalkStepAllowed`; the routing owner is asked at every distance; a road/bridge
footprint clears the blocked water it spans; and the waypoint-reached radius is half a tile. A walker
already standing on a blocked tile is allowed to walk out of it (`isWalkStepAllowed` returns true when
the cell it occupies is blocked), so the fix cannot freeze a settler that was already in water; stand
points (workplace row, home arc, venue crowd slot, hotel walk) resolve by
`pathfinding.isGroundWalkableAt`, and the hotel guest walk uses the same integration.
