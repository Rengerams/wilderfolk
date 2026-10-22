# Bug: Commute path cache key omits the target tile

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: Follow-up review of `Bug_ Human commute path cache misses on nearly every movement update.md`
- Area: Truth | Play | performance
- Owner module: `src/game/simulation/humanMovement.ts` commute cache-key transition
- Cadence: Realtime movement

## Observed behavior

The existing tile-granularity repair includes building ID, home/work mode, and origin tile in the commute path cache key, but it omits the target tile. A building target is not constant: `humanBuildingTarget()` varies work offsets and home stand positions by settler ID. Two settlers beginning in the same terrain tile and travelling to different target tiles at the same building can receive the same cached A* waypoint route.

## Expected behavior

A cached path must identify the route by both the A* start tile and the A* goal tile, as well as the existing building/mode identity. Cache reuse is valid only when those grid inputs are identical.

## Reproduction steps

1. Place a large or tile-boundary-crossing building whose deterministic worker/home targets land in more than one terrain tile.
2. Begin two settlers in the same origin tile and give them routes to target positions at that building that fall in different goal tiles.
3. Inspect `commutePathCacheKey()`: it produces the same key because it has no target coordinates.
4. `steerWithPath()` then looks up a route calculated for one goal tile while following the other settler's route.

## Evidence

`commutePathCacheKey()` currently accepts only `buildingId`, `arrivingHome`, `x`, and `y`, yet `steerWithPath()` calls `findPath()` with both origin and target tile coordinates. `humanBuildingTarget()` depends on `entity.id`, so its target can vary by more than one terrain tile around the same building.

## Root cause

The earlier fix corrected volatile pixel-level origin coordinates but did not include the independently variable goal tile in the path-cache identity.

## Fix

`commutePathCacheKey()` now includes origin and target coordinates quantized to `TERRAIN_TILE_SIZE`. `commuteHumanToBuilding()` passes its already-computed deterministic target to the key builder. Map invalidation, bounded cache behavior, and the direct-movement fallback are unchanged.

## Regression test

`tests/humanMovement.test.ts` now proves cache keys remain equal only while both start and target grid tiles match, and change when either endpoint tile or home/work mode changes. Focused movement and pathfinding suites passed: 2 files / 9 tests.

## Invariants checked

- Commute movement remains owned by realtime movement helpers.
- Cache identity mirrors all A* grid inputs: map, start tile, and goal tile.
- Failed/no path lookups still fall back to direct movement.
- No serialized state changes.

## Save/migration impact

None. The cache remains module-local transient state.

## Simulation Change Record

- Owner module: `src/game/simulation/humanMovement.ts` commute helper, calling the existing `pathfinding.ts` cache owner.
- Decision changed: commute cache identity now includes both A* endpoint tiles rather than only the start tile.
- Cadence: Realtime movement; no cadence change.
- State fields written: transient module-local path-cache entries only; normal entity velocity and heading writes are unchanged.
- Why the change is needed: the deterministic target for a building can vary by settler and cross a terrain-tile boundary, so a key without the goal tile can return a route for the wrong A* destination.
- Player-visible behavior before/after: commutes retain the existing route-around-obstacle behavior, but distinct valid goal tiles no longer share an incompatible cached route.
- Performance impact: preserves tile-local path reuse while preventing false cache hits; no new scans or cache growth policy changes.
- New or updated tests: `tests/humanMovement.test.ts`.
- Invariants checked: map/start/goal cache identity, direct fallback on missing path, transient-only state.
- Save/migration impact: none.
- Rollback plan: restore the previous signature only if a caller incompatibility emerges; retain the target-tile regression until a compatible cache identity is supplied.
- Acknowledgment: I have read the simulation authority, identified the owner and cadence, preserved the authoritative worker-state boundary, and introduced no second mutation path.

## Verification result

Focused movement and pathfinding tests passed (2 files / 9 tests). TypeScript validation, focused linting, the full suite (54 files / 344 tests), and the production build passed on 2026-08-21. One initial full-suite run encountered the pre-existing random-world fishing-placement flake in `tests/phase678.regression.test.ts`; its isolated rerun and the subsequent full-suite retry both passed. Existing circular-chunk and large-bundle build warnings remain unrelated.

## Related files

- `src/game/simulation/humanMovement.ts`
- `src/game/pathfinding.ts`
- `tests/humanMovement.test.ts`
- `BUG REPORTS/Bug_ Human commute path cache misses on nearly every movement update.md`
