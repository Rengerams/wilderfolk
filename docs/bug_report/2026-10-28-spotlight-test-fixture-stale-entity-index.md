# Spotlight movement regression uses a stale ID index after replacing the population

- Bug: the new real-tick spotlight regression asserted that the scene should remain gathering, but `gameTick` aborted it because its fixture had replaced the entity array without rebuilding the tick-persistent entity lookup map.
- Status: resolved (code corrected on PR #91; latest CI confirmation pending)
- Severity: low (CI/test infrastructure; no confirmed live-game defect)
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2 development, PR #91
- Reporter: GitHub Actions `tests/spotlightLore.test.ts` assertion at line 189, 2602 other tests passing
- Area: spotlight regression test / entity indexing
- Owner module: `tests/spotlightLore.test.ts` (fixture); production index contract belongs to `src/game/entityIndex.ts`
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/91 ; `969448ba08c8ed162325ceed8698c359009b7809`

## Status history
- 2026-10-28 — open: real-tick fixture failed with `expected undefined to be 'gathering'`; spotlight event had been cleared by validation after the tick.
- 2026-10-28 — resolved in code: rebuild the fixture's `entityById` using the existing index owner and invalidate its entity-type cache after replacing the complete population.

## Observed behavior
The test used `initGame(..., skipTerrain: true)`, which already indexed original founders and wildlife. It then replaced `world.entities` with Ada plus eight adults. Since `entityById` was a canonical existing map bound to the same world object, `ensureEntityByIdMap` reused it instead of scanning the new population. At end of `tickLayerRealtime`, `tickSpotlightGathering` looked up Ada's ID, obtained no living heroine, and called `finishSpotlightLore(..., 'aborted')`. The scene was null, so `world.spotlightLore?.phase` evaluated to undefined.

## Expected behavior
The fixture must satisfy the production `entityById`/entity-array consistency invariant so the real tick sees all selected actors. The regression must then catch actual home-commute movement overwrites, rather than fail for an unrelated test setup error.

## Reproduction steps
1. In `tests/spotlightLore.test.ts`, create a full `initGame` world and replace `world.entities` without updating its cached indexes.
2. Set an active gathering with the new actor IDs and advance one real `gameTick`.
3. Assert `world.spotlightLore?.phase === 'gathering'`; it was undefined despite a valid staged scene.

## Evidence
GitHub Actions output: 1 failed / 396 passed test files, 2602 passed individual tests and 2 skipped. `entityIndex.ensureEntityByIdMap` reuses an existing map marked canonical for that `WorldState`; the fixture's replacement did not clear or rebuild it.

## Root cause
Test-fixture inconsistency: direct `world.entities = ...` assignment bypassed existing entity-index ownership and lifecycle rules. Not evidence that production code loses selected spotlight participants.

## Fix / proposed fix
In the regression only, call `rebuildEntityByIdMap(world)` and `invalidateCachedEntityByType(world)` immediately after replacing `world.entities`. Leave production index and spotlight behavior unchanged.

## Save/migration impact
None. No runtime schema, save or worker changes.

## Verification result
- Source trace and code patch: completed; code committed.
- Focused Vitest rerun / full CI: PENDING after commit.
- Browser verification: NOT RUN.
