# Bug: Connected project executes a stale duplicate human-movement module

- **Status:** fixed pending live verification
- **Date discovered:** 2026-08-20
- **Version/build:** Wilderfolk 0.6.1.1
- **Reporter:** Full movement and lifecycle audit
- **Area:** Play | performance | Truth
- **Owner module:** `src/game/simulation/humanMovement.ts`
- **Cadence:** realtime movement

## Status history

- 2026-08-20 — open (full audit found divergent runtime and tested movement owners)
- 2026-08-20 — investigating (reproduction confirmed with focused movement test)
- 2026-08-20 — fixed (runtime owner now uses the tested tile-stable cache key)

## Observed behavior

The connected project contains two human-movement modules:

- `src/game/humanMovement.ts`
- `src/game/simulation/humanMovement.ts`

`humanTick.ts` imports the `simulation/` copy, and the movement test also imports the `simulation/` copy. The root-level copy contains the tile-stable `commutePathCacheKey` export, while the runtime `simulation/` copy does not export that helper and still builds path keys from rounded pixel coordinates.

The focused movement suite therefore fails with `TypeError: commutePathCacheKey is not a function`, and the live runtime retains the inefficient pixel-granularity path cache.

## Expected behavior

There must be one authoritative human-movement owner. The module imported by `humanTick.ts` must expose the tested tile-stable cache-key helper and use terrain-tile coordinates for path reuse.

## Reproduction steps

1. Run `npx vitest run tests/humanMovement.test.ts` in `C:\wilderfolk`.
2. Observe the missing `commutePathCacheKey` export.
3. Inspect `humanTick.ts` and observe that runtime imports `./simulation/humanMovement`.
4. Inspect both movement modules and observe divergent cache-key implementations.

## Evidence

- `src/game/humanTick.ts:75` imports `./simulation/humanMovement`.
- `src/game/simulation/humanMovement.ts:81` uses `Math.round(entity.x)` and `Math.round(entity.y)`.
- `src/game/humanMovement.ts:59-66` contains the tested tile-stable `commutePathCacheKey`.
- Focused tests: pathfinding 5/5, invariants 29/29, movement 2/3 with the cache-key export failure.

## Root cause

A movement split created a duplicate root-level module but the runtime import remained pointed at the stale `simulation/` copy. The two files drifted instead of sharing one source of truth.

## Fix

Make `src/game/simulation/humanMovement.ts` the sole runtime owner by adding the shared `commutePathCacheKey` helper and using it in `commuteHumanToBuilding`. Then either remove the unused root-level duplicate or convert it to a compatibility re-export after checking all imports.

## Regression test

Keep `tests/humanMovement.test.ts` importing the runtime owner and assert tile-stable keys, distinct adjacent-tile keys, and distinct home/work keys. Add an import-ownership check if the duplicate root-level file remains.

## Invariants checked

- Movement remains owned by realtime tick helpers.
- No cadence or movement-speed change.
- A* cache entries are not reused across different origin tiles.
- Runtime and tests use the same movement owner.

## Save/migration impact

None. Only movement helper code and transient path-cache behavior change.

## Verification result

- Movement tests: 3/3 passed.
- Pathfinding tests: 5/5 passed.
- Simulation invariant tests: 29/29 passed.
- Full suite after repair: 51 files / 334 tests passed.
- TypeScript validation: passed.
- ESLint: passed.
- Live commute verification: pending.

## Related files

- `src/game/humanTick.ts`
- `src/game/humanMovement.ts`
- `src/game/simulation/humanMovement.ts`
- `tests/humanMovement.test.ts`
