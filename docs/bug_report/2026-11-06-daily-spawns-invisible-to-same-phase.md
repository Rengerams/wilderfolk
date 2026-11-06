# Same-phase daily spawns are invisible to later daily systems

- Bug: `allAlive` is snapshotted before the daily layer; `pushNewEntity` queues spawns in `ctx.newEntities` but does not add them to that working list, so later systems in the same daily phase read a pre-spawn population.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: 0.6.5.1
- Reporter: Independent code review (user-supplied finding)
- Area: Daily simulation / entity bookkeeping
- Owner module: `simulation/simulationEntities.ts`, `tickLayerDaily.ts`, `dailyWorldEvents.ts`
- Related PR/commit: none

## Status history
- 2026-11-06 — open: review found stale population lists/counts within the daily phase.
- 2026-11-06 — resolved: phase-boundary merge helper added and used before the point-of-use counts and later daily systems.

## Observed behavior
`gameTick` builds `allAlive` before calling `tickLayerDaily`. Spawns routed through `pushNewEntity` reach `ctx.newEntities`, `entityById` and the spatial grids, but not `allAlive`. Population, world events, ecology metrics, migration and challenges therefore saw a list (and sometimes counts) taken before those spawns.

## Expected behavior
Later readers in the same daily phase see the spawns that earlier stages produced, and counts are recomputed after spawn/death work at the point of use.

## Reproduction steps
1. Run a daily tick whose world-event pass replenishes wildlife or spawns through an event.
2. Compare the counts passed to `tickEcosystemMetrics` / `tickDailyChallenges` with `ctx.newEntities`.
3. Observe the new entities are missing from the working list used by later systems.

## Evidence
`pushNewEntity` only pushed to `ctx.newEntities`; `tickLayerDaily` passed `allAlive` unchanged to the tail systems, while `countLivingPopulation` had to merge `ctx.newEntities` separately.

## Root cause
The daily working collection was not kept in step with the canonical spawn queue between ordered stages.

## Fix / proposed fix
Add `mergeNewEntitiesIntoAlive` to the entity-bookkeeping owner, then merge before the point-of-use counts, between the population/world-event/challenge stages, and before the ecology indexes read the population inside `tickDailyWorldEvents`.

## Save/migration impact
None.

## Verification result
PASS: new `tests/simulationEntities.mergeAlive.test.ts`; `npm run test:types`, `npm run lint`, targeted suites and build.
