# Render-only terrain height mesh, v1

## Goal

Build actual visually raised ground over Wilderfolk's existing 2D simulation, without
rewriting the worker, changing pathfinding, or invalidating generated maps. This PR
stacks on the relief material / vegetation grounding pass (PR #76).

## Model

- The canonical simulation XY plane and existing L0 path / L1 placement / L2 biome / L3
  decoration layers stay untouched.
- Map generation **version 3** uses a separate, render-only 32-world-pixel triangular
  mesh whose vertices are elevations sampled from the existing 16px L2 fields.
- Maximum rise: 28 world px, less than the 32px mesh edge. The y projection is
  strictly monotone, so the screen-to-terrain inverse converges and never chooses
  an overlapping, folded-over face. Water and beaches stay near sea level.
- `terrainRiseAt()` is the one owner of the triangular world-space height,
  shared by the textured terrain triangles, human/animal/tree/grass positions,
  buildings, decor prop origins, cursor markers, selection effects and mouse
  interaction. Legacy version 1/2 ground is not geometrically warped, and its
  original rise curve remains intact.
- An affine 2D transform warps each clipped terrain-texture triangle once.
  The full mesh is rasterised into a *transparent* extra-height surface per chunk.
  It renders after that chunk finishes baking; coarse previews receive the same
  treatment. A normal frame only blits cached images, never draws triangles.
- The chunk projection is continuous across 256px boundaries because both chunks
  use the same global 32px mesh coordinates. Ground is drawn north-to-south to
  preserve foreground masking. The chunk's height surface is top-padded by 28px.
- Decorative L3 props remain upright, with their feet elevated, rather than
  flattened as decals over mountain faces.

## Pointer and accessibility

- `unprojectTerrainY()` solves `projectedY = worldY - terrainRiseAt(map,worldX,worldY)`
  by bounded bisection; it corrects build ghosts, clicks and selection.
- Keyboard cursor events and the DOM cursor marker use the same terrain height.
- Plain camera panning, viewport chunk planning and world simulation retain the
  existing XY coordinate system. The camera itself has **not** been rotated or
  turned into an isometric perspective view.

## Non-goals / known limits

- This is a real height-warped 2.5D surface, **not** true 3D meshes or a new
  3D lighting engine. Mountains do not currently occlude all billboard sprites
  through a global per-pixel depth buffer; interaction is XY-ground based.
- On very steep polygons anti-aliasing may reveal minor hairline seams and
  raised decorations use 32px side/bottom overscan and a 60px top margin (art plus elevation).
- The map edge frame and some UI overlays remain in screen-space flat
  orientation; follow-up visual polish can project overlays independently.
- Do not change `TERRAIN_HEIGHT_MESH_STEP` or maximum rise independently of
  the inverse-projection test and mesh-chunk geometry.
- Browser visual QA, screenshot comparison and performance benchmarking still
  required before shipping. Passing unit tests is not a substitute.

## Validation

`tests/terrain.heightMesh.test.ts` exercises continuity at chunk edges, projection
inverse on both triangle faces, water-level baseline and bounded 128 triangles per
256px chunk. Also run standard terrain-surface, ground-chunk, keyboard and CI suites.
In browser inspect Highlands and Scandinavia at 0.5x, 1.45x and 3x, cross-chunk
mountain borders, rivers entering mountain valleys, tree roots and click placement.
