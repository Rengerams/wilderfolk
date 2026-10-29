# A cleared camp footprint baked as altitude-darkened green, not grassland

- Bug: a grassland override on a snowy mountain map baked too dark to read as grass, and the ground test that pinned "the bake ignores overrides" still asserted the opposite of what the bake now does.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: 0.6.5.1, branch `node-beta-support`
- Reporter: failing tests `tests/terrain.clearingVisuals.test.ts` and `tests/groundLook.bands.test.ts`
- Area: renderer / ground bake
- Owner module: `renderer/whittakerTerrain.ts` (bake), `renderer/terrain.ts` (chunk key)
- Related PR/commit: this branch

## Status history
- 2026-10-29 — open: both tests reproduced in the container.
- 2026-10-29 — resolved: the clearing takes the lowland band and a temperate tint; the chunk-key invariant test now pins the behaviour the renderer has.

## Observed behavior
`clearingVisuals` measured a cleared mountain pixel at green − red = 17 where the test requires more than the untouched field's 8 + 10. `groundLook.bands` failed from the other side: it asserted that adding 40 grassland overrides leaves the bake byte-identical, which stopped being true when clearings were blended into the bake.

## Expected behavior
A cleared footprint reads as grassland — the colour the classifier gives that tile — and the cache that holds the bake cannot keep a pre-clearing image.

## Reproduction steps
1. Generate a Black Forest map, force a cold high-elevation field, bake a 64 px crop around tile (64, 48).
2. Set a 5×5 grassland override there and bake again.

## Evidence
- Before the fix: green − red went 8 → 17 (threshold 18), i.e. the cleared pixel was still darkened by its altitude.
- `bakeWhittakerGround` already reads `clearingMask`; the chunk key already carries `getTerrainRevision()`, which `buildingPlacementActions` bumps on a footprint clearing — so the stale assertion, not the cache, was wrong.

## Root cause
The clearing clamped height to just under the hills band, which is still high-altitude ground, and the temperature target sat exactly on the cold fade's end — so the pixel kept a dark, cold forest tint. The band test predated the blending change and pinned its opposite.

## Fix / proposed fix
A cleared pixel takes the lowland band (`LOWLAND_OF_LAND_RANGE`) and a temperate tint past the cold fade. The band test now asserts what the renderer relies on: the bake repaints a cleared footprint and the ground revision (part of the chunk key) moves with it.

## Save/migration impact
None; overrides and saved terrain are unchanged.

## Verification result
- PASS `npx vitest run tests/terrain.clearingVisuals.test.ts tests/groundLook.bands.test.ts`.
- PASS `tests/terrain.riverMaterials.test.ts`, `tests/terrain.visualCoherence.test.ts`, `tests/groundChunk.bands.test.ts`, `tests/terrain.landformGraphics.test.ts`.
