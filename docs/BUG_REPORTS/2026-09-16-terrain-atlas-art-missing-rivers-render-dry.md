# The painted terrain atlas art is missing, so rivers render constantly dry: 2026-09-16

- Bug: rivers (and every water tile) render dry in the game view at every zoom, while the minimap shows them correctly in blue
- Status: resolved — **superseded 2026-09-17**: the atlas art *is* shipped, so this report's "atlas art missing" premise is false; the dry map was caused by the Pixi terrain container never being attached to `app.stage` (`2026-09-17-pixi-terrain-container-never-attached-to-the-stage.md`)
- Date discovered: 2026-09-16
- Version/build: 0.6.4
- Reporter: reported from play ("rivers are constantly dry"; "on the minimap it looks great")
- Area: UI
- Owner module: `terrainLayer.ts` / `terrainAtlas.ts` (painted terrain), `spriteLoader.ts` (art availability)
- Cadence: every frame (render path)

## Status history

- 2026-09-16 — open (reported from play; the atlas and overlay sprites were then traced to
  `public/sprites/` and are not present)
- 2026-09-16 — resolved (owner: "don't use the atlas then… fine if it looks like the minimap").
  `terrainLayer.ts` gained `USE_PAINTED_ATLAS = false`, so `pickAtlasTile` is never consulted and every
  tile is painted by `drawTerrainFill` — the per-type fill sprites that do ship (`water_deep_fill.png`
  for `River`/`DeepWater`, `water_shallow_fill.png` for `ShallowWater`, `grass_fill.png`, …) with the
  existing neighbour blends, per-season base colours and water glazes. Water therefore reads in the same
  blue family the minimap uses, and a tile whose sprite were also missing still falls back to its
  seasonal colour rather than to nothing. `test:types` 0, `lint` 0/0, the terrain suites 21 passed,
  `build` pass, browser smoke pass (0 console/page/request errors), `npm test` green. Re-enabling the
  atlas later is one constant plus the two art files.
- 2026-09-17 — **superseded** (the premise did not survive measurement). `public/sprites/tileset_grass.png`
  **is** in the tree — 192×336 RGBA, 210/252 tile slots non-empty, and all ten water-family tiles
  `ATLAS_TILES` uses are blue-dominant (all-water id 61 = `rgb(73,85,126)`; grass base id 3 =
  `rgb(127,158,69)`). Only `sand_water_overlay.png` is genuinely absent, and `terrainAtlas.ts` already
  treats that sheet as optional (`overlayReady ? … : null`), so it cannot blank a tile. Instrumented
  pixel readback then showed the canvas2D path painting water correctly and **every Pixi frame painting
  nothing at all** — all terrain types read exactly `VOID_WATER` `rgb(22,40,61)`. Root cause and fix:
  `2026-09-17-pixi-terrain-container-never-attached-to-the-stage.md`. At the time this was written,
  `USE_PAINTED_ATLAS = false` had changed a path the player never saw, since Pixi was the live ground
  renderer. **That is no longer the state of the tree:** the ground now ships through the canvas2D path
  (`USE_PIXI_GROUND = false`), so this constant is load-bearing again and decides the visible tile art.
  It stays `false` — that is the look the owner approved — and re-enabling the atlas is a visual
  decision, not a correction.

## Correction (2026-09-17)

Two claims below are **factually wrong** and are left in place only as a record of how the
misdiagnosis was reached. Read them with this correction:

1. "A recursive listing of `public/sprites/` … finds neither" — false. The listing behind it covered
   `public/sprites/terrain/` only; `tileset_grass.png` lives at `public/sprites/tileset_grass.png`.
   Verified present by direct measurement of the PNG bytes.
2. "the painted atlas art is genuinely absent … so in the canvas2D path the water family had no
   pixels" — false for the same reason. The atlas ships and its water tiles are blue.

The symptom itself was real, but it was **not** a water-specific defect: the entire ground layer was
absent, water simply made it most obvious. The minimap was correct because it needs no art.

## Observed behavior

Water tiles read as dry land in the game view: rivers have no water surface at any zoom. The
same map's minimap shows rivers in blue, which is why "on the minimap it looks great".

The two views paint from different sources:

- **Minimap** — `MiniMap.tsx:13-26` `TERRAIN_DOT` hard-codes a colour per terrain type
  (`River: '#3b82a8'`, `ShallowWater: '#2a5a8c'`, `DeepWater: '#1e3a5f'`) and fills tiles directly
  (`:57-76`). It needs no art at all, so it is always correct.
- **Game view** — the painted terrain path resolves a tile to an atlas family and tile id
  (`terrainAtlas.ts:43-57`, `:83-99`) and stamps the atlas sheet `TERRAIN_ATLAS_PATH =
  '/sprites/tileset_grass.png'` (`terrainAtlas.ts:18`) through `drawAtlasTile`
  (`terrainLayer.ts:517-520`), with `SAND_WATER_OVERLAY_PATH = '/sprites/terrain/sand_water_overlay.png'`
  (`terrainAtlas.ts:20`) for the sand-bank/water boundary masks.

Both of those files are absent from the tree. A recursive listing of `public/sprites/` for
atlas/overlay/water art returns only the two *fill* sprites:

