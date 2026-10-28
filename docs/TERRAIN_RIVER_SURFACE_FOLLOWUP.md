# River material and whitewater follow-up to terrain v3

This is a **render-only** enhancement on top of the merged terrain naturalism PR #73.
All existing generation recipes (v1/v2/v3), saved terrain water masks, elevation arrays,
world-space river paths, bridge/pathfinding classification and harvestable vegetation are
unchanged. An existing v3 save can show the new paint without rebuilding its world.

## Improvements

1. **Directional river glints.** The renderer derives a fine-resolution local tangent from
   each saved river polyline. A deterministic low-amplitude crest pattern runs **across**
   that tangent rather than being aligned to screen X/Y. This avoids uniform cyan strips.
2. **Drop-localized rapids.** Existing waterfall locations and drop sizes seed a bounded
   whitewater intensity field. Strong highlights fade out beyond a short reach of the
   actual drop and are masked to the canonical water-coverage layer.
3. **Exposed sediment.** Only the shoulder of a v3 channel gets low-frequency silt patches,
   blended with wet soil. This breaks the continuous dark ring without painting extra
   walkable land blue.

The slope, channel paths and rapids fields are not duplicated in world state or saves:
`renderer/whittakerTerrain.ts` owns their derivation as **temporary render data**.
The fields are computed once by `buildWhittakerFields` when a map enters the ground
chunk cache. Pixel shading samples at most three additional bilinear fields and one
noise sample on river pixels, never on the whole landscape. Segments rasterize within
a 3-water-cell reach, so the prepass scales with river length rather than with
the total number of river segments multiplied by map area.

## Acceptance

- Generated v3 maps: directional highlights follow the curving water and do not form
  a straight repeating stripe across the map. Look especially at tributary junctions.
- Rapids cluster around waterfalls; a dry slope or lake does not show waterfall foam.
- Exposed bank soil has varied silt patches, not an opaque halo or extra blue water.
- River, RiverBank, pathGrid and buildGrid values are byte-identical before/after the
  rendering change. Older generation revisions do not run the new shading path.
- Adjoining 256px terrain chunks (and their smaller test crops) produce identical pixels
  to an equivalently located whole-view bake, at zoom levels 0.5, 1 and 2.
- Profile on Huge: the directional prepass happens once per map, not per chunk/frame;
  there should be no meaningful FPS regression.

## Verification status

The new `tests/terrain.riverMaterials.test.ts` covers flow-field determinism, legacy
compatibility, waterfall localization and chunk-crop equality. Run the targeted test,
standard test suite, TypeScript checks and build in CI. Browser screenshots and
real-world performance measurements must still be checked separately; not claimed here.
