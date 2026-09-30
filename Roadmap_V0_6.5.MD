# Wilderfolk Roadmap — v0.6.5

Status: planning opened 2026-09-20 · Baseline: **v0.6.4.1** (working tree)

This is the forward plan for the version **after** 0.6.4.1. It is the counterpart to `Roadmap_V0_6.4.1.MD`, which closed out: everything in that table is now either delivered or dropped, so this file starts clean rather than carrying a completed checklist forward.

It is the **feature and change record** — what is coming, why, and what it gives the player. Per-defect records live in `BUG_REPORTS/`, the per-change narrative in `CHANGELOG.md`, and audit row status in `docs/private/audits/`.

## Where v0.6.5 starts from

v0.6.4.1 shipped the strongest readability pass the game has had: the **Village Dashboard** (valley concerns with severity, "what changed?" against a real previous day, 30-day food-by-produced-source, the Daily Council Report, and a per-settler "why?"), the **Infrastructure & Logistics overlay** (hotkey **X**, including blocked paths), **Workforce Policy Presets**, **legacy goals** in the Chronicle, and inspector explanations for staffing and movement. Gameplay gained family and youth immigration, the adoption rules, 24-hour prison guard duty, schedule-aware evenings, readable zoom, the school roster, and a 72-second day at 1×.

The load-bearing engineering facts it left behind, which every item below must respect:

- **One mutable `WorldState`**, mutated only in the four fixed tick layers and their named domain owners. No new tick layer.
- **Determinism** from `simRng` owner streams — same seed, same world, across save/load and worker hand-off.
- **`RenderSnapshot` is read-only**; the renderer draws, it never decides.
- **UI is a projection.** Players act through typed `WorkerCommand`s; panels read read-only projections.
- **The save gate is exact.** `GAME_VERSION` is `0.6.4.1`, so only 0.6.4.1 saves load. A save-shape change is a policy decision, not a cleanup.

---

## Theme 1 — The terrain overhaul (Teraforge) — the headline project

The single largest piece of work on the table: replace the current world generation **and** pathfinding with the four-layer landscape described in `TERAFORGE.md` — real relief with clustered mountain ranges, gradient-walker rivers that carve gorges, waterfalls, lakes and floodplains, **15 biomes** blended by temperature × moisture × elevation with no tile seams, per-pixel rendering with hillshading, and much larger maps (Teraforge *Medium* = today's *Huge*; Teraforge *Huge* is ~5.8× today's area).

**What blocks it today is the terrain data model, not the language or the renderer.** `WorldMap.tiles: TerrainTile[][]` is a single grid of objects at one resolution (`TERRAIN_TILE_SIZE = 10`). Teraforge needs **four layers at three resolutions**: `L0` path 10 px · `L1` build 20 px · `L2` terrain 64 px biome cells · `L3` decor.

Three rules the integration must follow, each established by reading the current owners:

1. **A flat, typed-array `WorldMapV2`** (one typed array per layer, with a `tileAt()` adapter for the ~62 existing `.tiles`/`TerrainTile` references across 15 files). This is the change that unlocks the model *and* improves cache locality at 5.8× the map size.
2. **Worldgen is offline; pathfinding is not.** Generation is a one-time bake — it can come from a separate tool or service and be **baked into the save**. Pathfinding runs per tick (~104 spatial queries/tick), so it must stay **in-process**. Both halves must not be wired the same way.
3. **Do not re-attempt PixiJS for the new visuals.** It has been introduced and withdrawn twice in this repo (`CHANGELOG.md:1045`, row N36, and two `BUG_REPORTS/2026-09-17-pixi-*.md`). The canvas2D ground is the shipping path. **Closed 2026-09-25: the Pixi ground renderer, its `USE_PIXI_GROUND` switch and the `pixi.js` dependency are deleted**, so this is now enforced by the tree rather than by convention.

**First slice:** the representation swap behind a switch, with the old generator still available, gated by the existing deterministic 360-day oracle (`scripts/run-full-year.mts --scenario=producers --seed=12345`) diffed checkpoint by checkpoint.

**Status (2026-09-24): the overhaul shipped, and the integration is now finished.**

