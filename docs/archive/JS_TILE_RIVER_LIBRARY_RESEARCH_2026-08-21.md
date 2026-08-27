# JavaScript Tile-Grid River Generation Research

- Date: 2026-08-21
- Scope: Maintained JavaScript and TypeScript packages or reference libraries suitable for deterministic procedural rivers in Wilderfolk’s square tile terrain.

## Executive finding

No maintained, drop-in npm package was found that accepts a square elevation grid and returns production-ready river tiles, banks, tributaries, and compatible save data. The viable choices divide into two groups: **tile-map frameworks that do not implement hydrology** and **map-generation references that implement rivers but require a different mesh-based map architecture**.

| Candidate | What it provides | Tile-grid river generator? | Fit for Wilderfolk |
|---|---|---:|---|
| `@reldens/tile-map-generator` | Procedural Tiled/Phaser maps, element placement, paths, connectivity checks | No | Poor for terrain hydrology; it produces maps from pre-defined elements and paths rather than downslope rivers. |
| `simplex-noise` + seeded PRNG | Fast deterministic terrain-noise samples | No | Useful only if Wilderfolk replaces its custom noise implementation; it does not solve river routing. |
| `delaunator` / Red Blob `mapgen2` | Delaunay/Voronoi mesh, elevation, rainfall/flow-based river concepts | Yes, but on a polygon mesh | Strong reference, poor direct dependency. It requires a mesh pipeline and tile rasterization. |
| `three.terrain.js` | Three.js heightmap and terrain rendering helpers | No | Wrong rendering model; Wilderfolk is Canvas 2D/2.5D tile terrain. |
| `@maptalks/martini` | Real-time terrain mesh generation | No | Wrong rendering model and no river routing. |

## Verified evidence

The maintained Reldens package documents tile-map placement, automatic *paths*, Tiled JSON output, and connectivity validation. It does not document elevation, drainage, flow accumulation, river routing, or hydrology. Its 0.54.0 package has several Reldens/server dependencies and an unpacked size of roughly 9 MB, so it is inappropriate as a river-only dependency.

`simplex-noise` is a small, browser-and-Node compatible noise package with seeded PRNG support when paired with `alea`. It can improve terrain noise quality but will not produce a coherent river network by itself.

Red Blob’s JavaScript `mapgen2` and river tutorial describe the appropriate hydrology method: calculate one downslope neighbor per terrain cell, process cells from highest to lowest elevation, accumulate rainfall/flow, then keep only cells that exceed a river-flow threshold. They also document the necessary local-minima decision: create a lake, fill/raise the depression, or carve an outlet. However, `mapgen2` is built around Delaunay/Voronoi meshes plus its own `WorldMap` structure. Integrating it would require replacing or rasterizing into Wilderfolk’s existing 10px square-tile map.

## Recommendation

Do **not** add an npm package for the current visual issue. No candidate is a compatible plug-in, and importing one would introduce either unrelated tile-map assumptions or a second terrain architecture.

If Wilderfolk later needs more natural drainage and tributaries, take the proven **downslope + flow accumulation** algorithm from the Red Blob reference and implement it as one authoritative function on the existing terrain grid. It is small, deterministic, worker-safe, does not change the `WorldMap` schema, and can be covered by direct contracts for continuity, outlet/lake handling, width, bridge eligibility, and tree exclusion.

## Sources

1. [Reldens Tile Map Generator repository](https://github.com/damian-pastorini/tile-map-generator)
2. [Reldens Tile Map Generator npm package](https://www.npmjs.com/package/@reldens/tile-map-generator)
3. [simplex-noise npm package](https://www.npmjs.com/package/simplex-noise)
4. [Delaunator npm package](https://www.npmjs.com/package/delaunator)
5. [Red Blob Games mapgen2 repository](https://github.com/redblobgames/mapgen2)
6. [Red Blob Games Voronoi map tutorial: rivers](https://www.redblobgames.com/x/2022-voronoi-maps-tutorial/)
