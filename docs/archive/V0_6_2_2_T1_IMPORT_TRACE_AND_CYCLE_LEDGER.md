# v0.6.2.2 T1/T2 Import Trace and Cycle Ledger

- Generated: 2026-08-21
- Scope: `src/`, using the repository dependency-cruiser configuration and TypeScript project resolution.
- Purpose: evidence for roadmap task 1. This document records measurements only; it does not change `manualChunks` or simulation imports.
- Latest verification: 2026-08-21 after W3; the warning and topology remain reproducible.

## T1 — Renderer/game chunk import trace

> Baseline production build warning: `game-render -> game -> game-render`. The warning is a build-time chunk topology problem; it is not, by itself, proof that a runtime ownership boundary should be changed.

The current `vite.config.ts` policy assigns renderer modules to `game-render` and other `src/game/` modules to `game`. The measured cross-chunk runtime edges are listed below.

| Direction | Edge count | Interpretation |
|---|---:|---|
| game-render → game | 88 | Renderer modules import runtime game modules under the current chunk policy. |
| game → game-render | 1 | Game modules import renderer modules under the current chunk policy. |

### game-render → game edges

- `src/game/renderer.ts` → `src/game/entityLayer.ts`
- `src/game/renderer.ts` → `src/game/humanChat.ts`
- `src/game/renderer.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/entityCache.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/entityCache.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/entityCache.ts` → `src/game/simBuffers/renderSoAEntities.ts`
- `src/game/renderer/entityCache.ts` → `src/game/simFocus.ts`
- `src/game/renderer/entityCache.ts` → `src/game/spatialGrid.ts`
- `src/game/renderer/entityComposite.ts` → `src/game/canvasLayer.ts`
- `src/game/renderer/entityComposite.ts` → `src/game/entityLayer.ts`
- `src/game/renderer/entityComposite.ts` → `src/game/entitySprites.ts`
- `src/game/renderer/entityComposite.ts` → `src/game/humanSprites.ts`
- `src/game/renderer/entityComposite.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/animals.ts` → `src/game/entitySprites.ts`
- `src/game/renderer/animals.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/animals.ts` → `src/game/moonHowler.ts`
- `src/game/renderer/animals.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/animals.ts` → `src/game/speciesConfig.ts`
- `src/game/renderer/animals.ts` → `src/game/spriteLoader.ts`
- `src/game/renderer/animals.ts` → `src/game/terrainAtlas.ts`
- `src/game/renderer/humans.ts` → `src/game/combat.ts`
- `src/game/renderer/humans.ts` → `src/game/dayCycle.ts`
- `src/game/renderer/humans.ts` → `src/game/education.ts`
- `src/game/renderer/humans.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/humans.ts` → `src/game/humanChat.ts`
- `src/game/renderer/humans.ts` → `src/game/humanSprites.ts`
- `src/game/renderer/humans.ts` → `src/game/huntvisuals.ts`
- `src/game/renderer/humans.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/humans.ts` → `src/game/simBuffers/renderSoAEntities.ts`
- `src/game/renderer/humans.ts` → `src/game/terrainAtlas.ts`
- `src/game/renderer/shared.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/shared.ts` → `src/game/spriteLoader.ts`
- `src/game/renderer/spriteDrawing.ts` → `src/game/buildingRotation.ts`
- `src/game/renderer/spriteDrawing.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/spriteDrawing.ts` → `src/game/humanSprites.ts`
- `src/game/renderer/spriteDrawing.ts` → `src/game/spriteLoader.ts`
- `src/game/renderer/buildings.ts` → `src/game/beautyGrid.ts`
- `src/game/renderer/buildings.ts` → `src/game/buildCatalog.ts`
- `src/game/renderer/buildings.ts` → `src/game/buildingRotation.ts`
- `src/game/renderer/buildings.ts` → `src/game/dayCycle.ts`
- `src/game/renderer/buildings.ts` → `src/game/decorRender.ts`
- `src/game/renderer/buildings.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/buildings.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/buildings.ts` → `src/game/spriteLoader.ts`
- `src/game/renderer/buildings.ts` → `src/game/stripBuild.ts`
- `src/game/renderer/buildings.ts` → `src/game/stripJunction.ts`
- `src/game/renderer/buildings.ts` → `src/game/stripRender.ts`
- `src/game/renderer/buildings.ts` → `src/game/terrainAtlas.ts`
- `src/game/renderer/grass.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/grass.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/grass.ts` → `src/game/spriteLoader.ts`
- `src/game/renderer/grid.ts` → `src/game/buildingRotation.ts`
- `src/game/renderer/grid.ts` → `src/game/buildings.ts`
- `src/game/renderer/grid.ts` → `src/game/dayCycle.ts`
- `src/game/renderer/grid.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/grid.ts` → `src/game/placementUtils.ts`
- `src/game/renderer/grid.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/grid.ts` → `src/game/stripBuild.ts`
- `src/game/renderer/grid.ts` → `src/game/stripRender.ts`
- `src/game/renderer/grid.ts` → `src/game/viewState.ts`
- `src/game/renderer/markers.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/markers.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/particles.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/scent.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/trees.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/trees.ts` → `src/game/spriteLoader.ts`
- `src/game/renderer/overlay.ts` → `src/game/dayCycle.ts`
- `src/game/renderer/overlay.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/overlay.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/overlay.ts` → `src/game/renffrStar.ts`
- `src/game/renderer/buildPreview.ts` → `src/game/buildCatalog.ts`
- `src/game/renderer/buildPreview.ts` → `src/game/buildingRotation.ts`
- `src/game/renderer/buildPreview.ts` → `src/game/buildings.ts`
- `src/game/renderer/buildPreview.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/buildPreview.ts` → `src/game/spriteLoader.ts`
- `src/game/renderer/buildPreview.ts` → `src/game/stripBuild.ts`
- `src/game/renderer/nightEffects.ts` → `src/game/buildings.ts`
- `src/game/renderer/nightEffects.ts` → `src/game/dayCycle.ts`
- `src/game/renderer/nightEffects.ts` → `src/game/juiceEffects.ts`
- `src/game/renderer/nightEffects.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/weather.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/weather.ts` → `src/game/placementUtils.ts`
- `src/game/renderer/weather.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/terrain.ts` → `src/game/gameTypes.ts`
- `src/game/renderer/terrain.ts` → `src/game/renderSnapshot.ts`
- `src/game/renderer/terrain.ts` → `src/game/simHelpers.ts`
- `src/game/renderer/terrain.ts` → `src/game/terrainLayer.ts`
- `src/game/renderer/terrain.ts` → `src/game/viewState.ts`

