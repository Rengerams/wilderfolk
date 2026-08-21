# Wilderfolk Graphics Upgrade Roadmap

**Status:** Proposed visual roadmap  
**Applies to:** the current Canvas 2D, worker-authoritative, 2.5D presentation architecture  
**Goal:** make the valley richer, clearer, and more atmospheric without replacing the renderer or moving simulation rules into visual code.

> **Core decision:** Wilderfolk is already a 2.5D game. The simulation and navigation stay on a 2D tile grid; the visual upgrade should strengthen depth, materials, light, motion, and readability in the existing Canvas pipeline. It does **not** need a Phaser migration or 3D navigation system.

## Current rendering strengths

The renderer already has a strong foundation. `renderer.ts` composes a static terrain bake, a cached entity layer, and a live overlay. Terrain is baked to an offscreen layer and rebuilt only when the world, season, or relevant cache key changes. The current presentation already includes preset palettes, seasonal color blending, a floating-map slab with a shadow and rim, terrain decorations, weather, night effects, particles, and a cached entity layer.

| Existing system | What it already provides | Keep it? |
|---|---|---|
| `terrainLayer.ts` + `renderer/terrain.ts` | Cached terrain texture, seasonal palette, river glaze, world slab, map rim | **Yes — extend it** |
| `entityLayer.ts` + `renderer/entityComposite.ts` | Offscreen compositing and camera-anchor reuse for world entities | **Yes — keep dynamic work bounded** |
| `renderer/humans.ts`, `animals.ts`, `buildings.ts`, `trees.ts` | Separate draw passes for world subjects | **Yes — add depth/readability inside these passes** |
| `renderer/nightEffects.ts`, `weather.ts`, `particles.ts` | Atmosphere and transient feedback | **Yes — improve selectively** |
| Canvas 2D + image smoothing disabled | Crisp pixel-art presentation and broad browser compatibility | **Yes — retain** |

## Visual direction

The target is **a readable, storybook frontier diorama**: warm inhabited ground, cool shadowed wilderness, clear watercourses, buildings with material weight, and living settlers visible at a normal play zoom. The player must be able to read the following within a second:

1. Where water, cliffs, roads, forests, and buildable land are.
2. Which buildings are important or staffed.
3. What settlers are doing and where they are moving.
4. Whether it is day, dusk, night, clear weather, or a storm.

The visual hierarchy should therefore favor landscape and settlement readability before expensive polish.

## Recommended stages

| Stage | Upgrade | Player-visible result | Main render owner | Performance model | Priority |
|---|---|---|---|---|---|
| 1 | Contact shadows and height/occlusion pass | Units, trees, and buildings sit on the world instead of appearing pasted on top | `renderer/spriteDrawing.ts`, `humans.ts`, `animals.ts`, `buildings.ts`, `trees.ts` | Small live shadow per visible subject; no simulation writes | **Shipped in v0.6.2.1** |
| 2 | Terrain material pass | Grass, dirt, riverbanks, rock, beach, and mountain areas gain clear material identity | `terrainLayer.ts` | Bake into existing offscreen terrain/decor caches | High |
| 3 | Animated water and improved weather layers | Rivers flow visually, shores shimmer subtly, rain/snow affects the scene | `renderer/terrain.ts`, `weather.ts`, `nightEffects.ts` | One or two screen-space passes; no per-tile animation loop | High |
| 4 | Settlement readability pass | Roads, building aprons, crops, smoke, lanterns, and work cues make the village feel inhabited | `terrainLayer.ts`, `buildings.ts`, `markers.ts`, `particles.ts` | Static details baked; transient effects capped and culled | High |
| 5 | Sprite consistency pass | Humans, animals, trees, and buildings share a clearer lighting direction, palette, outline, and scale | Asset pipeline + existing subject renderers | Asset replacement plus existing draw calls | Medium |
| 6 | Camera and atmospheric polish | Softer dawn/dusk, restrained fog, biome-distance tint, and event-specific lighting | `nightEffects.ts`, `overlay.ts` | Full-screen gradients only; respect reduced-effects setting | Medium |
| 7 | Optional GPU/WebGL investigation | Only if Canvas profiling proves a rendering bottleneck at target population | Separate measured proposal | Do not adopt Phaser merely for this | Later only |

## Stage 1 — contact shadows and occlusion

**Implementation record — v0.6.2.1:** Completed as a render-only G1 pass. `spriteDrawing.drawContactShadow()` now gives visible humans, animals, trees, and completed buildings a shared south-east contact/cast-shadow language after their existing viewport culling. The compact core shadow remains when cosmetic effects are reduced; the secondary cast tail and stronger ambient-occlusion pools are reduced with the existing effects preference. No `WorldState`, collision, pathfinding, click target, cache-invalidation, or worker behavior changed. `tests/renderer.presentationLayout.test.ts` pins the helper’s reduced-effects behavior and its use by every subject renderer.

This is the highest-value first change because it improves every scene without requiring new gameplay data or an engine change. Each visible human, animal, tree, and building should receive a small dark elliptical contact shadow anchored at its ground/foot position. Tall objects should also use a consistent draw order and, where necessary, a soft north-west-to-south-east cast shadow.

The implementation must remain presentation-only. It should use the existing entity/building/tree draw passes and camera culling. A shadow must never change collision, movement, pathfinding, click targets, building occupancy, or worker state.

