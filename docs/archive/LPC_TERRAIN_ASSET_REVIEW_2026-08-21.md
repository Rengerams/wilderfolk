# LPC_Terrain.zip — Asset Review

**Date:** 2026-08-21
**Status:** Reviewed; not integrated
**Asset:** `LPC_Terrain.zip`

## Verdict

Yes, LPC Terrain can improve the visual richness of Wilderfolk, but it is **not a drop-in replacement** for the current terrain atlas. It is best suited as a curated supplementary tileset or as the source for a separate terrain-art variant. Directly replacing `public/sprites/tileset_grass.png` would be unsafe because the LPC sheet uses a different tile size, different atlas dimensions, different terrain IDs, and a different style language from Wilderfolk’s current painted-relief terrain pipeline.

## Asset inventory

| Item | Finding | Wilderfolk implication |
|---|---|---|
| `terrain.png` | 1024×1024 RGBA PNG | A 32×32 grid with 1024 tiles; suitable for indexed tile sampling after a mapping layer |
| `Terrain.tsx` | Tiled tileset XML despite the `.tsx` extension | Useful terrain metadata, but it is not a React/TypeScript component |
| `Attribution.txt` | CC-BY-SA 3.0 and GPL 3.0 notices; multiple LPC contributors listed | Attribution and share-alike/GPL obligations must travel with any distributed derivative or converted sheet |
| File size | Approximately 250 kB PNG plus metadata | Small enough for a browser asset, but only selected tiles should be shipped if the whole sheet is not used |

The sheet visibly contains grass, dark grass, short/long grass, wheat, sand, snow, ice, water, lava, dirt, roads, sewer-like tiles, cliffs, bridges, waterfalls, rocks, flowers, crops, and transition pieces. This makes it particularly useful for biome variation, riverbanks, paths, cliffs, small landmarks, and seasonal overlays.

## Compatibility with the current pipeline

Wilderfolk currently uses a **192×336 `tileset_grass.png` atlas with 16×16 source tiles**, a corner-terrain mapping for grass/water transitions, and separate 128×128 seamless fill textures for grass, sand, shallow water, and deep water. The LPC sheet is a **1024×1024 32×32 atlas** and its Tiled terrain table uses a different terrain-ID and tile-index scheme. The existing `terrainAtlas.ts` mapping cannot consume LPC IDs without a new adapter.

The LPC art also has a stronger classic-LPC pixel-art appearance, while Wilderfolk’s current atlas is a painted-relief style with elevation-aware rendering. A full replacement would therefore create a visible style mismatch with existing buildings, human sprites, vegetation, water overlays, and relief extrusion.

## Recommended use

The safest high-value approach is a **separate LPC terrain adapter** rather than replacing the current atlas. The adapter should:

1. Keep the current `TerrainType` and `WorldMap` simulation model unchanged.
2. Add a render-only atlas descriptor containing the LPC sheet path, 32×32 tile size, 32 columns, and an explicit terrain-family mapping.
3. Reuse the existing corner-family logic for grass/water and add selected LPC transition IDs through a data table rather than embedding new terrain decisions in the renderer.
4. Start with a small visual slice: LPC grass, dirt, sand, water edges, snow/ice, road, cliff, and waterfall tiles.
5. Gate the variant behind a presentation preference or development preview so the current art remains the default until style and readability are verified.
6. Add deterministic renderer tests for tile coordinates, edge transitions, out-of-bounds fallback, and transparent-pixel handling.

A second viable option is to crop and normalize only selected LPC tiles into new Wilderfolk-sized assets. That would reduce runtime atlas complexity, but it would require careful attribution and a consistent resampling/cropping policy. It must not be done by automatically scaling the complete sheet, because scaling would blur the pixel art and destroy intended tile boundaries.

## Licensing and attribution

The included attribution file states **CC-BY-SA 3.0** and **GPL 3.0** licensing, and identifies multiple contributors with separate notices, including GPL and LGPL references. This is sufficient to treat the asset as potentially usable, but not sufficient to erase attribution or assume a permissive MIT-style license. Before shipping a derivative or converted atlas, Wilderfolk should preserve the attribution text, include the referenced license texts, and confirm whether the selected tiles inherit the stated license individually or through the combined pack.

The asset should therefore remain in a clearly attributed asset directory, for example `public/sprites/third-party/lpc-terrain/`, with the original attribution and license files retained. No production integration was performed during this review.

## Simulation Change Record

- Owner module: renderer/terrain presentation only; no simulation owner is changed by this review.
- Decision changed: none; this is an asset assessment, not an implementation.
- Cadence: render-time only if later integrated.
- State fields written: none.
- Player-visible behavior: unchanged because the asset was not integrated.
- Performance impact: not measured in production; the source sheet is small, but a cropped subset is preferable to loading unused content.
- Tests: no code changes or new simulation tests were made.
- Invariants: worker authority, terrain simulation, pathfinding, collision, map generation, saves, and cadence remain unchanged.
- Save/migration impact: none.
- Rollback plan: remove the render-only adapter/assets; no save migration would be needed.

## Recommendation

Proceed with a **small LPC visual prototype**, not a full replacement. The strongest first slice is riverbank/water transitions plus roads and cliffs, because those are visually noticeable and can be isolated in the renderer without changing map generation or simulation semantics. Keep the existing painted-relief atlas as the default until the prototype passes visual, style, pixel-density, performance, and attribution review.