### game → game-render edges

- `src/game/rendererLoader.ts` → `src/game/renderer.ts`

### T1 decision

The production build warning is reproduced. The import trace is the required first evidence set. No chunk-policy or simulation-import change is made in this task. A boundary change should be a follow-up only after the listed runtime edges are reviewed against the renderer snapshot contract and startup/render measurements.

## T2 — Dependency-cycle ledger

The current resolved graph contains **3 strongly connected component cycle(s)**. The prior audit recorded 43 warnings, but the current `audit:deps:cycles` command reports no violations because its focused invocation resolves zero modules; the discrepancy is preserved here rather than silently treated as a reduction.

| ID | Classification | Modules |
|---|---|---|
| C01 | runtime and high-risk (simulation hub/owner) | `src/game/adjacencyIndex.ts` ↔ `src/game/beautyGrid.ts` ↔ `src/game/challenges.ts` ↔ `src/game/dayCycle.ts` ↔ `src/game/defenseStructures.ts` ↔ `src/game/ecologyStage.ts` ↔ `src/game/ecosystemPressure.ts` ↔ `src/game/entityIndex.ts` ↔ `src/game/eventLog.ts` ↔ `src/game/forge.ts` ↔ `src/game/gameTypes.ts` ↔ `src/game/grassEcology.ts` ↔ `src/game/humanChat.ts` ↔ `src/game/juiceEffects.ts` ↔ `src/game/moonHowler.ts` ↔ `src/game/playerHuman.ts` ↔ `src/game/scentGrid.ts` ↔ `src/game/simEffects.ts` ↔ `src/game/simFocus.ts` ↔ `src/game/skills.ts` ↔ `src/game/spatialGrid.ts` ↔ `src/game/stats.ts` ↔ `src/game/workforce.ts` |
| C02 | runtime but requires owner review | `src/game/economy.ts` ↔ `src/game/townHall.ts` ↔ `src/game/tradeCaravans.ts` |
| C03 | runtime and high-risk (simulation hub/owner) | `src/game/gameEngine.ts` ↔ `src/game/gameTick.ts` ↔ `src/game/tickLayerDaily.ts` ↔ `src/game/tickLayerSystems.ts` ↔ `src/game/worldEvents.ts` |

