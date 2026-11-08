# The human render pass rescanned buildings and re-sampled ground height every frame

- Bug: `drawHumans` ran a residence `find` per settler and rebuilt the status-icon context (schools, construction crews, barracks) on every repaint, and `terrainRiseAt` re-sampled the elevation field for every mover, even though both inputs are fixed for a simulation tick.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit build (A7 performance hot paths, COV-I-04)
- Reporter: 2026-11-07 full audit, main-thread performance pass
- Area: canvas renderer
- Owner module: `renderer/humans.ts` (status context and building lookup), `terrainAtlas.ts` (ground height)
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found the per-frame rescans in the settler pass and the per-mover height sampling.
- 2026-11-07 — resolved: the building list is indexed per tick, the status context is memoised per snapshot, and height-mesh vertices are sampled once per map.

## Observed behavior
On a settled scene the moving pass runs every frame while the world only advances once per tick. Each `drawHumans` call walked the whole `state.buildings` array once per settler for `isAsleepAtHome`/`isNearResidence`, and rebuilt the status context three more times over the same array plus a per-juvenile school map. `terrainRiseAt` then re-read the elevation field for every mover on every frame, although the height mesh, its lattice and the elevation field never change after generation.

## Expected behavior
Work that depends only on simulation state should be computed once per tick; work that depends only on the generated terrain should be computed once per lattice vertex.

## Reproduction steps
1. Build a night scene whose settlers are all asleep at their residences, with the homes last in the building list.
2. Wrap the buildings array in a read counter and call `drawHumans` twice with the same snapshot.
3. Before: 20 sleepers → 1,730 building reads per frame, 80 sleepers → 8,600; the repeated frame re-read 1,650.
4. Before: two movers standing in the same 32-px lattice cell each re-sampled the elevation field on every call.

## Evidence
- Building reads, 60 filler buildings ahead of the homes, one frame: 20 sleepers 1,730 → 320, 80 sleepers 8,600 → 560.
- Second repaint of the same unchanged snapshot: 1,650 building reads → 0.
- 200 movers inside one lattice cell after the cell's four vertices are sampled: 0 elevation reads (the sampling axis was re-derived the same way the shading path does).
- `tests/renderer.humanHotPaths.test.ts` (2) and `tests/terrainAtlas.riseCache.test.ts` (4) fail on the previous code and pass on the fix.

## Root cause
The sleeper cull asked the array for a residence by id per settler; the status context was rebuilt per call instead of per state; and `terrainRiseAt` interpolated from freshly sampled lattice vertices on every call instead of caching them.

## Fix / proposed fix
`drawHumans` now builds one id → building map per tick (keyed on array identity, length and tick, the same contract the colony blacksmith scan uses) and passes it to `isAsleepAtHome`. The status-icon context is memoised on the snapshot and the viewport-culled settler list, so it survives frames and command refreshes but never crosses a state change. `terrainAtlas` caches each height-mesh lattice vertex per map (the elevation field is generated once and never patched), bounded to 4096 entries, and `resetTerrainRiseCache` runs with the renderer cache reset.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/renderer.humanHotPaths.test.ts tests/terrainAtlas.riseCache.test.ts` — PASS (6).
- Related suites: `tests/settlers.indoors.test.ts`, `tests/groundChunk.rebake.test.ts`, `tests/groundChunk.bands.test.ts`, `tests/renderer.presentationLayout.test.ts`, `tests/renderSnapshot.staticLayerKey.test.ts` — PASS (46).
- `npm run test:types` — PASS; `npm run lint` — PASS; `npm run build` — PASS.
- Not measured: a browser frame-time profile at 2,500 settlers; the read counters are the recorded evidence.
