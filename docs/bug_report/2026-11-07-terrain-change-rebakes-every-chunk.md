# A single terrain change re-baked every ground chunk

- Bug: One global terrain revision sat in every ground-chunk cache key, so paving a road or clearing a forest disposed and re-baked all baked ground, leaving a dark frame while the replacement baked.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (A6 render cache, GFX-11)
- Reporter: full-audit codebase review
- Area: renderer / terrain chunks
- Owner module: `src/game/terrain/terrainGrid.ts` (`bumpTerrainRevision`), `src/game/renderer/terrain.ts` (chunk bake)
- Related PR/commit: d2b85e44

## Status history
- 2026-11-07 — open: audit found the global revision in the chunk cache identity and the disposal-before-bake path.
- 2026-11-07 — resolved: per-cell dirty revisions, and a chunk keeps its previous bake until the replacement is whole.

## Observed behavior
Every terrain mutation bumped one module-level counter. The 1024-world-px ground chunk key embedded that counter, so the first mutation after the view settled changed the identity of all chunks at once: each was disposed, and the visible frame had no ground until the budgeted re-bake caught up. The report called the visible result the road/build dark flash; it fired on each road segment, building placement and forest clearing.

## Expected behavior
A mutation dirties only the render cells its footprint covers. Chunks outside the footprint keep their bake, and a dirty chunk keeps drawing its previous bake until the replacement is complete.

## Reproduction steps
1. Load a colony and let the ground settle.
2. Pave a road at any point in the world.
3. Observe every ground chunk re-bake and the intervening dark frame.

## Evidence
- `src/game/terrain/terrainGrid.ts` — `TERRAIN_RENDER_CELL` (256 world px) dirty-cell map; `bumpTerrainRevision(rect)` dirties only the covered cells; `terrainRegionRevision(rect)` returns that chunk's own revision.
- `src/game/renderer/terrain.ts` — `GroundChunk.revision`; a mismatch re-bakes that chunk only, and `refreshChunk` keeps the previous bake until the new one is whole.
- `tests/terrain.regionRevision.test.ts` — "dirties only the cells a local footprint covers" and "keeps a footprint touching a chunk edge in its own chunk".

## Root cause
Global invalidation token shared by every cache entry, with disposal ordered before the replacement bake.

## Fix / proposed fix
Invalidation takes an optional world rect and bumps per-cell revisions; each chunk compares its own region revision and re-bakes in place. A whole-map mutation still bumps the global revision without dirtying chunks.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/terrain.regionRevision.test.ts` — PASS (4/4).
- `npm run test:types` — PASS; `npm run lint` — PASS.
- Screenshot matrix of the road/build flash — NOT RUN (recorded as verification debt in the audit ledger).
