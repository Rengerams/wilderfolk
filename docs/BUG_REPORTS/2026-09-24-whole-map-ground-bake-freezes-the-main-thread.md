# 2026-09-24

- Bug: the per-pixel ground bake runs whole-map on the main thread, and a routine building placement re-bakes the world
- Status: resolved
- Date discovered: 2026-09-24
- Version/build: 0.6.5 working tree
- Reporter: terrain ground-look audit (`docs/private/audits/2026-09-24/terrain-ground-look.md`, finding T10)
- Area: performance
- Owner module: `src/game/renderer/terrain.ts` (the chunk cache and its key) · `src/game/renderer/whittakerTerrain.ts` (the bake)
- Cadence: every frame the ground is first needed — new game, loaded save, season change, and (before this fix) every cleared building footprint

## Status history

- 2026-09-24 — open (measured while auditing the new terrain stack: 3.65 s for one whole-map Medium bake, 0.43 s for a 1024×1024 viewport)
- 2026-09-24 — investigating, after a parallel change landed viewport chunking (1024 px chunks, one chunk of margin, still keyed on the terrain revision). Measured: **Huge at the 0.5× overview baked 28.3 Mpx / 17.0 s** for one frame, and **16.8 Mpx / 11.0 s** for a 0.7 Mpx view at 1.45× — more ground than the camera could show, and worse than the whole-map bake it replaced.
- 2026-09-24 — resolved (256 px chunks, chunk-aligned world step from the camera zoom, revision dropped from the key; measured below)

## Observed behavior

`buildTerrainCache` (`renderer/terrain.ts`) called `bakeWhittakerGround` for the **whole map** in one synchronous call, from inside the render pass. On a Medium map (2560×1920, 4.9 Mpx) that is **3.2–3.4 s**; at Large 1:1 it is **7.7–8.0 s**. The whittaker cache key included `getTerrainRevision()`, and `buildingPlacementActions.clearForestForFootprint` calls `bumpTerrainRevision()` — so **placing a building on forested ground re-baked the entire map**, freezing the frame for seconds, to produce an image that is byte-identical (the bake reads `elevation`/`moisture`/`temperature`/`riverDist`, none of which a clearing touches).

## Expected behavior

The ground a frame costs should be bounded by what the camera can see, not by map area (`whittakerTerrain.bakeWhittakerGround` takes a `viewRect` for exactly this), and an edit that changes no field the bake reads must not invalidate it.

## Reproduction steps

1. `npx tsx tmp/probe-ground-size.mts continental 2560 1920 1600 12345` — whole-map Medium bake, prints the time.
2. `npx tsx tmp/probe-chunk-plan.mts 1600 900 0.5` — the chunked first frame for each spec size at the overview zoom.
3. `npx vitest run tests/groundLook.bands.test.ts` — the invariants the arrangement rests on.

## Evidence

First frame, 1600×900 window, camera over the map centre, seed 12345, continental:

| map | 1024 px chunks, step 1 (as landed) | 256 px chunks, zoom-aware step |
|---|---|---|
| Medium @1.45× | 3.34 s | **1.87 s** |
| Large @1.45× | 8.24 s | **1.97 s** |
| Huge @1.45× | 10.97 s | **2.01 s** |
| Medium @0.5× | 3.24 s | **0.90 s** |
| Large @0.5× | 7.87 s | **1.91 s** |
| Huge @0.5× | 17.00 s | **2.80 s** |

For reference, the whole-map bake before any chunking: Medium 3.2–3.4 s · Large 7.7–8.0 s (1:1) · Huge 4.1 s (at 1:2, i.e. half resolution).

## Root cause

Three separate mistakes, each measured rather than assumed:

1. **The cost model was map area, not screen area.** One whole-map bake per key change, on the main thread.
2. **The key over-specified its input.** `getTerrainRevision()` was in it although the bake reads none of the arrays a terrain edit writes, so a build invalidated the world.
3. In the first chunked version: **a chunk was both too big to be cheap and too big to be precise** (a 1024² bake is 0.43 s, and chunk-alignment plus a full-chunk margin baked 16× the visible ground), and **the bake resolution ignored the zoom**, so the 0.5× overview still baked 1:1 and paid 4× for pixels the monitor could not show.

## Regression test

`tests/groundLook.bands.test.ts`, 5 cases — the two added for this defect are:

- **ignores the sparse override layer** — bake, clear 40 forest footprints through `patchTile` (the production write path), bake again, require a byte-identical image and 40 overrides present. This is the invariant the key rests on.
- **tiles exactly from chunks at a coarser world step** — four 256 world-px chunks at a world step of 2 must reproduce the matching crop of a whole-map bake at the same step pixel for pixel (a seam or a half-size chunk fails it).

## Fix

`renderer/terrain.ts` bakes one 256 canvas-px chunk per visible viewport cell, one chunk of margin, fields built once per map and shared; the key is `seed|preset|dims|season|step` and carries no revision; the cache entry stores the world rect each chunk covers, so a sub-sampled chunk is drawn at its world size. `whittakerTerrain.ts` gained `groundWorldStepForZoom(zoom)` (nearest power of two to `1/zoom`, floored at 1) and an explicit `worldStep` argument to `bakeWhittakerGround`; chunk origins stay multiples of the step, so the sampling lattice is continuous across chunk boundaries.

## Verification result

`npm run test:types` exit 0 · `npm run lint` 0 warnings / 0 errors · `npm run audit:deps` **no runtime import cycles** · `npm run test:standard` **268 files / 1464 passed, 2 skipped, 0 failed** · `tests/groundLook.bands.test.ts` 5/5.

## Related commits or files

- `src/game/renderer/terrain.ts` — the chunk cache, its key and the draw
- `src/game/renderer/whittakerTerrain.ts` — `groundWorldStepForZoom`, the `worldStep` argument
- `tmp/probe-chunk-plan.mts`, `tmp/probe-ground-size.mts` — the measurements
- `docs/private/audits/2026-09-24/terrain-ground-look.md` — finding T10