Generation, the per-pixel renderer, elevation-aware pathfinding and the weather visuals are in the tree. The data model landed as a **hybrid** rather than the full `WorldMapV2` swap above: `WorldMap` gains **additive typed-array fields** (`elevation`/`moisture`/`temperature`/`riverDist`/`terrain` + `pathGrid`/`buildGrid`, plus `waterfalls`/`stats`/`seaLevel`) alongside the sparse `overrides` layer. A true `WorldMapV2` representation swap remains open if the cache-locality win is wanted; the offline-bake-into-save path is likewise not built — generation still runs in-process on `initGame`.

**The `tileAt()` adapter is built, and it was load-bearing.** The first pass deleted `WorldMap.tiles` without shipping the adapter the plan called for, which left 25 files and 83 type errors reading a grid that no longer existed — `generateWorldMap` itself threw on every call, so no settlement could be created at all. `terrain/terrainGrid.ts` is now the single reader of the four layers (`tileAt`, `tileTypeAt`, `isTileWalkable`, `isTileBuildable`, `setTileOverride`, `rebakeTerrainGrids`, `terrainReader`), every consumer goes through it, and the test fixtures build real maps through it too.

**Generator tuning (the second pass).** The engine ran but produced a flat, uniformly green, mostly-canopy valley. Measured and fixed at source: min/max height normalisation left the land in `h ∈ [0.07, 0.32]` so the rock and snow bands were unreachable (**0.1 % rock, 0 % snow**) — now quantile-spread with the sea level carried to its own quantile so the water fraction is unchanged; the moisture field was a single climate and the preset bias never reached it — now applied, amplified against the field's *measured* range, and drying with altitude; grassland was a catch-all rather than the dry-temperate biome — the classifier now follows the precipitation × temperature chart with elevation as the outer gate, and derives its two moisture cuts **per map** from that map's own distribution; and the cast-shadow pass darkened water, which is what drew the hard dark outlines around rivers. The tile-era decor ground pass was deleted with them (it drew a square grid over the smooth ground) along with `stampMountainPeaks`, which requested a sprite directory that does not exist.

**Measured across six presets after the pass** (seed 12345, 2560×1920): continental 36 % grass / 20 % forest / 12 % hills / 4 % rocky; arabia 23 / 27 / 17 with 11 % rock and 6 % mountain; highland 33 % forest with 10 % mountain; meadows 21 / 30 / 19; black_forest 20 / 39 / 20; rivers 28 / 24 / 11. Gates: `test:types` 0, `lint` 0/0, `build` exit 0, `test:standard` 266 files / 1459 passed, and the 360-day oracle 0 invariant violations / 0 stalled ticks / 0 worker fallbacks.

**Biome and waterline smoothness shipped (2026-09-24).** Two changes, both researched against how map generators normally solve this:

- **Biome edges are dithered.** `classifyTile` takes a coherent zero-mean dither (the cell's own elevation field) that shifts every band at once, so two biomes interlock along a ragged edge instead of meeting on a lattice line.
- **The water layer has its own, finer lattice.** One resolution cannot serve both layers — the climate field is smooth and content at 64 px, while the water mask is where the eye sees structure. `WATER_CELL` (16 px) now rasterises rivers and the shoreline separately, and `TERRAIN_CELL` dropped **64 → 16** once nothing depended on it agreeing with the water mask. That took the terrain lattice from **40 × 30 cells** to **160 × 120** on a 2560×1920 map, so a coastline, a lake edge and a carved river valley are all smooth curves instead of staircases. The per-pixel shader also gained a wet-sand tideline band and tighter depth bands (a shelf now stays a shelf rather than darkening to ocean blue within a few pixels).

**This was safe only because of the order.** Doing it as the one-line `TERRAIN_CELL` change first turned three tests red — including a real worker-vs-main determinism divergence the old map never exposed. Splitting the water lattice off first meant the resolution change reclassified nothing that any fixture pinned. All 266 test files pass.

**Cost, measured:** whole-map ground bake 2.3–2.5 s at 2048×1536 (was 1.8–1.9 s); generation 21 ms at 2560×1920.

**The rivers are hydrological now (2026-09-24) — the SIGGRAPH 2013 river model.** The valley's water used to be drawn, not drained: sources were picked by an elevation score, each river walked a gradient with a meander bend, its width was a function of how far along the path it had travelled, and every river cell was clamped to sea level. So a river could cross another, none of them knew how much land fed them, and a mountain stream was a sea-level canyon with a terraced edge. It now works the way Génevaux et al. describe in *Terrain Generation Using Procedural Models Based on Hydrology*:

- **Water is routed first.** A new owner, `terrain/hydrology.ts`, fills sinks (priority flood), computes D8 steepest descent with a flat-resolution sweep, and accumulates the upstream area — so every interior cell drains somewhere and a river follows a real path to the sea instead of a gradient with a bail-out.
- **A river is as big as its catchment.** Width comes from the paper's mean-flow law `φ = 0.42·A^0.69` through `w ∝ φ^0.5`, so headwaters are thin and the trunk river is broad — the map's own largest catchment is the normaliser, so each preset keeps the character its `riverWidth` asks for.
- **The channel carries its own elevation.** A river is cut below *its own* surface, at a depth that scales with its width, and its banks take a bounded share of that depth before fading into the hill — no sea-level plate, no ring, and the hill's own relief stays the valley wall.
- **Measured:** interior dead ends 14–27 % → **0**; the longest drainage walk ~30 → **132–205 cells**; trunk catchments of **6 190–12 517 cells** against a mean of ~4; rivers per preset unchanged (`oasis` still dry by design); same seed, same world. Six cases in `tests/terragen.riverGeneration.test.ts` guard the network, the accumulation tail and the width law.

**And the ranges have weather sides now (2026-09-24) — the rain shadow.** Moisture was a noise field plus a symmetric altitude penalty, which dries both flanks of a mountain equally: a range had no wet side and no dry side, so arid ground came from the noise and tended to sit on the coast instead of behind the hills. `terrain/rainShadow.ts` adds the directional half — each cell marches upwind on a west-south-westerly heading and records the tallest ground between it and the wind, capped and decaying over 48 cells — and the moisture pass subtracts the result *before* the biome cuts, which are quantiles of the finished field. That order is what makes it safe as well as right: a map keeps its wet/dry **proportions** while their **placement** becomes topographic, so the same valley is wooded to windward and open to lee. Measured at matched mid-altitude: **0.12–0.18** moisture in the shadow against **0.32–0.36** in the open, correlating **−0.49…−0.65** with the barrier on every preset, and every preset keeps its own climate (arabia 68 % dry, oasis 84 %, black_forest 61 % wet).

**Biome placement follows latitude now (2026-09-25) — the parameterization from Choroś & Topolski's *Parameterized and Dynamic Generation of an Infinite Virtual Terrain with Various Biomes using Extended Voronoi Diagram* (J.UCS 22:6, 2016).** The paper's contribution is that a biome should be chosen by **where a point is** — its latitude — rather than by one per-map climate constant, so the landscape reads as zones instead of a scatter of patches. Wilderfolk's map is finite and `WorldMap` is an explicit rectangle, so the paper's infinite-terrain machinery (its wrapping `mod(2S)` zone cycle, quad LOD layers, spiral draw order) has no counterpart here; what transfers is the parameterization itself.

- **The map's y axis is its latitude.** `latitudeCooling` is a **triangular wave** over the row — 0 on the middle row (the equator) and maximal at both edges (the poles) — so the cool zones are symmetric about the middle rather than biased to one end.
- **It is additive, and that is why the presets had to be re-based.** Latitude only removes heat, and it is subtracted *before* the long-standing `× 1.1` amplifier, so the equator row reads exactly the preset's authored `temperature` and every other row is colder. That also makes `temperature` **the equator's air temperature**, and a preset only has zonation if that value clears `COLD_TEMPERATURE` (0.3) *after* the elevation penalty (0.7 per unit above sea level). Measured against that rule, `scandinavia` at its old 0.18 was below the threshold on **every row** — 0 % grass, 0 % forest, 29–41 % dark forest, and latitude changed nothing at all. The cool presets are therefore re-based so their equator is genuinely temperate (`scandinavia` 0.18 → 0.56, `highland` 0.40 → 0.62, plus smaller lifts on the rest; the reasoning lives beside the table in `PRESET_SETTINGS`), and that re-basing is where the zonation actually comes from.
- **Measured, seed 12345 / 1280×960 — equator band temperature and warm/cold land share, before → after the re-base:** `scandinavia` **0.08 → 0.46** equator against 0.23 top / 0.38 bottom, warm land **0 % → 34 %** and cold land 63 % → **29 %**; `highland` 0.22 → 0.45 with warm land **7 % → 33 %**; `arabia` 0.49 → 0.57 at 54 % warm; `continental` 0.53 → 0.59 at 43 % warm. `scandinavia` remains the coldest preset by a clear margin — it is boreal through its **latitude bands and its moisture**, not by being frozen at every row.
- **The band edge is drifted by coherent noise** (`hash2`, not a value-noise lattice, so the offset has no lattice of its own). A raw triangular wave draws perfectly straight horizontal climate lines, which is the artefact the paper adds detail to avoid. The noise is seeded, so two seeds do not share one set of climate lines and one seed still reproduces its own exactly.
- **One source of truth, two readers.** The parameter is applied *inside* the `temperature` field rather than at the classifier, so `terrainGrid.classifyTile` (the tile a settler walks on) and the per-pixel ground bake both get zonation for free and cannot disagree about it. `LATITUDE_SPAN` is 0.3: deliberately modest, because a wider span drives the polar rows onto the `clamp` floor, where the gradient is lost and a whole edge reads as one flat band. (Measured at span 0.55: `continental` warm-biome share 6 % against 11 % at 0.3, with 9 % of cells pinned.)
- **Verification:** four cases in `tests/terragen.latitude.test.ts` pin the gradient, its symmetry about the middle, its non-saturation, its dependence on the seed, and determinism; `tests/groundLook.bands.test.ts` still passes, so the ground bake paints the classification it is drawn under. Gates: `test:all` **240 files / 1475 passed, 2 skipped, 0 failed**, `tsc` clean, `lint` 0/0, `build` exit 0.

**The ground's detail is band-limited to the eye's roughness band now (2026-09-25) — from Padilla's psychophysics of 1/f^β noise surfaces.** Stefano Padilla, *Mathematical models for perceived roughness of three-dimensional surface textures* (PhD thesis, Heriot-Watt, 2008; the paper is *Perceived roughness of 1/f^β noise surfaces*, Vision Research 48), fits a band-pass over the psychophysical data and finds perceived roughness is carried by a **narrow band of spatial frequencies** — the optimised box filter lands on **1.53–4.58 cycles per degree** (§7.3.1), and detail outside it moves perceived roughness very little. On the display that was calibrated for the experiments (0.255 mm pixel pitch at 87.7 cm ⇒ 60 px per degree) that band is **≈13–39 px per cycle**, which is what the ground art is now built on. What it exposed: the mixes had all their detail *below* the band — stone's fracture octaves sat at 0.6–4.5 px periods, dirt's at 0.8–2.9 px — so a 1:1 crop of a rocky hillside was a uniform grey speckle with no bedding in it at all, and a snowfield was flat white. Grass (a 21 px clump) and sand (a 33 px dune) were the only materials with anything inside the band.

- **Every material owns a roughness octave inside the band.** `ROUGHNESS_BAND_PX` and `ROUGHNESS_OCTAVE_PX` name the band and the octave each material carries — stone a bedding ledge plus rubble, dirt a patch, snow a wind-worked drift, grass a tussock, sand a wind ripple — and `bandDetail(wx, wy, seed, periodPx, pxStep)` authors it with a period fixed in **canvas** px, so a coarse chunk bake re-samples it instead of pushing it out of the band (a world-fixed octave halves its period when the world step doubles; this one does not).
- **The sub-pixel grain is trimmed, not deleted.** Past the band's lower edge extra grain buys almost no perceived roughness — it reads as fizz — so those octaves keep the share material identity still needs (dirt grain 26 → 18 and its 0.8 px term 10 → 5, stone grain 20 → 8, grass grain 10 → 5, sand ripple 7 → 5, snow sparkle 16 → 12).
- **Measured** (1600×1200, seed 12345, spring, whole-map 1:1 bake, luma band-passed to 13–39 px per cycle — i.e. the bake's own perceived roughness): **rock 5.45 → 6.01** and **hills 4.34 → 4.61** on highland, **rock 4.93 → 5.50** on continental, with grass essentially unchanged (4.06 → 4.09 / 3.25 → 3.29) — the roughness materials gained in the band and the smooth ones did not. Bake cost **1.28 → 1.44 s** and **1.35 → 1.49 s** on that whole-map path (one extra noise octave per land pixel), i.e. a 256 px chunk on the shipping path goes ~27 ms → ~30 ms.
- **Verification:** a case in `tests/groundLook.bands.test.ts` pins both halves — every material has at least one octave inside the band, and `bandDetail` returns the same value when the world step doubles (the period stays on screen). Gates: `test:all` **240 files / 1478 passed, 2 skipped, 0 failed**, `tsc` clean, `lint` 0/0, and the built-artifact browser gate `test:browser` **pass** (11 835 distinct ground colours against its 4 000 floor, mean luma 114.6, dark ratio 0.002, far-zoom non-void 0.997).

**Mountains read their elevation now (2026-09-25) — the altitude half of relief shading.** The ground art shaded terrain from `slopeX`/`slopeY` alone, which describes how a cell *tilts* and says nothing about where on the mountain it sits. That is why a range read as one mid-tone plate: a valley floor is flat, so its gradient is **zero** and it came out exactly as bright as a plain. Measured before the change, the mean luma of the highest quartile of hilly ground sat **0.5 luma** from the lowest quartile on scandinavia (highland −9.3, and that is mostly snow rather than relief) — height barely read as light at all.

- **A new field, `WhittakerFields.relief`,** carries each cell's height against a blurred copy of the same field (radius 6 cells, one pass per map, 9–10 ms) — negative in a hollow, positive on a ridge. The bake adds it to the hillshade term through the existing warm-lit / cool-shaded path, **weighted above the lowland band** so a plain stays a plain instead of being turned into a landform.
- **This is Imhof's pair, and the pair is the point:** slope shading gives a surface its *tilt*, altitude relief gives it its *place* on the mountain. Together a ridgeline reads as a ridge, a cirque as a hollow and a valley as the low ground it is.
- **Measured** (1600×1200, seed 12345, spring, whole-map 1:1): the luma spread over hilly tiles went **79.8 → 100.7** on highland, **79.1 → 97.8** on scandinavia and **79.1 → 101.8** on continental — darks darker and lights lighter, i.e. more of the mountain's form is expressed — with the field itself running p10/p90 −0.047…−0.083 / 0.058…0.099 in elevation units. The 1:1 before/after crops are `tmp/relief-before-*.png` / `tmp/relief-after-*.png`.
- **One source of truth for the light, which the shadow trace now shares.** The same pass corrected the cast shadow, which had been traced *down-light* and so was painted onto the flank the hillshade was lighting (its own record: `BUG_REPORTS/2026-09-25-cast-shadow-falls-on-the-lit-flank.md`); the hillshade and the trace now read one constant pair, and a blocker must out-climb a **sun inclination** instead of a flat minimum rise — the rule that had put 45 % of highland's land at full shadow.
- **Verification:** two cases in `tests/groundLook.bands.test.ts` (the shadowed side on a synthetic wall, and the sign of `relief` on a synthetic ridge and hollow). Gates: `test:all` **240 files / 1475 passed, 2 skipped, 0 failed**, `tsc` clean, `lint` 0/0, and the built-artifact browser gate `test:browser` **pass** (12 402 distinct ground colours against its 4 000 floor, mean luma 110.0 against 45 — 114.6 before this change, i.e. the shadows are local rather than a global dimming — dark ratio 0.001, far-zoom non-void 0.996).

**Teraforge's weather is now integrated as its registry (2026-09-24).** The weather visuals had been reimplemented Wilderfolk-style — Teraforge's ripples, fog bands and snow cover inside an `if`-chain over `state.weather` — which is its *look* without its *architecture*, and three of its effects had no equivalent at all. `renderer/weather.ts` is now Teraforge's design: **`registerWeather({ id, label, icon, create })`** with a `weatherRegistry`, each effect owning **`tint(frame)` / `update(dt, frame)` / `draw(g, frame)`** against a camera-aware `WeatherFrame`, and `daylightTint` ported. What that changes on screen:

- **The cloud layer is new**, and it drifts with the camera — Teraforge's soft `multiply` puffs are composed into rain, storm, fog and drought (Wilderfolk has no `Clouds` state, so they are a shared layer rather than a plugin nothing can select), and the fog bands take the same parallax.
- **Motion is frame-rate independent.** Effects advanced by fixed per-frame increments before (`b.x += b.sp * 0.01`), so weather ran at double speed on a 120 Hz display; `update(dt, …)` fixes it, with `dt` clamped to 100 ms so a backgrounded tab cannot teleport every particle.
- **`daylightTint`'s daylight temperature cast applies** (drought → heat haze, snow → cold, 08:00–16:00). Its dusk and night terms stay unwired: Wilderfolk's day/night lighting overlay is disabled on purpose, and a weather port is not where that gets re-enabled.
- **Fog's declared veil finally draws** — `WEATHER_CONFIGS` has always said `overlayAlpha: 0.28` for fog, but the old band path returned before laying it down.

Three deliberate deviations from Teraforge's source, because Wilderfolk's rules outrank it: randomness comes from `getPresentationRng('weatherFx')` and never `Math.random` (`src/` may not call it, and the raw-`Math.random` guard enforces that), so weather stays deterministic per seed and out of the simulation's streams; **`WEATHER_CONFIGS` stays the one owner of the per-state numbers** instead of Teraforge's hard-coded tints; and **`drought`, which Teraforge does not have, is authored in its idiom**. The simulation is untouched — `updateWeather`, the farm multiplier and the dormant hostile-weather switch still remove the harm and not the sky. This closes the **weather half of Theme 2 Stage 3**; the water half is `drawWaterShimmer` and the seasonal particles beside it.

**Still open:**

1. **The whole-map bake is the blocker for the spec map sizes.** At 6144×4608 it measured **5.4 s** before these changes, so the bake has to become viewport-chunked (the same lazy pattern `bakeTerrainLayer` already uses) before *Huge* can ship. `pathGrid` also grows to 11.3 MB at that size, which is worth watching.
2. **Biome *colour* still steps where the classification steps.** The documented technique is per-biome **weights** blended into the colour ([biome weightmaps](https://repozitorij.uni-lj.si/Dokument.php?id=246478&lang=slv), [biome blending & transition logic](https://github.com/ZeAntonioM/WGen-2D/issues/5)) rather than one label per cell. The dither fixed the *shape* of the boundary; weights would fix the *colour* continuity across it.
3. **The Teraforge spec map sizes** (Medium 2560×1920 · Large 4096×3072 · Huge 6144×4608) — see 1.
4. A true `WorldMapV2` representation swap, and the offline-bake-into-save path.

---

## Theme 2 — Presentation: finish the graphics roadmap, then decide the renderer

`docs/archive/GRAPHICS_UPGRADE_ROADMAP.md` already defines seven stages. **Stage 1 (contact shadows) shipped**; Stages 2–6 are specified and not built:

- **Stage 2 — terrain materials:** grass/dirt/riverbank/rock/beach/mountain identity, baked into the existing caches.
- **Stage 3 — animated water and weather layers:** rivers flow, shores shimmer, rain and snow affect the scene. *(The weather half shipped 2026-09-24 as Teraforge's ported registry — clouds, ripples, fog bands, accumulating snow, daylight cast; see Theme 1. The water half is `drawWaterShimmer` plus the seasonal particles in the same module.)*
- **Stage 4 — settlement readability:** road aprons, crops, smoke, lanterns, work cues.
- **Stage 5 — sprite consistency:** one lighting direction, palette, outline and scale across people, animals, trees and buildings.
- **Stage 6 — camera and atmosphere:** softer dawn/dusk, restrained fog, biome tint, event lighting. *(The ported `daylightTint` now supplies the daylight temperature cast; the dawn/dusk and night terms are ported but deliberately unwired, because the day/night lighting overlay is disabled.)*

**Stage 7 is a decision, not a build:** profile the canvas2D path at target density, then choose between **raw WebGL/WebGPU for the terrain and decor layers only** (contained, keeps the simulation, UI and saves) or an **engine** — with the honest note that Godot would mean re-implementing ~72k lines of TypeScript and rebuilding ~80% of the test suite. Console/Steam distribution is the only driver that clearly justifies the engine.

---

## Theme 3 — Game feel

The measured gap between "fun in a browser tab" and "a real game" is mostly **shell and input**, not graphics — and it is cheap:

- **Gamepad support** — there are currently **zero** gamepad references in the codebase.
- **Fullscreen, pointer lock, and cursor hiding** — also zero references today. This is the single biggest "this is a web page" tell.
- **HUD redesign** — the React/Tailwind panels read as a dashboard. This is design work, and no engine swap substitutes for it.
- **Audio depth** — the bus structure already exists (`master`/`music`/`sfx`/`ambient` + a music filter); missing are spatial panning, reverb, and a compressor.

---

## Theme 4 — Scale and performance (only the measured hot paths)

A full 360-day Huge run is **healthy**: tick p50 3.21 / p95 16.76 ms against a 500 ms preferred budget, **0 stalled ticks**, **0 invariant violations**, worker 72/72 with 0 fallbacks. And **pathfinding is not a hot path** — 11,656 A\* calls over 25,920 ticks (**0.53/tick**) against **104.5 spatial queries/tick**, with 1 grid rebuild per map and a 71.2% waypoint-cache hit rate.

So the work is targeted, in measured order:

1. **`road_near`: 1,407,361 queries a year returning 0 candidates.** Find why it queries at all.
2. **`hunt`: 63,784 queries → 3,800,088 candidate checks** (~60 per query). The hunt adaptive config is already specified and on hold.
3. **Delta serialization:** p50 10.79 / **p95 45.40** / max 120.36 ms with **14 spikes past 50 ms**. This is the worker-boundary cost.
4. **Memory growth:** heap trended **+106 MB over one year** in the latest run and +224 MB in an earlier one. This is the real long-run risk and bigger maps will amplify it.
5. **Then** raise the documented **2,600-settler** ceiling — only after the above, measured at the new map sizes.

---

## Theme 5 — Readability and depth

- **Complete the Operations Center (F1).** It shipped as a dashboard *slice* and is the one row in the last roadmap that qualified its own status. Decide what full means: alerts that resolve, links to the exact person/building/action, and a "what should I do now" that survives a reload.
- **Deepen the Daily Council Report** into a planning rhythm rather than a summary.
- **Extend the "Why?" layer** from settlers to buildings, resources and warnings.
- **Authored content on the existing state** — more stories, festival outcomes, ecology signals — built on the current relationships, ecology, workforce, diplomacy and defense rather than beside them.

---

## Carried-over work

- **The resource desync** (owner-reported, 2026-09-20): the resource tabs can show enough while a build is refused. Localized to the display path — `rebuildOptimisticDisplay` = authoritative snapshot + replayed pending commands, replaced on each worker result, with a 250 ms UI throttle and pipeline depth 4 — but **not reproduced**, so not patched. Needs a browser reproduction with a save id.
- **Faction / affair drama re-measurement** — the tryst-site rule is fixed and caught-in-the-act demonstrably fires (4 in 100 days), but no like-for-like A/B exists.
- **Famine-bite tuning** — current values are playtest-flavoured.
- **Mountain peak overlay art** — four directional PNGs (45/135/225/315); optional polish **on top of** the working `terrain/mountain.jpg` ground art, and they must be re-added to the preload list to be used at all.

## Not in scope (owner rulings, standing)

- **Weather, disaster and crisis work** — parked permanently (2026-09-17). Do not re-propose.
- **Console/Steam** — the only trigger that reopens the engine question.

## Engineering contract for every item above

Each item states its owner, cadence, exact state writes, save impact, invalid-input behaviour, invariant coverage, and a player-visible acceptance check **before** implementation. No new tick layer for convenience. Diagnostics stay read-only and opt-in. Any new durable field needs the full contract: save allow-list, `simDelta` extract/apply, and `simPrep` rollback.

## References

- `Roadmap_V0_6.4.1.MD` — the completed prior plan
- `TERAFORGE.md` — the terrain overhaul specification
- `docs/archive/GRAPHICS_UPGRADE_ROADMAP.md` — stages 1–7
- `CHANGELOG.md` — the per-change record
- `BUG_REPORTS/` and `docs/private/audits/2026-09-16/LIVE-FINDINGS-STATUS.md` — defect and audit records
- `OWNERSHIP_OVERVIEW.md` — the ownership contract
