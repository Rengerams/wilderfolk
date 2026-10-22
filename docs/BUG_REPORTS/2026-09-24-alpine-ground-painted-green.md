# 2026-09-24

- Bug: the per-pixel ground bake colours land on absolute elevation, so rock, mountain and snow ground can never paint — and alpine tiles are drawn as lawn
- Status: resolved
- Date discovered: 2026-09-24
- Version/build: 0.6.5 working tree
- Reporter: terrain ground-look audit (`docs/private/audits/2026-09-24/terrain-ground-look.md`, finding T1/T2)
- Area: Play
- Owner module: `src/game/renderer/whittakerTerrain.ts` (the ramp) · `src/game/terrain/terrainGrid.ts` (the classifier that owns the bands)
- Cadence: every frame of every map — the ground bake is the whole land surface

## Status history

- 2026-09-24 — open (found by auditing the new terrain stack against the owner's in-game
  screenshot; measured with `tmp/audit-terrain.mts` before any edit)
- 2026-09-24 — resolved (bands shared with the classifier; regression test added and proved red
  against the pre-fix ramp by measurement)

## Observed behavior

The valley rendered as one flat green field with grey-green smears. A generated scandinavia map
(seed 12345, 2560×1920) contained **1.0 % `snow` tiles, 2.9 % `rocky` and 1.2 % `mountains`**, and
its bake contained **no white and no grey pixel anywhere** — snow and rock ground were painted with
the woodland colour ramp. Measured on land cells, the ramp's own bands were:

| preset | sea | `h < 0.30` | `0.30–0.58` | `0.58–0.72` | `0.72–0.88` | `≥ 0.88` |
|---|---|---|---|---|---|---|
| continental | 0.263 | 57.0 % | 35.9 % | 2.2 % | 0.5 % | **0.0 %** |
| scandinavia | 0.296 | 65.7 % | 29.0 % | 1.4 % | 0.4 % | **0.0 %** |

## Expected behavior

The ground paints the landscape `classifyTile` describes. `TERRAFORGE.md`: *"High crests —
wind-scoured rock and glacial snow"*, and *"15 biomes … flowing into one another"*. A tile the
pathfinder calls `Mountains` must not be lawn for the eye.

## Reproduction steps

1. `npx tsx tmp/audit-terrain.mts scandinavia` — prints the per-preset band table above.
2. `npx tsx tmp/probe-ground-look.mts scandinavia 1600 12345` — writes `tmp/ground-scandinavia.png`.
3. Open it: 3.9 % of the tiles are alpine; the image has no alpine colour.

## Evidence

The measured cause, from the audit probe:

```
classifier rock starts at e>=0.803; renderer rock ramp starts at h>=0.72 -> e>=1.016
classifier snow starts at e>=0.887; renderer snow ramp starts at h>=0.88 -> e>=1.176
elevation  p0 -0.084 p5 0.153 p50 0.419 p95 0.741 p100 1.077
```

The field's maximum is **1.077** and the ramp only turned white at **1.176** — snow was
unreachable by construction, and the rock arm began 0.2 above where the classifier puts it.
`tmp/look-before-scandinavia.png` is the before image; `tmp/look-after-scandinavia.png` the after.

## Root cause

`whittakerTerrain.groundColor`/`getInlandColor` measured height as `h = e - seaLevel`
(**absolute**), while `terrainGrid.classifyTile` measures it as `h = (e - seaLevel) / (1 - seaLevel)`
over the **land range**. The alpine thresholds are written for the normalised axis, so on any preset
with `seaLevel ≥ 0.12` they sit above the map's own maximum height. The two modules also stated the
bands twice (0.5 / 0.62 / 0.72 / 0.84 in the classifier, 0.30 / 0.58 / 0.72 / 0.88 in the renderer),
which is what let them drift apart. The same audit found the material detail keyed off the nearest
cell's biome *label* and the water ramp's two arms not meeting at the shelf edge (findings T15, T3).

## Regression test

`tests/groundLook.bands.test.ts` — 3 cases:

- **paints alpine tiles as stone, not as lawn** — over `scandinavia` / `highland` / `continental`,
  every pixel whose tile is `Mountains`/`Rocky`/`Snow` must be stone-coloured. Asserted as the
  systematic measure (mean green-minus-red < 12; measured now 0.58 / 1.03 / 0.79, and ~45 under the
  old ramp, which painted those tiles with the `h < 0.58` woodland band) plus a 0.2 % ceiling on
  lawn-green stragglers, which are the one-cell seam where the generator's river gorge steps ~0.4
  between neighbouring cells.
- **paints a cold crest as snow** — snow is the only ground that is bright *and* cooler than it is
  warm (sand is `[214,200,156]`, foam tops out at `[156,206,218]`); required share > 0.2 %, measured
  0 % pre-fix.
- **is deterministic, and a viewport bake matches the same crop of the whole map.**

## Fix

The bake takes its height axis and its band edges from the classifier — `LAND_BANDS`,
`COLD_TEMPERATURE`, `BEACH_BAND_OF_LAND_RANGE` and `MOISTURE_DRY_BELOW_FOREST` are now exported from
`terrainGrid` and read by both (`classifyTile` uses them too, so there is one statement of where the
mountains start). Alongside it: one continuous water ramp instead of two arms that did not meet, a
pixel-scale jitter on the coastline and river bank, material chosen from the smooth fields instead
of the nearest cell label, shading from a precomputed cell-resolution slope field, and a
vegetation-weighted season shift. Full list and measurements in `CHANGELOG.md` (0.6.5).

## Verification result

`npm run test:types` exit 0 · `npm run lint` 0 warnings / 0 errors · `npm run test:standard`
**268 files / 1464 passed, 2 skipped, 0 failed** · bake cost 2.00–2.10 s → 2.22–2.34 s at 2048×1536
(**+7…+12 %**).

## Related commits or files

- `src/game/renderer/whittakerTerrain.ts` — the bake
- `src/game/terrain/terrainGrid.ts` — `LAND_BANDS`, `COLD_TEMPERATURE`, `BEACH_BAND_OF_LAND_RANGE`, `MOISTURE_DRY_BELOW_FOREST`
- `docs/plans/terrain-ground-visual-enhancement-2026-09-24.md` — the plan
- `docs/private/audits/2026-09-24/terrain-ground-look.md` — the audit, findings T1–T15
