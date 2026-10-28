# Wilderfolk — Terrain Architecture (canonical)

> **Status:** consolidated on 28 October 2026 from the terrain preset, naturalism, river-surface, graphics-uplift and height-mesh architecture notes. This is the single terrain architecture document. It describes the checked-in `main` implementation, plus explicitly labelled limitations and verification still needed; it is **not** an assertion that browser visual QA or Huge-map FPS acceptance passed.

**Authoritative engineering rules:** [AGENTS.md](../AGENTS.md), [OWNERSHIP_OVERVIEW.md](../OWNERSHIP_OVERVIEW.md), [simulation/decisionRegistry.ts](../src/game/simulation/decisionRegistry.ts). Function owners live in their implementing modules. Avoid renamed wrappers, duplicate classifiers, compatibility facades and convenience re-exports. Terrain gameplay and presentation have distinct owners, not duplicate truths.

## 1. Evolution and what changed

| Stage | Change | Status / boundaries |
| --- | --- | --- |
| Generation v1 (legacy) | Original noise-based landscape and point-stamped rivers | Retained as a versioned compact-save regeneration recipe; do not rewrite its seed/size/RNG contract. |
| Generation v2 — [PR #63](https://github.com/Rengerams/wilderfolk/pull/63) | Distinct map presets and relief, coherent connected river coverage, canonical terrain classification, camp clearing, original-site production efficiency | Merged and accepted 27 October 2026. |
| Generation v3 — [PR #73](https://github.com/Rengerams/wilderfolk/pull/73) | Smooth Catmull–Rom water-mask rasterization, wet riparian transition, seeded forest groves and glades | Merged 28 October 2026. Drainage polylines remain the authoritative paths. |
| V3 river presentation — [PR #75](https://github.com/Rengerams/wilderfolk/pull/75) | Flow-aligned highlights, waterfall-localized whitewater, sediment on exposed banks | Merged 28 October 2026; **current flow-detail field construction is specifically gated to generation v3**, not every later version. |
| Relief graphics — [PR #76](https://github.com/Rengerams/wilderfolk/pull/76) | Material contrast on steep rock, ridge/valley shading, consistent elevated feet of vegetation and effects | Merged 28 October 2026; render-only. |
| 2.5D height surface — [PR #77](https://github.com/Rengerams/wilderfolk/pull/77) | Cached affine textured triangles, shared terrain-rise sampling and inverse ground picking | Merged 28 October 2026; applies where `supportsTerrainHeightMesh` accepts the map (generation v3+), not flat legacy v1/v2. |
| Generation v4 — [PR #79](https://github.com/Rengerams/wilderfolk/pull/79) and later material refinements | Continuous ecotone weights for decor/trees, climate-driven vegetation, licensed/CC0 sprites and blended grass/dirt/soil/leaf-litter and natural ground materials | Merged 28 October 2026. **New games default to v4** through `terrainGen.generateWorldMap`. The lower-level `terragen.generateRawTerrain` still defaults to v3 when invoked directly without an explicit version. |

These stages are additive in scope, **not** a sequence of destructive world migrations. A generation recipe is a saved-world compatibility contract; render-only changes generally need no save migration. Some status text in the former individual documents was written before merge and is intentionally superseded by this matrix.

## 2. One authoritative pipeline

~~~mermaid
flowchart TD
  A["World setup / initGame"] --> B["terrainGen.generateWorldMap"]
  B --> C["terrain/terragen.generateRawTerrain"]
  C --> D["Seeded elevation + preset relief"]
  D --> E["Rain shadow / moisture / temperature"]
  E --> F["hydrology: depression fill, drainage, catchment"]
  F --> G["River polylines + versioned water coverage"]
  G --> H["Riparian moisture + biome fields"]
  H --> I["terrainGrid.classifyTile + L0/L1 grids"]
  I --> J["Biome-compatible static decor"]
  J --> K["Camp site + sparse terrain overrides"]
  K --> L["WorldMap; worldGen spawns living flora/fauna"]
  L --> M["RenderSnapshot / renderer.drawGround"]
  M --> N["Cached Whittaker fields and 256px ground chunks"]
  N --> O["Optional v3+ 32px height triangles"]
  O --> P["Chunk-owned decor + depth-ordered sprites"]
  L --> Q["saveLoad: seed + version + edits"]
  Q --> B
~~~

The canonical **simulation** remains world-space XY: AI, pathfinding, footprints, occupancy and interaction refer to unchanged coordinates. A raised landscape is a **presentation projection** computed from the same saved elevation field. The renderer cannot edit hydrology, walking/building grids or world generation.

## 3. Data layers, resolutions and invariants

| Field / projection | Owner | Resolution / semantics |
| --- | --- | --- |
| World XY, camera and entity positions | `worldGen.ts` / `viewState.ts` | World pixels; `WorldState.width` / `height`. |
| Elevation, moisture, temperature | `terrain/terragen.ts` | `TERRAIN_CELL = 16` world px; typed arrays + `cols/rows`. |
| River coverage and water geometry | `terrain/terragen.ts` and `terrain/hydrology.ts` | `WATER_CELL = 16` px on independent water lattice; `riverDist` / `waterCols` / `waterRows`, `rivers` polylines and `waterfalls`. |
| Coarse biome labels | `terrain/terragen.ts` and `terrain/biomes.ts` | `WorldMap.terrain` (biome indices); descriptive, not authoritative gameplay tile type. |
| Gameplay terrain tiles | `terrain/terrainGrid.ts` | `PATH_CELL = 10` px. `classifyTile` is the unique base terrain classifier; `tileAt` / `tileTypeAt` layer in sparse edits. |
| L0 path occupancy | `terrain/terrainGrid.ts` | `pathGrid`: 10px cells; walkability derived from canonical terrain; never infer from colour. |
| L1 building occupancy | `terrain/terrainGrid.ts` | `BUILD_CELL = 20` px; `buildGrid` derives from the same terrain projection and path occupancy. |
| Sparse terrain edits | `terrain/terrainGrid.ts` | `WorldMap.overrides` indexed by tile index, through `setTileOverride` / `patchTile`, followed by appropriate rebake. |
| Static scenery | `terrain/terragen.ts` and `renderer/decor.ts` | `WorldMap.decorations` in world pixels, drawn by exactly one owning render chunk. |
| Harvestable trees, grass, blueberry and wildlife entities | `worldGen.ts` and specialized entity owners | `WorldState.entities`; drawn as living sprites, not additional static forests. |
| Rendering caches, height projection | `renderer/terrain.ts`, `renderer/whittakerTerrain.ts`, `renderer/heightMesh.ts` and `terrainAtlas.ts` | Disposable derived data; never serialized as another terrain state. |

`classifyTile` samples the height/climate/river fields with the map's stored forest moisture thresholds. `tileAt` incorporates user overrides; `tileTypeAtWorld` is an adapted world-coordinate read, not another classifier. `terrain/terrainTraits.ts` owns pure water/unbuildable terrain-type predicates. Walking, building placement, river paint and static prop eligibility must agree on river and shore boundaries.

## 4. Generation and biome presets

**Entrypoint:** `src/game/terrainGen.ts` owns `generateWorldMap`, its map-size and legacy pixel-dimension overloads, initial settlement site and clearings; `src/game/terrain/terragen.ts` owns `generateRawTerrain` and the actual fields. `src/game/worldGen.ts` owns initial entities and game population. No generator creates a second living-tree layer.

**Seed pipeline:** `terrainSeedFor` resolves a recorded `terrainSeed` first, otherwise a deterministic combination of world seed and map-size offset. `buildHeight`, `spreadHeights`, `shapePresetRelief`, climate fields, hydrology, classifications and decor run once at generation. The output keeps both the seed and the **generationVersion**.

| Preset | Intended signature |
| --- | --- |
| Arabia | Open warm semi-arid ground, sparse woods and dispersed springs. |
| Oasis | Dry perimeter with central spring, greener centre and restrained woodland. |
| Black Forest | Dense continuous woodland beyond the smaller founding clearing. |
| Coastal | Ocean-facing coastal shelf, beach and inland transition. |
| Islands | Separated landmasses, channels and sea passages. |
| Highland | Raised ridges, steep rocky country and pronounced valley relief. |
| Scandinavia | Cold mountains, coast/fjord inlets and temperature variation. |
| Rivers | Enhanced connected drainage network and broader channels. |
| Meadows | Lower-relief pasture, more open country and watercourses. |
| Continental | Mixed terrain and broad latitude/climate reference. |

Preset settings tune sea level, mountains, roughness, moisture, temperature, latitude span, rivers, width, lakes, forest composition and island amount. Most regional archetypes intentionally set latitude variation to zero; Scandinavia and Continental use a gradient. Finished moisture distributions set the map-specific forest thresholds; regional climates should not be accidentally normalized into identical forests.

The initial settlement is selected on usable land and cleared with bounded terrain overrides. A new preset must not silently edit a player's starting resources. Rendering must not shift the underlying coastline or make the terrain passability disagree with its colour.

### 4.1 Relief and climate

- `terrain/noise.ts` owns deterministic seed hashing, random/noise functions, ridged fields and domain warping; `terrain/terragen.ts` applies elevation bands, relief shaping and preset settings.
- `terrain/rainShadow.ts` computes a deterministic bounded upwind barrier scan on the height lattice; `rainShadowField` is subtracted from moisture before biome thresholds are chosen. Height additionally affects moisture and temperature. Its work is generation-time, not per-frame.
- Mountain relief, cold alpine ground, beach edges, wet ground and resulting hillshade are derived from continuous stored fields, not by treating colourful sprites as simulation terrain.
- `terrain/ecotones.ts` in v4 derives smooth forest/dense-forest/dry/riparian/alpine weights from those fields. It adjusts vegetation density and material blending **without replacing `classifyTile`** or changing the walking rules.

### 4.2 Rivers, banks and waterfalls

`terrain/hydrology.ts` owns `fillDepressions`, `computeFlow` and the catchment-based width law (`riverWidthAt`). `carveRivers` in `terragen.ts` selects headwaters, follows downhill flow and records joined rivers, widths and drop sites. Generation v1 uses point stamping, v2 rasterizes interpolated linear segments, and v3+ smooths the water **mask** between flow nodes with half-step Catmull–Rom centreline sampling. The actual stored drainage polylines and junctions are not replaced with a display-only curve.

`riverDist` determines the water footprint, for both tile classification and ground shading. V3+ propagates a bounded riparian moisture gradient across the climate lattice with two linear passes. The shader colours actual channel water and wet/silty soil at the shoulders: painting extra blue water outside blocked water cells is incorrect. Static vegetation is excluded from active water; banks can support sparse riparian growth.

**River-material follow-up (v3):** `renderer/whittakerTerrain.ts` derives along-flow arc length and local current direction from saved river polylines; wave glints cut across the flow, whitewater is localized around recorded waterfall drops, and exposed sediment breaks a uniform bank ring. `buildRiverSurfaceFields` is transient map-level precomputation, with field sampling only near relevant water. No new saved water or waterfall state is introduced.

**Version boundary to verify:** the current `buildRiverSurfaceFields` returns empty flow-detail arrays unless `map.generationVersion === 3`. V4 keeps the v3+ generated channel mask and riparian rules, but does **not** currently receive that v3-only directional highlight/rapid prepass. Do not document v4 as having those effects without changing and testing the gate; decide separately whether the restriction is intentional.

## 5. Trees, ground props and v4 nature materials

- `terragen.placeDecorations` places sparse, biome-suitable **static** props. `decorBiomeForTile` reads canonical types and only uses coarse biomes for permissible detail. Water receives no terrestrial props.
- V3+ `worldGen.initGame` samples staggered/jittered tree candidates rather than obvious rows or arbitrary circles, using deterministic grove/glade noise. Tree entities are harvestable and depth-rendered independently. V4 `treeEcotoneAt` varies density and tall-crown chance continuously; unsuitable terrain (including channel water) yields zero recruitment probability.
- V4's `RETIRED_V4_DECOR_TYPES` visual-art policy is implemented by `RETIRED_V4_DECOR_TYPES` in `terrain/biomes.ts` and respected by generator/renderer. It suppresses selected tiny vector mushrooms, bones, flowers, ferns, reeds, cattails, scrub and other clutter for **new v4** landscapes, preserving legacy worlds' scenery.
- `renderer/grassTextures.ts` decodes and samples licensed/CC0 sprites and terrain materials in world-aligned coordinates. `renderer/whittakerTerrain.ts` blends climate-appropriate grass, dirt, sand, stone, snow, leaf litter and other natural detail, guarded by `generationVersion === 4` so old maps retain their material recipe. `renderer/decor.ts` draws surviving sprite props at their projected feet.
- Asset provenance and obligations belong in [ASSET_REGISTER.md](../ASSET_REGISTER.md) and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); nature assets are under `public/sprites/`. Do not create competing sprite selectors or import unlicensed art.

## 6. Renderer and 2.5D geometry

The display still uses **Canvas2D** via `src/game/renderer.ts`; there is no WebGL renderer or new full 3D camera. `renderer/terrain.ts` owns ground-cache planning, baking budgets and composition; `renderer/whittakerTerrain.ts` owns continuous-field albedo, lighting, wet soil, river paint and cached field derivation.

### 6.1 Ground and lighting

`buildWhittakerFields` precomputes smoothed heights, slopes, neighbourhood relief, water proximity, hillshade and horizon-based ambient occlusion at map/cache scope. `bakeWhittakerGround` samples world-aligned source fields and the relevant version-gated natural materials. Ridge and valley contrast exposes steep upland faces and avoids painting snow-capped mountains as featureless grass; water and riverbanks keep their separate material constraints. Cast-shadow/light direction and terrain response share the same field convention.

The active Whittaker-ground chunk size is **256 world px** (`WHITTAKER_CHUNK_SIZE`). The legacy atlas fallback separately has a **1024px** `TERRAIN_CHUNK_SIZE`; do not confuse the two. Chunks are planned near the camera with a margin, receive low-resolution preview bakes, then finish within `GROUND_BAKE_PIXEL_BUDGET = 8192` ground pixels per frame. Cached map-level fields are not repeatedly recomputed for every pixel/frame; offscreen ground and decorations have independent allocation/release and invalidation lifetimes. Cache identity includes world/preset/seed, saved terrain seed, generation version, dimensions and edit revision.

### 6.2 True warped height surface from v3 onward

The former flat-height shading pass was followed by a render-only raised surface. `terrainAtlas.ts` owns `supportsTerrainHeightMesh`, `terrainRiseAt`, `TERRAIN_HEIGHT_MESH_STEP = 32` and `TERRAIN_HEIGHT_MESH_MAX_RISE = 28`. `renderer/heightMesh.ts` owns `bakeHeightMeshSurface` and `unprojectTerrainY`.

- The renderer clips a flat ground chunk into 32px global-grid squares and paints **two affine-textured triangles** per square, using the exact rise sampled for objects. The projected transparent surface is cached per ground chunk, with 28px top padding and far-to-near painter order; normal frames blit, not re-tessellate.
- Global mesh coordinates and the same diagonal split as `terrainRiseAt` keep adjacent 256px chunks geometrically continuous. Surface and sprite feet share one rise function; props stay upright rather than becoming decals.
- The height rise is less than the mesh step. `unprojectTerrainY` inverts projected screen Y by bounded bisection for construction ghosts, pointer interaction and keyboard cursor targets. XY gameplay and ordinary camera panning remain unchanged.
- Generation v1/v2 maps retain their flat ground/pointer behaviour. Height projection creates real **2.5D warped raster geometry**, not 3D triangles with a per-pixel depth buffer or perfect sprite/terrain occlusion. Some overlays and map-edge framing still require art polish.

### 6.3 Decor and draw order

`renderer/decor.ts` bakes static props within padded rectangles, but each anchor belongs to **one** owner chunk; overhang is allowed without double-drawing at seams. Vegetation is not duplicated into a second shader river stroke. Chunked decor is composed after cached ground, with living trees (`renderer/trees.ts`), grass (`renderer/grass.ts`), buildings and mobile entities drawn as separate depth-aware sprites. One decor bake per frame caps expensive allocation; large props need overscan above and around their origin. Changing edited terrain or building footprints may require explicit decor invalidation — the generation-time prop list does not automatically relocate.

## 7. Gameplay, terrain changes and persistence

**Placement and economy:** `buildingPlacementActions.ts` records the original `building.siteTerrain` before construction clears forest. `terrainSystems.getTerrainEfficiencyMultiplier` reads the recorded original site rather than a newly painted clearing. `rebakeTerrainGrids` maintains path/build projections after changes; presentation cannot write them. Water crossing, bridge placement and site validation must follow gameplay tiles, not colour.

**Save contract:** `saveLoad.ts` writes a compact `WorldMap` reference containing `seed`, `terrainSeed` as `_terrainSeed`, `preset`, `size`, tile dimensions, `_generationVersion`, `_overrides` and `_compact: true`; world pixel dimensions also come from saved world state. Loading regenerates using **that specific recipe** and then reapplies validated sparse overrides through `setTileOverride`. Missing `_generationVersion` resolves to **v1**, not today's default v4. The stored noise seed takes priority; an older pre-offset seed path has a fishing-spot placement compatibility check. Noncompact saves preserve their stored map.

Version matrix for code reviews:

| Saved version | Terrain regeneration | Presentation / migration |
| --- | --- | --- |
| 1 | Legacy recipe; version missing also resolves to 1 | Preserve legacy flat interaction and water rules. |
| 2 | Accepted preset-era recipe | Linear-segment water masks; no new forest sampling or height mesh. |
| 3 | Smoothed channels, riparian gradients, grove distributions | Supports raised mesh; flow-specific water surface prepass runs for v3. |
| 4 | New-game default, v3+ hydrology and continuous ecotones/material-aware decor | Supports raised mesh and v4 nature materials; **v3-only river highlight prepass needs explicit assessment**. |

**Immutable contracts:** Never reorder old RNG calls, silently alter a saved seed/size law, overwrite old regeneration logic in place or regenerate a full noncompact map. If physical generation changes, introduce **v5** and add old/new deterministic round-trip fixtures. Shader-only enhancements can keep generation versions when compatible, but still need visual and cache tests. Never store presentation meshes or transient shading fields in saves.

## 8. Canonical ownership and API boundaries

| Responsibility | Owning module / API examples |
| --- | --- |
| World-map setup, camp clearing | `terrainGen.ts` — `generateWorldMap`, `findCampSite`, `ensureCampClearing` |
| Seed, terrain recipe, river coverage and decor | `terrain/terragen.ts` — `terrainSeedFor`, `generateRawTerrain` |
| River drainage, width | `terrain/hydrology.ts` — `fillDepressions`, `computeFlow`, `riverWidthAt` |
| Noise and rain shadow | `terrain/noise.ts`; `terrain/rainShadow.ts` — `rainShadowField` |
| Biome identities / visual deco types | `terrain/biomes.ts` |
| Gameplay terrain and occupancy | `terrain/terrainGrid.ts` — `classifyTile`, `tileAt`, `tileTypeAt`, `setTileOverride`, `rebakeTerrainGrids` |
| Terrain-type traits | `terrain/terrainTraits.ts` — `isWaterTerrainType`, `isUnbuildableTerrainType` |
| Ecotone weights | `terrain/ecotones.ts` — `sampleEcotone`, `treeEcotoneAt` |
| Continuous field paint + river visuals | `renderer/whittakerTerrain.ts` — `buildWhittakerFields`, `bakeWhittakerGround`, `sampleRiverPhase` |
| Ground caching and composition | `renderer/terrain.ts` — `planGroundChunks`, `drawGround`, `targetGroundStep` |
| Ground warp / inverse pointer mapping | `terrainAtlas.ts` — `terrainRiseAt`; `renderer/heightMesh.ts` — `bakeHeightMeshSurface`, `unprojectTerrainY` |
| Props, living flora, material assets | `renderer/decor.ts`, `renderer/trees.ts`, `renderer/grass.ts`, `renderer/grassTextures.ts`; living entities in `worldGen.ts` |
| Saves and regeneration | `saveLoad.ts` — compact/restore and override validation |

The definitive function registry is [OWNERSHIP_OVERVIEW.md](../OWNERSHIP_OVERVIEW.md); the decision registry is [src/game/simulation/decisionRegistry.ts](../src/game/simulation/decisionRegistry.ts). They were consulted while consolidating these **documents**: this change adds no functions or simulation writes, so no fabricated owner/decision entry is introduced. For future implementation patches update **both** registries in the same PR and use actual entrypoint, cadence, caller, write set and tests. New code imports directly from the owner and must not introduce aliases/re-exports for convenience.

## 9. Verification matrix and acceptance criteria

| Check | Files / test coverage |
| --- | --- |
| Presets and map variety; buildable camps | `tests/terrain.presetIdentity.test.ts`, `tests/terrain.mapVariety.test.ts`, `tests/terrain.campGround.test.ts` |
| Flow network and river classifier | `tests/terragen.riverGeneration.test.ts`, `tests/terrain.naturalism.test.ts`, `tests/terrain.visualCoherence.test.ts` |
| V3 river materials, waterfall locality, chunk crop agreement | `tests/terrain.riverMaterials.test.ts` |
| Smooth v4 ecological fringes, retirement of tiny art | `tests/terrain.ecotones.test.ts`, `tests/terrain.retiredDecor.test.ts` |
| World-aligned nature textures, relief colouring | `tests/terrain.grassTextures.test.ts`, `tests/terrain.landformGraphics.test.ts`, `tests/groundLook.bands.test.ts` |
| Height mesh seam, inverse projection and bounded triangles | `tests/terrain.heightMesh.test.ts` |
| Original-site economic bonus | `tests/terrain.siteYield.test.ts` |
| Versioned saves, compact terrain seed and overrides | `tests/terrain.saveGenerationVersion.test.ts`, `tests/saveWorldMap.terrainSeed.test.ts` and other save round-trip fixtures |

Tests describe the **intended contract**; this documentation consolidation does not claim they were run. Before visual signoff inspect Arabia, Black Forest, Rivers, Highland, Coastal, Scandinavia, Meadows and Oasis on multiple seeds and zooms **0.5×, 1×, 2×** (also inspect raised terrain at **1.45× and 3×**). Compare river junctions and outlets, mountain-ground/sprite alignment, submerged gameplay cells, coastal seams, tree selectability, build ghosts and click accuracy, rock rings, light/shadow direction and material transitions.

Profile Medium, Large and Huge world generation time, Whittaker prepass and chunk-bake times, decor allocations, live tree counts and steady FPS. Check `docs/terrain-qa/` artifacts and the dedicated terrain visual-QA workflow as supporting evidence, **not** proof of a passing playtest without examining their results. No browser screenshot acceptance, production FPS improvement, or all-CI pass is claimed by this document.

## 10. Known limits and future work (not implemented by these documents)

1. **Visibility/depth:** Raised surface is a cached 2.5D texture warp; hills do not occlude every billboard/tree/building through a global depth buffer. Selection overlays and map framing remain partly flat.
2. **v4 flow highlights:** `buildRiverSurfaceFields` currently restricts flow highlights/rapids to exactly v3; review the intended v4 policy and test it explicitly before claiming parity.
3. **Edit visuals:** Sparse tile overrides are gameplay truth, but continuous ground colour may still be sampled from original climate/height. A cleared tile or build site can require a blended edit surface or decor invalidation.
4. **Art:** Further unique species/season sprites, scree and floodplain sets, sediment deltas, lake/stream differentiation and naturally eroded valley geometry need independent asset or generator work. Do not pretend shader tricks implement new physics.
5. **Performance / QA:** Chunk seams, waterfall readability, zoom LOD, foreground clipping, path-overlay alignment and Huge-map throughput still require on-device comparison before release. No per-frame full-map ray tracing or new heavy renderer should be introduced as a shortcut.
6. **Climate scope:** Per-preset daily weather and ambient-temperature simulation are separate systems, not owned by terrain rendering.

### Change procedure

1. Identify whether a proposal changes **saved generation**, gameplay classification, render-only material or runtime entities. Choose the existing owner accordingly.
2. For generation edits add a new version if old worlds would regenerate differently; test seed, size, preset, water, occupancy and camp repeatability, including v1–v4 old saves.
3. For presentation edits keep water/terrain classification and simulation XY unchanged; check chunk seams, inverse projection, clipping and performance.
4. Register new/changed functions and decisions in both authoritative registries; avoid duplicate implementations and re-exports. Follow [AGENTS.md](../AGENTS.md).
5. Report real bugs under `docs/bug_report/` per [bug report protocol](bug_report/readme.md), deduplicate against `docs/BUG_REPORTS/` and update [the single bug index](BUG_REPORTS/SUMMARY.md). Update [CHANGELOG.md](../CHANGELOG.md) for noticeable changes.
6. Run relevant regressions plus TypeScript checks, lint/build and actual browser visual tests as appropriate. Record exact pass/fail/not-run evidence instead of assuming success.

### Source history (merged)

- [#63 Terrain presets](https://github.com/Rengerams/wilderfolk/pull/63)
- [#73 Natural rivers and forests](https://github.com/Rengerams/wilderfolk/pull/73)
- [#75 Flow-oriented river surface](https://github.com/Rengerams/wilderfolk/pull/75)
- [#76 Relief material and grounding](https://github.com/Rengerams/wilderfolk/pull/76)
- [#77 2.5D cached mesh](https://github.com/Rengerams/wilderfolk/pull/77)
- [#79 Ecotones and nature sprites](https://github.com/Rengerams/wilderfolk/pull/79)

The former four phase-specific Markdown files have been retired. Use this document for current terrain architecture, preserved constraints and implementation history.