# Terrain fill textures (Phase A)

Engine-ready seamless ground fills for `bakeTerrainLayer`.

| File | Use | Notes |
|------|-----|--------|
| `grass_fill.png` | Grassland, Forest base | 128×128, top-down painted, even light |
| `dirt_fill.png` | Hills, Rocky, Mountains base | 128×128 |
| `sand_fill.png` | Beach, RiverBank, Snow base (+ cool tint) | 128×128 |
| `water_shallow_fill.png` | ShallowWater, River | 128×128, sine wave bands + sparkles — regen: `scripts/generate-water-sprites.mjs` |
| `water_deep_fill.png` | DeepWater | 128×128, stronger current bands, fewer sparkles — regen: same script |

## Defaults applied (game-asset-core + tilesets)

- Seamless / tileable intent
- No prop subjects, no baked shadows of objects
- Non-directional lighting
- Anonymous stochastic detail (grass/dirt/sand)

## Flags

- **Water fills**: regenerated 2026-08-03 — seamless sine wave bands (wavelengths divide 128), coordinate-hashed grain/flecks that tile at the wrap; the old shallow "checkerboard" flag no longer applies.
- **Phase B transitions**: code-side feather (no extra edge art) via `blendNeighborEdge` — material families grass/dirt/sand/water; shore lip on land↔water.

## Checks

2×2 composites: `_check_2x2_*.png` (dev only; can delete).

## Wiring

- Preload: `spriteLoader.preloadAllSprites`
- Stamp: `terrainLayer.drawTerrainFill` / `TERRAIN_FILL_PATH`
- Transitions: `blendNeighborEdge` on N/E/S/W when fill family differs

## Painted atlas (2.5D Painted Relief, 2026-08-16)

| File | Use | Notes |
|------|-----|--------|
| `tileset_grass.png` | Painted grass biome — grass base + grass↔water blob transitions (Tiled corner encoding) | 192×336, 16×16 tiles, 12 cols. Runtime copy of `TilesetGrass/overworld_tileset_grass.png` (Aseprite + `grass_biome.tsx` sources stay in the authoring folder) |
| `terrainAtlas.ts` | Corner→tile table (16 combos, mirror flips), `pickAtlasTile`, elevation relief curve | Lookup derived from `grass_biome.tsx` terrain tags (0=grass, 1=water) |

- Stamp: `terrainAtlas.pickAtlasTile` in `bakeTerrainLayer` pass 1 (grass/water/forest floor) — painted tile replaces fill + feather when all 8 neighbours are grass/water; everything else falls back to fills.
- Relief: `terrainAtlas.reliefY` extrudes hills/peaks in a sorted pass 2 (cliff faces); the renderer offsets buildings/settlers/props via `terrainAtlas.terrainRiseAt` so they ride the terrain.
- **Painted dirt**: Hills/Rocky/Mountains relief surfaces stamp the seamless painted `tile_dirt.png` (25×25, root of `public/sprites/`) instead of the procedural `dirt_fill.png`.
- Regeneration: painted art is authored (Aseprite/Tiled), not script-generated.

## Phase C–D (code)

- Props stamped in `bakeTerrainDecor` (`stampLandscapeProps`)
- Season wash + real season in terrain bake
- Optional later: painted transition atlas for the remaining families (dirt/sand/swamp); forest canopy tiles
