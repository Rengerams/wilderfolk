# Bug: Human commute path cache misses on nearly every movement update

- Status: resolved — live verification pending
- **Date discovered:** 2026-08-20
- **Version/build:** 0.6.1-line
- **Reporter:** Human movement audit
- **Area:** Performance | Play | Truth
- **Owner module:** `src/game/simulation/humanMovement.ts` and `src/game/pathfinding.ts`
- **Cadence:** Realtime movement

## Observed behavior

Long commutes use `steerWithPath`, but the cache key passed by `commuteHumanToBuilding` contains `Math.round(entity.x)` and `Math.round(entity.y)`. A moving human changes rounded pixel coordinates almost every realtime update, so the same start tile and target can produce a new cache key every update. This defeats the bounded path cache and can trigger repeated A* searches for the same commute.

## Expected behavior

A cached path should be reused while the human remains in the same start tile and follows the same target/building route. The key should change when the map, target tile, route mode, or start tile changes—not on every small pixel movement.

## Reproduction steps

1. Generate a map containing a blocked river or mountain crossing.
2. Assign a human to a workplace on the other side of the obstacle.
3. Observe the human during a long commute.
4. Inspect the movement helper: the cache key changes with rounded pixel coordinates even when the human remains in the same terrain tile.

## Evidence

Current code in `humanMovement.ts`:

```ts
`c_${building.id}_${arrivingHome ? 'h' : 'w'}_${Math.round(entity.x)}_${Math.round(entity.y)}`
```

`pathfinding.ts` already clears the cache when the active map grid changes and bounds the cache size. The remaining key granularity is therefore unnecessarily fine.

## Root cause

The cache key uses pixel-level origin coordinates instead of the path grid's tile coordinates. Movement is continuous in pixels, while A* starts from a terrain tile. The key is more volatile than the path calculation requires.

## Fix

Use `Math.floor(entity.x / TERRAIN_TILE_SIZE)` and `Math.floor(entity.y / TERRAIN_TILE_SIZE)` in the commute cache key. Keep building ID, home/work mode, and map-grid invalidation unchanged. This preserves correctness while allowing reuse within a tile.

## Regression test

Add a focused movement test covering deterministic cache-key stability within a tile and a changed key after crossing a tile boundary. Retain existing pathfinding obstacle tests.

## Invariants checked

- Movement remains owned by realtime movement helpers.
- No daily, relationship, pregnancy, or economy state is written.
- Path cache is invalidated when the active map grid changes.
- A failed path still falls back to direct movement and cannot deadlock the simulation.

## Save/migration impact

None. The cache is transient and not serialized.

## Verification result

- Focused movement tests: 3/3 passed.
- Pathfinding tests: 5/5 passed.
- Moon Howler movement-filter tests: 2/2 passed.
- TypeScript validation: passed.
- Full regression suite: 40 files / 233 tests passed.
- Live visual movement verification: pending.

## Related files

- `src/game/simulation/humanMovement.ts`
- `src/game/pathfinding.ts`
- `tests/pathfinding.test.ts`
