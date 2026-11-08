# Terrain caches survived map identity and override changes

- Bug: The ground-chunk cache key omitted map terrain identity, and the passability grid key omitted runtime terrain overrides, so stale ground and stale walkability survived a map change or a forest clearing.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (A6 render cache, COV-I-02 / SIM-18)
- Reporter: full-audit codebase review
- Area: renderer / pathfinding cache identity
- Owner module: `src/game/terrainLayer.ts` (`terrainChunkCacheKeyFor`), `src/game/pathfinding.ts` (`pathGridCacheKey`)
- Related PR/commit: d2b85e44

## Status history
- 2026-11-07 — open: audit found both string keys missing terrain identity that the caches depend on.
- 2026-11-07 — resolved: the chunk key carries terrain seed and generation version; the path grid key carries the terrain revision.

## Observed behavior
Two independent caches identified their content by hand-built strings:

- The legacy ground bake key used the map seed, preset and size, but not `terrainSeed` or `generationVersion`. Loading a save whose terrain regenerated under the same seed could reuse bakes of the previous world.
- The passability grid key used seed, preset, building signatures and size. Runtime overrides — forest clearings and tile writes that change walkability — are not buildings, so a cell that became river or road stayed open or blocked in the cached grid. Settlers could walk over freshly blocked ground or refuse a newly opened road until something else forced a rebuild.

## Expected behavior
A cache entry is reused only when everything its content derives from is unchanged: the chunk key includes the map's terrain identity, and the path grid key includes the terrain revision.

## Reproduction steps
1. Build a test map and confirm the target cell is open in `getPathGrid(map).blocked`.
2. Write a river override on that tile, rebake the grids and bump the terrain revision with its world rect.
3. Before the fix the cached grid still reported the cell open; the regression asserts it is blocked.

## Evidence
- `src/game/terrainLayer.ts` — `terrainChunkCacheKeyFor` includes seed, terrain seed, generation version, preset, map size and the chunk's own region revision.
- `src/game/pathfinding.ts` — `pathGridCacheKey` appends `getTerrainRevision()`.
- `tests/terrain.regionRevision.test.ts` — "keys the legacy chunk bake on the world identity and its own region".
- `tests/pathfinding.terrainRevision.test.ts` — "rebuilds blocked cells after an override is applied to an open tile".

## Root cause
Hand-enumerated cache keys that did not include every input their cached content depended on.

## Fix / proposed fix
Add the missing identity fields to both keys; no cache invalidation API change beyond the revision already bumped by terrain writes.

## Save/migration impact
None — only cache identity changed, not saved data.

## Verification result
- `npx vitest run tests/terrain.regionRevision.test.ts tests/pathfinding.terrainRevision.test.ts` — PASS (5/5).
- `npm run test:types` — PASS; `npm run lint` — PASS.
