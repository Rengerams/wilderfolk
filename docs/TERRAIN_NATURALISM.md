# Wilderfolk: natural-landscape visual overhaul (generation revision 3)

## Research and decision

The map already owns a deterministic 16 px height/climate lattice, fine river coverage, 10 px
passability, 20 px placement, 2.5D ground lighting, chunked decor and living tree entities.
A renderer replacement, new third-party library or unrelated ecosystem simulation is not
necessary to improve the initial visual impression.

Useful existing references:

- [Red Blob Games — Mapgen4](https://www.redblobgames.com/maps/mapgen4/) demonstrates
  drainage, wind/rainfall-based biome composition and separately tuned visual rendering.
- [Red Blob Games — Mapgen4 source](https://github.com/redblobgames/mapgen4) implements
  its map generation separately from presentation, including watercourse appearance.
- [Génevaux et al. (SIGGRAPH 2013)](https://doi.org/10.1145/2461912.2461996)
  describes procedural terrain based on hydrology. Wilderfolk already uses catchment flow.
- [Red Blob Games — terrain from noise](https://www.redblobgames.com/maps/terrain-from-noise/)
  explains how multi-scale fields and elevation thresholds shape readable maps.

These are methodology references, not copied code or new installed dependencies.

## Changes in revision 3

### Flow-aware rivers

Preserve the established priority-flood drainage and width accumulation as the authoritative
source of rivers. Subdivide water **coverage only** between drainage nodes with interpolated
Catmull–Rom centres; this removes polygonal stair steps without perturbing headwaters,
tributary junctions, outlet positions or world-space river waypoints. The shared water mask
continues to drive gameplay classification and rendering.

The new ground shader paints the channel primarily where the tile classifier treats it
as river water; the shoulder receives a damp soil material instead of a wide blue halo.
A one-time linear two-pass distance transform makes the surrounding ground gradually
more moist. That produces an ecological riparian fringe which fades into the dominant
biome without inventing a separate biome owner.

### Forest cover

A staggered, seeded sampling grid with spatial jitter replaces the visible regular
forest rows and arbitrary circular tree blobs in new worlds. A low-frequency noise field
modulates density into contiguous groves and glades. Local canonical terrain types
control whether living trees can spawn; forest, dark forest, grassland and river banks
get different probabilities. The renderer chooses two existing tree silhouettes with
more tall crowns in dark forests and slightly different canopy sizes.

Living trees remain normal harvestable game entities, not static image-only scenery.
No image library, tree species simulation, or additional decor alias is introduced.

### Compatibility and performance

- Revision 1 preserves the pre-preset procedural recipe.
- Revision 2 preserves the accepted preset-generation recipe.
- New games use revision 3; compact saves store the recipe revision and regenerate
  the proper world. Never silently replace an already-played valley with a new seed.
- River smoothing and damp-bank distance propagation happen **once at world generation**.
  The interpolation touches only river segments; moisture diffusion is O(cols × rows).
- Tree candidate enumeration is bounded by world area / 29² and uses a small deterministic
  noise lookup. Ground appearance stays cached per terrain revision.

## Visual acceptance checklist

Check Arabia, Black Forest, Rivers, Highlands, Coastal, Scandinavia, Meadows and Oasis
on at least two seeds at zoom 0.5, 1 and 2:

1. River branches join; there are no disconnected blue discs or unnatural rectangular
   waterlines. Check narrow headwaters, confluences, and river-to-sea mouths.
2. Pixel colours, river-water gameplay tiles and blocked crossing/path cells agree.
   A walker cannot move through visible channel water without a bridge.
3. Damp banks and riparian reeds/trees fade into the upland vegetation without a
   straight rectangular boundary or unwanted desert oasis across the whole map.
4. Forest density and silhouette vary; there are no obvious lines of identical trees.
   Trees remain selectable/harvestable, and no trees spawn in open water.
5. Founding camps remain buildable; the starter clearing is small, does not overwrite
   water or dominate the map, and every biome preset remains visually distinguishable.
6. Save/load round-trips for all three revisions preserve elevation, water masks and
   decor. Compare the new version with the accepted version 2, do not merely check
   that two revision-3 maps are both deterministic.
7. Watch generation time, viewport chunk bake cost, tree-render count and FPS on
   Medium, Large and Huge. A visual effect should not add expensive work per frame.

## Remaining art opportunities (not claimed complete)

The generator cannot conjure new hand-painted assets. Species-specific oak, birch,
spruce, pine, marsh, and deadwood sprites (seasonal variants where appropriate)
will further improve identity. Erosion-calibrated floodplains, lake/river distinctions,
rapids, delta sediment and interactive water can come later. The existing renderer
uses a shaded 2.5D height field, not true 3D occluding terrain geometry.

**Verification:** This document describes the proposed patch, not a statement that
CI, a browser visual comparison or benchmark has passed.
