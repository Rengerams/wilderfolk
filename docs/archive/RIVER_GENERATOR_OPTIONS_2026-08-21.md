# River Generator Options — External Evaluation

- Date: 2026-08-21
- Scope: JavaScript-compatible replacement candidates for Wilderfolk river routing

## Sources reviewed

1. Red Blob Games `mapgen2`: <https://github.com/redblobgames/mapgen2>
2. Red Blob Games Voronoi maps tutorial: <https://www.redblobgames.com/x/2022-voronoi-maps-tutorial/>
3. Red Blob Games mapgen4 architecture note: <https://www.redblobgames.com/blog/2025-04-22-de-optimizing-mapgen4/>

## Findings

`mapgen2` is a JavaScript polygon-map generator that produces elevation, rivers, and biomes through a Delaunay/Voronoi mesh. It relies on a larger stack: Delaunator, a dual-mesh structure, seeded PRNG support, a WorldMap generator, and rasterization if a game needs square terrain tiles. It is a capable reference implementation, but it is not a small plug-in for the existing Wilderfolk 10px tile map.

The Red Blob tutorial provides a more suitable **algorithmic pattern** for Wilderfolk: calculate downslope for each location, accumulate rainfall/moisture flow from high to low elevation, apply a flow threshold, and render/carve the resulting channels. It explicitly identifies local-minimum handling as a required design choice: erase blocked rivers, create lakes, raise lows, or carve a canyon.

The mapgen4 note cautions against replacing data structures and algorithms simultaneously. It records that a heavily optimized map generator became difficult to modify and that changing one dimension at a time was more successful.

## Decision implication

A full external-package replacement would require converting Wilderfolk’s tile terrain, terrain render cache, pathfinding/buildability, camp clearing, bridge rules, deterministic seed behavior, and saved world-map schema to a new polygon/mesh pipeline. That is a large rewrite and is not justified as a quick river visual fix.

The best package-informed path is to retain the existing tile map and later replace only the river-routing inner loop with the proven downslope + flow-accumulation algorithm. This is a contained implementation, avoids a new runtime dependency, preserves the existing map schema, and can be independently tested.

## Recommendation

Do not import `mapgen2` into the current 0.6.1.1 repair. Treat it and the tutorial as references. First finish the minimal main-map readability repair. If river realism remains insufficient after playtesting, schedule one bounded generation objective: flow accumulation on the existing grid, with no renderer, save-schema, or terrain-system rewrite.