```
public/sprites/terrain/water_deep_fill.png     16206
public/sprites/terrain/water_shallow_fill.png  16185
```

There is no `public/sprites/tileset_grass.png` and no `public/sprites/terrain/sand_water_overlay.png`.
`terrainAtlas.ts:5-10` names the sources (`TilesetGrass/overworld_tileset_grass.ase`,
`grass_biome.tsx`); neither is in the tree either.

This is the same class as `BUG_REPORTS/2026-09-10-mountain-sprites-missing.md` — a renderer path
referencing art that does not exist — and is similarly invisible to the gates: the browser smoke
tolerates the failed request through its `KNOWN_CONSOLE_ERRORS` allowance, and no test asserts that a
terrain family's art resolves.

## Expected behavior

A water tile paints water in the game view, matching what the minimap shows for the same tile, and a
missing art file degrades to a visible fallback (the flat fill sprite or a flat colour) rather than to
"nothing is drawn".

## Reproduction steps

1. Start or load any settlement with a river (the map always has one; `terrainGen.ts:78` classifies
   deep water as `TerrainType.River`).
2. Look at the river in the game view: no water surface, at every zoom level.
3. Look at the same river on the minimap: blue, as expected.

## Evidence

- `Get-ChildItem public/sprites -Recurse -File | Where-Object Name -match 'atlas|overlay|water'` →
  only `water_deep_fill.png` and `water_shallow_fill.png`.
- `terrainAtlas.ts:18,20` — the two missing paths; `:43-57` maps `ShallowWater`/`River`/`DeepWater` to
  the `WATER` family; `:83-99` is the corner→tile table (including `[0b1111]: { id: 61 } // all water`).
- `terrainLayer.ts:516-534` — atlas pick → atlas image → stamp, with the fill path only reached when
  `atlasPick` is null.
- `spriteLoader.ts:112-114` — `getSprite` returns null unless the image actually loaded, so a missing
  sheet makes `isAtlasReady()` (`terrainAtlas.ts:194`) false; the remaining question is whether
  `drawTerrainFill` paints water in that case (see Root cause).
- `spriteLoader.ts:163` — the overlay is deliberately **not** preloaded "until
  `public/sprites/terrain/sand_water_overlay.png`" exists, confirming the art gap is known.

## Root cause

**Verified:** the painted-terrain atlas sheet and its sand-water overlay mask are not in the repo, so
the game view cannot paint the water family. The minimap has no such dependency, which is why the two
views disagree — and why the report is "the minimap looks great" rather than "water is broken
everywhere".

**One link still to confirm** (the reason this report is `open`, not `resolved`): with the atlas absent,
`atlasPick` is null and the draw falls to `drawTerrainFill(ctx, tile.type, …)`
(`terrainLayer.ts:520`), whose fill table (`:36-40`) *does* include the water sprites that exist on
disk. Either that path paints water (and the visible fault is coming from the other render path, the
Pixi/WebGL terrain in `renderer/pixiTerrain.ts:31-35`, which also references these sprites), or
`drawTerrainFill` does not cover water and the tile is left with whatever was underneath. Reading
`drawTerrainFill` (and the preload list at `spriteLoader.ts:150-165`) settles which.

## Regression test

None possible against the art itself; the guard belongs at the boundary:

- a render-path test asserting that every terrain type in `atlasFamily()` (or in the fill table)
  resolves to art that is present, or to a declared fallback — i.e. a missing file fails the suite
  instead of painting land;
- and, if a fallback colour is adopted, a small test pinning water's fallback to a blue tone rather
  than to the base ground colour.

## Invariants checked

Not applicable: this is presentation only. Simulation, saves and the minimap are unaffected, and
`npm test`, `build`, `test:browser` are all green on the tree with the fault present.

## Save/migration impact

None.

## Verification result

Reproduced by inspection of the art directory and the two render paths; confirmed visually by the
reporter ("on the minimap it looks great" — the minimap path needs no art). No code was changed for
this report yet.

## Related commits or files

- `src/game/terrainAtlas.ts`, `src/game/terrainLayer.ts`, `src/game/renderer/pixiTerrain.ts`
- `src/game/spriteLoader.ts` (preload list and the deliberate overlay omission)
- `src/components/MiniMap.tsx` (the art-free path that looks correct)
- `BUG_REPORTS/2026-09-10-mountain-sprites-missing.md` — the same missing-art class

## Fix

**Recommended (robustness), in order:**

1. When the atlas sheet is unavailable, paint the tile's family from the fill sprites that already
   ship (`water_deep_fill.png` / `water_shallow_fill.png` for the `WATER` family), falling back to the
   flat colours already declared in `pixiTerrain.ts:52-53` (`River: 0x3e9bc4`). Missing art must degrade
   to a blue tile, never to dry land.
2. Log (once) or fail a render-path test when a terrain family's art does not resolve, so this cannot
   ship silently again.
3. Ship the real art: `public/sprites/tileset_grass.png` plus
   `public/sprites/terrain/sand_water_overlay.png`, exported from `overworld_tileset_grass.ase` /
   `grass_biome.tsx` as the module header describes — that is what restores the painted shoreline
   edges the atlas is designed to draw.