## Latest build-size verification — 2026-08-21

The warning remains reproducible after W3. The current minified asset sizes are:

| Asset | Size | Interpretation |
|---|---:|---|
| `game-SyaRGFix.js` | 713.75 kB | Main `src/game/` manual chunk; exceeds the 500 kB warning threshold. |
| `gameWorker-Dh-tekxD.js` | 399.28 kB | Worker bundle; below the warning threshold. |
| `index-B8sGW6AL.js` | 199.29 kB | Application entry bundle. |
| `react-5xsV282p.js` | 188.62 kB | React runtime chunk. |
| `game-ui-PKse698m.js` | 78.23 kB | Configured UI chunk. |
| `game-render-DdJd2TgE.js` | 56.20 kB | Configured renderer chunk. |

The immediately preceding W2 build recorded `game` at approximately 713.01 kB; the W3 build is approximately 0.74 kB larger. The circular warning is identical, and the W3 change added only fatigue policy, fields, tests, and UI text; it did not alter `vite.config.ts`, `rendererLoader.ts`, or the renderer import boundary. The evidence therefore supports the conclusion that both warnings predate and are independent of W3. The large `game` chunk is a consequence of the broad `src/game/` manualChunks rule, not a new W3 regression.

A safe fix remains a future T1 slice: first extract renderer reads toward a leaf render-contract module, then re-measure worker-ready latency, first render, normal frame behavior, and startup parity. Raising `chunkSizeWarningLimit` or manually suppressing the circular warning is explicitly not considered a fix.

## Evidence and follow-up

The source snapshot is `docs/_roadmap_t1_dependency_snapshot.json`; the baseline build output is `docs/_roadmap_t1_build_baseline.txt`; and the focused cycle command output is `docs/_roadmap_t1_cycles_baseline.txt`. These are local working evidence and should remain uncommitted unless the developer requests otherwise.

The next engineering decision is to inspect the T1 cross-chunk edges and measure worker-ready latency, first render, and normal frame behavior before proposing any import-boundary change. The cycle ledger should be reconciled with the historical 43-warning audit before any cycle is broken.


## Empty `__commonjsHelpers__` chunk correction — 2026-08-21

The build reproduced `Generated an empty chunk: "__commonjsHelpers__"` while `vite-plugin-chunk-split` was active. Its `renderChunk` hook strips imports from that generated helper chunk, leaving an empty output asset; the repository cleanup hook could remove the asset only after Rollup had already emitted the warning.

The safe correction was to remove that plugin and express the existing React, router, game-data, game-render, and game grouping through a direct Rollup `manualChunks` function in `vite.config.ts`. This preserves the intended chunk boundaries without post-build asset mutation. The final build produces no `__commonjsHelpers__` asset and no empty-chunk warning.

The truthful 500 kB warning threshold is restored. The remaining warnings are explicit and actionable: the known `game-render → game → game-render` circular chunk and the approximately 578.64 kB `game` chunk. TypeScript, production build, focused R2/frontier tests, ESLint, and `git diff --check` passed after the correction. No simulation owner, cadence, worker protocol, save field, or runtime game behavior changed.
