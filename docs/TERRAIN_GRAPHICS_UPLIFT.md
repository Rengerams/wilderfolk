# Wilderfolk terrain graphics uplift

## Current phase: landform materials and consistent sprite grounding

The procedural world already stores elevation, climate, water, and separate 10px path and
20px build grids. The ground renderer computes slope, neighborhood relief and directional
shadows but previously drew **the entire surface as a flat canvas rectangle**. Entities
were inconsistent: humans, animals and buildings received a small height offset while
trees, grass and some selection overlays did not.

This PR is an incremental render-only uplift:

- Expose coherent rock faces on steep elevated slopes, respecting climate height
  and excluding water and riverbanks.
- Use precomputed neighborhood relief to brighten convex ridge tops and darken
  concave upland valleys; the work uses the renderer's *existing* cached slope and
  relief fields, not a second simulation.
- Ground tree trunks, grass clumps, and combat/selection rings at the same
  world-space terrain rise as entities and buildings.
- Keep 256px ground chunks, their caching strategy, preset identity, pathfinding,
  roads, building positions, saved terrain generation versions and river masks unchanged.

### Limitations

This change is **not yet actual elevated geometry**. A stronger real 2.5D surface
requires a textured height-mesh or an equivalent warped chunk projection; increasing
`terrainRiseAt()` by itself would leave every object visibly hovering above flat ground.

## Next phases (separate PRs)

1. **Unified projection:** A single `worldToScreenOnTerrain` owner for buildings,
   props and entities, paired with a reliable screen-to-terrain inverse for build
   previews, hit testing and drag/panning. Keep XY simulation coordinates canonical.
2. **Height-mesh ground:** Bake terrain once into chunk-compatible strips/triangles;
   height vertices sample the existing world elevation and render the textured
   surface raised at the same scale as object feet. Ensure no gaps at chunk edges
   and correctly handle far-to-near overlap.
3. **Occlusion and footprints:** Scene-depth rules for trees, walls, buildings and
   terrain silhouettes; avoid objects drawing through hills. Preserve accessible
   selection and path overlays.
4. **High-quality art:** Distinct climate-driven trees, rocky scree, valley foliage,
   rock outcrops and shadows based on local slope and sun exposure. Use LOD at
   different camera zoom levels and keep draw calls/chunk rebuilds bounded.
5. **If regeneration changes:** Introduce version 4 without silently changing
   saved revision-1/2/3 worlds.

## Validation before merge

- Existing mountain, water/classifier, save and biome tests continue to pass.
- `tests/terrain.landformGraphics.test.ts` checks that rendered steep upland
  material differs from flat ground at unchanged map elevation, and that
  adjacent viewport bakes remain byte-identical.
- Inspect Highlands, Scandinavia, Rivers, Arabia and Meadows at zoom 0.5, 1
  and 2. Check for strange rock rings, washed-out grass, floating tree roots,
  broken coastline colour, and clipped shadows around elevated buildings.
- Compare FPS and viewport bake time on Medium and Huge worlds before/after.
  No benchmark or screenshot inspection is claimed as complete by this PR.