| Requirement | Acceptance criterion |
|---|---|
| Human contact shadow | A visible ellipse appears beneath feet at normal zoom and follows the sprite smoothly. |
| Building and tree depth | A stable cast shadow establishes a shared light direction without hiding nearby units. |
| Readability | A human standing near a building or tree remains distinguishable from the ground. |
| Performance | No terrain-cache rebuilds per frame; only visible subjects are drawn; no new simulation fields are required. |
| Accessibility | The effect can be reduced or disabled together with other cosmetic effects if a settings path exists. |

## Stage 2 — terrain material pass

The current terrain cache is the correct place for richer ground. Add variation at bake time, not in the realtime simulation loop. The goal is not random noise everywhere; it is recognizable materials.

| Terrain | Recommended visual treatment |
|---|---|
| Grassland | Three restrained grass-value variations, occasional dry patches, and edge darkening beneath trees/buildings. |
| Forest | A darker, cooler ground under dense canopy; limited leaf litter or moss decals. |
| River and shore | Clear blue channel core, lighter moving highlight band, darker inside bank, and a pale wet edge. |
| Riverbank and beach | A visible transition strip with exposed soil/sand, not another grass color. |
| Hills and mountains | Directional ridge highlights and darker downhill faces derived from terrain elevation, baked once. |
| Arid/coastal/harsh presets | More than palette swaps: preset-specific decals and material texture balance. |

## Stage 3 — water, weather, and time of day

Water should look alive without simulating fluid physics. Use a slow screen-space or cached-pattern offset for highlights, keeping the actual river topology entirely in `WorldMap` and the terrain generator. Weather should modify atmosphere, not hide gameplay.

| Effect | Safe implementation |
|---|---|
| River flow | Clip a low-alpha highlight pattern to river cells or render a sparse moving glint pass. |
| Shore sparkle | A capped number of deterministic glints keyed by world seed and render clock. |
| Rain | Screen-space diagonal streaks plus modest ground darkening; cap particles by zoom and viewport. |
| Snow | Slow, sparse flakes plus a season-owned palette change already provided by terrain baking. |
| Dawn/dusk | One low-alpha gradient and warm window/lantern points; no shader or simulation tick needed. |

## Stage 4 — make the settlement tell its story

The world should visually answer “what is happening here?” without opening a panel. Roads and building aprons are especially valuable because they turn a set of placed sprites into a settlement.

- **Desire paths:** bake faint dirt tracks between occupied homes, workplaces, Town Hall, and tavern locations. Treat them as visual-only until a separate gameplay decision explicitly makes roads affect speed.
- **Building aprons:** add dirt, stones, porch boards, or cleared grass under buildings to reduce the pasted-on look.
- **Work cues:** keep smoke, forge glow, crop rows, stacked logs, and market cloth subtle and conditional on the existing render snapshot.
- **Night identity:** place warm, low-radius lantern/glow points at occupied civic buildings and festival locations. Do not add new settlement-state mutation for this; derive it from current snapshot fields.

## Asset strategy

Do not generate a disconnected collection of high-detail images. Build small coherent families of assets that share a camera angle, light direction, palette, and pixel density. The current asset sizes vary substantially, so future replacements should be exported consistently and packed into shared atlases where appropriate.

| Asset family | First additions | Constraints |
|---|---|---|
| Terrain | grass/dirt/riverbank/rock overlays, cliff-edge strips, shore highlights | Tileable, palette-limited, no baked text |
| Buildings | shadow masks, roof/wall material variants, work-state accents | Same light direction, same ground anchor, transparent background |
| Humans and animals | directional idle/walk frames, role accents, readable silhouettes | Preserve existing scale and hit/readability area |
| Nature | tree canopy variants, fallen logs, shrubs, seasonal overlays | Keep collision/pathing separate from art |
| Effects | smoke, ember, rain, snow, water glints, soft lantern bloom | Capped particles; premultiplied-style clean alpha where needed |

## Performance and ownership rules

The graphics roadmap must preserve the current architecture.

| Rule | Requirement |
|---|---|
| Simulation authority | Renderer reads `RenderSnapshot`; it never writes `WorldState`, pathing, collision, resources, or event logic. |
| Static work | Terrain materials, decals, and preset variation are baked through the existing terrain/decor cache. |
| Dynamic work | Shadows, water glints, lights, weather, and particles are viewport-culled and capped. |
| Cache behavior | A cosmetic animation must not invalidate the whole terrain/entity cache every frame. |
| Accessibility | Add a low-effects/reduced-motion branch before accumulating expensive particles and light overlays. |
| Verification | Compare screenshots at normal and close zoom, then record frame-time impact at the agreed population tiers. |

## What not to do first

Do not migrate the game to Phaser, Three.js, or a full WebGL engine as a graphics “upgrade.” That would replace the Canvas renderer, camera behavior, input/render loop, asset assumptions, and possibly worker boundaries without first proving that the current renderer cannot meet the desired look.

Do not make roads affect pathfinding or movement speed as part of a visual pass. That is a separate simulation decision with its own owner, cadence, tests, balance work, and bug-report workflow.

Do not add per-tile animation objects or a new update loop for every terrain cell. Use cached bakes and a small number of screen-space overlays instead.

## Suggested first bounded objective

> **Graphics Objective G1: grounded 2.5D depth.** Add contact shadows for visible humans, animals, trees, and buildings, plus a consistent light direction and conservative occlusion ordering. Keep all effects render-only, cull to the viewport, introduce no new simulation fields, and verify with before/after screenshots at normal play zoom.

This is the best first upgrade because it makes the entire game look more deliberate immediately, works with all terrain presets, costs little, and does not depend on a new engine or a large asset-generation batch.
