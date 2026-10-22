# The Pixi terrain container was never attached to `app.stage`, so the ground layer painted nothing: 2026-09-17

- Bug: the whole terrain/ground layer is missing in the game view — the map reads as the flat `VOID_WATER` surround with only entities/props drawn on it — while the minimap shows the same map correctly
- Status: resolved
- Date discovered: 2026-09-17
- Version/build: 0.6.4
- Reporter: traced from the 2026-09-16 handover ("rivers are constantly dry"; "on the minimap it looks great"); confirmed by on-screen pixel readback
- Area: UI
- Owner module: `src/game/renderer/pixiTerrain.ts` (Pixi ground pass), `src/game/renderer.ts` (frame composition)
- Cadence: every frame (render path)

## Status history

- 2026-09-17 — open (found while resolving `2026-09-16-terrain-atlas-art-missing-rivers-render-dry.md`:
  the handover's atlas-missing premise did not hold, so the live renderer was instrumented instead)
- 2026-09-17 — resolved (one-line scene-graph fix + a browser-tier guard that catches an unpainted
  ground layer)

## Observed behavior

The game view draws no ground at all: no grass, no forest floor, no sand, no water. The canvas shows the
dark surround colour with trees, animals and the grid drawn on top of it. Water is the most obvious
casualty, which is why the report came in as "rivers are constantly dry" — but *every* terrain type is
affected, not just water.

The minimap is correct, because it paints from its own hard-coded colour table and never touches this
path.

## Expected behavior

The ground pass paints the terrain the minimap describes: grassland green, water blue, sand tan.

## Reproduction steps

1. Start any settlement (`npm run test:browser` does this in a real headless Chrome).
2. Sample the presentation canvas at tile centres of any terrain type once the Pixi path is live.
3. Observe every sample equals `rgb(22, 40, 61)` — `VOID_WATER` from `renderer.ts:35`.

## Evidence

**Which renderer was live.** Instrumentation of the three `drawGround` outcomes plus a per-terrain
pixel readback (`getImageData` at tile centres, read immediately after the ground pass, before the
entity/overlay passes) produced:

- canvas2D boot frame — correct terrain: `grassland rgb(125,158,79)`, `forest rgb(87,149,72)`,
  `river rgb(57,120,164)`, `shallowWater rgb(95,159,194)`, `beach rgb(193,191,147)`
- **every later (Pixi) frame** — `grassland/forest/river/deepWater/shallowWater/beach` **all**
  `rgb(22,40,61)`, i.e. exactly the `VOID_WATER` fill from `renderer.ts:59-60`

**The art was never the problem.** `public/sprites/tileset_grass.png` **is shipped** (192×336 RGBA,
210/252 tile slots non-empty) and all ten water-family tiles `ATLAS_TILES` uses are blue-dominant
(id 61 "all water" = `rgb(73,85,126)`; grass tile 3 = `rgb(127,158,69)`). The fill sprites Pixi samples
are shipped and blue too (`water_deep_fill.png` = `rgb(63,127,166)`, 100 % of pixels blue-dominant;
loaded at runtime as 128×128).

**Root cause, by reading the scene graph.** `createPixiState()` created `root`, added all six graphics
children to it, and stored it — but never called `app.stage.addChild(root)`. `Application.render()`
renders `app.stage` (`pixi.js/lib/app/Application.mjs:84`), so the entire terrain tree was detached from
the render root and every frame composited a fully transparent Pixi canvas. `ctx.drawImage` of that
transparent canvas left the `VOID_WATER` fill painted underneath as the only visible ground.

## Root cause

`src/game/renderer/pixiTerrain.ts` built the terrain container and populated it, but never parented it
to the application stage. Pixi was the **first-choice** ground renderer (`renderer/terrain.ts:301`) at
the time, so this path was the live one; the canvas2D fallback (which paints correctly, and which
`USE_PAINTED_ATLAS = false` had been tuning) only ran for the single boot frame before `app.init()`
resolved. That is why the earlier atlas fix changed nothing the player could see.

**Current state — read this before relying on the sections below.** The fix is correct and its
fail-before proof holds, but it is **no longer the shipping path**: the owner chose the canvas2D ground,
so `drawGround` now takes `buildTerrainCache` + `drawProceduralGround` behind `USE_PIXI_GROUND = false`
and `renderPixiTerrain` is never called. Both Pixi defects recorded here and in
`…-pixi-webgl-init-retried-every-frame.md` are therefore **latent, not live** — the code is repaired and
`pixiTerrain.ts` stays in the tree, but nothing currently exercises it, and the numbers measured "with
the fix" below describe a build in which Pixi was still the live renderer. `USE_PAINTED_ATLAS` is again
load-bearing for what the player sees, since canvas2D is now the visible path.

## Regression test

The browser tier is the only tier where the real renderer runs, and it **passed with this fault
present** (the frame was neither blank nor dark enough to trip `imageLooksBlank`), so
`scripts/browser-smoke.mjs` now measures the share of the **void-surround colour family** inside the
map viewport (`MAP_REGION`) and fails the run above `VOID_WATER_RATIO_LIMIT = 0.25`.

The measurement is a family match, not an equality match, and that detail matters: the first attempt
compared against exact `#16283d` and **did not catch the fault**. `drawGameOverlay` ends with a screen
vignette that darkens the surround, so on a real void frame the dominant pixel is `rgb(17,37,60)` and
exact `#16283d` covers only **0.01 %** of the frame. Measured in the map viewport:

| Frame | void family | exact `rgb(22,40,61)` |
|---|---|---|
| ground unpainted | **60.7 %** (fail, as required) | 0.01 % |
| ground painted, Pixi live (stage fix only) | 1.0 % (pass) | 0 % |
| ground painted, canvas2D live (shipping) | 0.53 % (pass) | 0 % |

**Fail-before evidence** (stage attachment removed, everything else identical, Pixi still the live
renderer): `verdict=fail`, exit 1, `voidWaterRatio=0.6069`, message "Valley frame is 60.7 % the void
surround colour family in the map viewport (limit 25 %) — the ground layer did not paint". **With the
stage fix and Pixi live:** `valley` 0.0096,
`verdict=pass`.

The check is applied to the `valley` checkpoint only, because that is the boot zoom (145 %) where the
map fills the canvas. It is deliberately **not** applied to `valley-far-zoom`, because at 50 % zoom the
world is smaller than the viewport and a surround is correct there. That frame's reading moves with the
live renderer — **0.5918 with Pixi, 0.0034 with canvas2D** — but the surround itself does not go away:
measured directly, it is `rgb(17,37,60)` (void blue) under Pixi and `rgb(7,16,11)` (near-black green)
under canvas2D. The reading fell only because that colour left the guard's "void family" test
(`b > g` no longer holds), which is exactly why this frame must not be gated.

## Invariants checked

Presentation only. Simulation, saves and the minimap are untouched; `npm test` (167 files / 905 tests)
and `audit:deps:cycles:strict` are green with and without the fix.

## Save/migration impact

None.

## Verification result

`test:types` exit 0 · `lint` 0 warnings / 0 errors · `build` exit 0 · `npm test` 167 files / 905 tests
passed · `audit:deps:cycles:strict` exit 0 (322 modules, no runtime cycle) · `test:browser --seed 12345`
verdict pass, 0 console errors, 0 page errors, 0 bad responses. Ground readings, by build:
`valley` 0.6069 with the stage attachment removed (**verdict `fail`**, the fail-before proof), 0.0096
with it restored while Pixi was the live renderer, and **0.0053 in the shipping canvas2D build**.
Visually confirmed from the harness screenshots in both the Pixi and canvas2D builds: grassland,
rivers, sand, trees.

## Related commits or files

- `src/game/renderer/pixiTerrain.ts` — `createPixiState()`
- `src/game/renderer/terrain.ts` — `drawGround` dispatch
- `src/game/renderer.ts` — `VOID_WATER` fill and frame order
- `BUG_REPORTS/2026-09-16-terrain-atlas-art-missing-rivers-render-dry.md` — the superseded diagnosis

## Fix

In `createPixiState()`:

```ts
root.addChild(base, transitions, water, flow, accents, snow);
// `app.render()` renders `app.stage`, so the terrain container must be attached to it.
app.stage.addChild(root);
```

`Application` creates `stage` in its constructor (`Application.mjs:25`), so attaching there is safe
before `app.init()` resolves.
