# Terrain fill textures (Phase A)

Engine-ready seamless ground fills for `bakeTerrainLayer`.

| File | Use | Notes |
|------|-----|--------|
| `grass_fill.png` | Grassland, Forest base | 128×128, top-down painted, even light |
| `dirt_fill.png` | Hills, Rocky, Mountains base | 128×128 |
| `sand_fill.png` | Beach, RiverBank, Snow base (+ cool tint) | 128×128 |
| `water_shallow_fill.png` | ShallowWater, River | Soft wash; mild large-scale blob FLAG |
| `water_deep_fill.png` | DeepWater | 128×128 |

## Defaults applied (game-asset-core + tilesets)

- Seamless / tileable intent
- No prop subjects, no baked shadows of objects
- Non-directional lighting
- Anonymous stochastic detail (grass/dirt/sand)

## Flags

- **water_shallow_fill**: soft center mottling may show slight checkerboard in 2×2; acceptable Phase A.
- **Phase B transitions**: code-side feather (no extra edge art) via `blendNeighborEdge` — material families grass/dirt/sand/water; shore lip on land↔water.

## Checks

2×2 composites: `_check_2x2_*.png` (dev only; can delete).

## Wiring

- Preload: `spriteLoader.preloadAllSprites`
- Stamp: `terrainLayer.drawTerrainFill` / `TERRAIN_FILL_PATH`
- Transitions: `blendNeighborEdge` on N/E/S/W when fill family differs

## Phase C–D (code)

- Props stamped in `bakeTerrainDecor` (`stampLandscapeProps`)
- Season wash + real season in terrain bake
- Optional later: painted transition atlas, Pixi renderer
