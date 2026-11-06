# Population/beds cache can ignore building-state changes

- Bug: The per-tick population snapshot cache key used entity/building counts and `totalBuildingsCompleted`, but not building level, type, completion or faction, so a same-tick housing change could return stale beds.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: 0.6.5.1
- Reporter: Independent code review (user-supplied finding)
- Area: Population projection / housing
- Owner module: `populationGrowth.ts` (`snapshotPopulation`)
- Related PR/commit: none

## Status history
- 2026-11-06 — open: review found the cache key too coarse.
- 2026-11-06 — resolved: the key now includes a building-state signature; a direct level change recomputes without an explicit invalidation.

## Observed behavior
The cache returned the previous snapshot whenever tick, entity count, building count, `humanPopulation` and `totalBuildingsCompleted` matched. A House level change (or any type/completion/ownership mutation) does not necessarily change those values, so bed capacity could remain at its old value. Callers such as the upgrade path did invalidate, but correctness depended on every writer remembering to do so.

## Expected behavior
The cache must notice every field the snapshot derives from, or a stale snapshot must be impossible without relying on caller discipline.

## Reproduction steps
1. Take `snapshotPopulation` for a completed House at level 1.
2. Increment the House level in the same tick without calling the invalidation helper.
3. Call `snapshotPopulation` again; before the fix it returned the level-1 bed count.

## Evidence
`computePopulationSnapshot` reads `getResidenceCapacity(building)`, which depends on `building.level`; the cache key did not include it.

## Root cause
The cache key tracked collection sizes and completion totals rather than the building fields the projection reads.

## Fix / proposed fix
Add a stable building-state signature (id, type, level, completed, faction) to the cache entry and compare it on a potential hit. Keep the existing explicit invalidation helper for nondeterministic writers.

## Save/migration impact
None.

## Verification result
PASS: new same-tick level-change regression in `tests/populationGrowth.openPlayerBeds.performance.test.ts`; `npm run test:types`, `npm run lint`, targeted suites and build.
