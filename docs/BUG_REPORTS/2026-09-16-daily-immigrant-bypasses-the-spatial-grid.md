# The daily immigrant spawn bypassed the spatial grid, so the newcomer was invisible for the rest of the tick

- **Bug:** the daily immigration path pushed a newcomer straight into `state.entities` / `allAlive` and only updated the id maps (`indexEntity` + `indexLivingEntity`), never the spatial grids. The daily layer runs **after** the tick's `assertSpatialGridInvariants`, so the newcomer stayed invisible to social/hunt grid queries for the remainder of that tick, and the grid invariant gate could never observe the window
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** 2026-09-16 lifecycle/social audit, finding **F6** (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`); code-traced there, runtime-pinned here
- **Area:** Truth (spatial indexing) with a worker/save consequence (the newcomer's id maps were fine, its grid presence was not)
- **Owner module:** `src/game/dailyPopulation.ts` (`tickImmigration`), `src/game/simulation/simulationEntities.ts` (`pushNewEntity`)
- **Cadence:** daily (`tickLayerDaily` → `tickDailyPopulation`)

## Status history

- 2026-09-16 — open (audit finding; `pushNewEntity` and `syncEntityGrids` are the only grid writers, and the daily spawner used neither)
- 2026-09-16 — resolved (the spawn goes through the canonical `pushNewEntity` path, exactly as births already do; regression test added)

## Observed behavior

```ts
// src/game/dailyPopulation.ts (before)
state.entities.push(newcomer);
allAlive.push(newcomer);
indexEntity(entityById, newcomer);      // id map only
indexLivingEntity(state, newcomer);     // id map only
if ('newEntities' in ctx …) ctx.newEntities.push(newcomer);
```

`indexLivingEntity` is `entityIndex.ts:42-45` and touches no grid; only `pushNewEntity` /
`syncEntityGrids` do. `gameTick` asserts the grid invariants at `:217`, **before** the daily layer at
`:223`, so the missing index was invisible to both the queries and the check. It self-heals on the
next tick's `reconcile`, which is why the practical effect is one tick of a newcomer that social and
hunt queries cannot see, rather than corrupted state.

## Expected behavior

Every entity that enters the world during a tick is registered through the same spawn path, so its id
maps, the worker's `newEntities` delta **and** the spatial grids are consistent before the tick ends.

## Reproduction steps

1. `npx vitest run tests/dailyImmigration.gridSync.test.ts` — against the old manual push, the
   newcomer is not returned by `mobileGrid.forEachInRadius` around its own position
   (`expected [] to include 100`).
2. In a full tick: at a day boundary with an immigration roll that admits a settler, the newcomer
   cannot be found by grid queries until the following tick.

## Evidence

- `src/game/simulation/simulationEntities.ts:17-43` — `pushNewEntity` is the canonical path: it fills
  `ctx.newEntities`, indexes `ctx.entityById`, records wildlife/grass bookkeeping and calls
  `syncSpatialGridEntity(entity, ctx.grassGrid, ctx.mobileGrid)`.
- `src/game/simulation/humanLifecycle.ts:109,160` — births (including the newborn) already go through
  `pushNewEntity`, so this spawner was the odd one out.
- `src/game/tickLayerRealtime.ts:143-147` — the mobile grid is live in `ctx` from the first layer of
  the tick, well before the daily layer runs.
- `src/game/gameTick.ts:217,223` — the assert runs before the daily layer that spawns the immigrant.
- `src/game/simQueries.ts` `recordWildlifeBirth` ignores non-wildlife types, so routing a human
  through the canonical path cannot pollute the wildlife census (verified before switching).

## Root cause

A hand-rolled spawn in the daily owner that predates (or missed) the canonical `pushNewEntity` helper:
it reproduced two of that helper's three jobs (entity array, id maps, delta) and omitted the grid sync.

## Regression test

`tests/dailyImmigration.gridSync.test.ts` (2 tests), driving the real `tickDailyPopulation` with a real
`EntitySpatialGrid` and a seed whose first `dailyPopulation` draw admits a settler at the fixture's
~91 % chance:
- the admitted settler is findable in `mobileGrid` at its own position **in the same tick** (fails
  without the fix) and is present in `ctx.newEntities`;
- it is also in `state.entities`, in `ctx.entityById`, and its arrival is logged.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant
assertions satisfied. `SPATIAL_GRID_INVARIANT_CHECK` is a module-level constant (evaluated at import),
so the test asserts grid membership directly through the grid's own query API rather than by toggling
the dev-only gate.

## Save/migration impact

None. No field, format or key changed; a save taken mid-tick simply contains an immigrant that is
already indexed, and older saves repair themselves on their first tick.

## Verification result

- `npx vitest run tests/dailyImmigration.gridSync.test.ts` — passed (2 tests); one fails against the
  pre-fix manual push.
- `npm run build`, `npm run lint` (0/0), `npm run test:types` — passed.
- `npm test` / `npm run test:full-year` — passed (see the batch verification in `CHANGELOG.md`).

## Related commits or files

- `src/game/dailyPopulation.ts` — the manual push/index replaced by `pushNewEntity` (the `indexEntity`
  import became unused and was removed)
- `tests/dailyImmigration.gridSync.test.ts` — new

## Fix

```ts
state.entities.push(newcomer);      // authoritative world array
allAlive.push(newcomer);            // this tick's living set
pushNewEntity(state, ctx, newcomer); // newEntities + entityById + spatial grids
indexLivingEntity(state, newcomer); // id → living map for the optimistic display path
```

The order keeps every id-map write that existed before and adds the grid sync through the owner that
already owns it. The audit's alternative (moving the invariant assert after the daily layer) was not
taken: this addresses the cause rather than widening a check that runs only in dev builds.
