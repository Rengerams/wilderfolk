# v0.6.2.2 T1/T2 Import Trace and Cycle Ledger

- Generated: 2026-08-21
- Scope: `src/`, using the repository dependency-cruiser configuration and TypeScript project resolution.
- Purpose: evidence for roadmap tasks T1/T2. This document records measurements and the single approved cycle reduction; it does not change `manualChunks` or simulation cadence.

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

The current resolved graph contains **1 strongly connected component cycle** with **21 modules**. The prior audit recorded 43 warnings, but the current `audit:deps:cycles` command reports no violations because its focused invocation resolves zero modules; the discrepancy is preserved here rather than silently treated as a reduction.

### Completed reductions

The original C03 runtime reduction remains in place: `src/game/worldEvents.ts` no longer imports runtime helpers through the `gameEngine.ts` compatibility barrel. It now imports `simEffects.ts` and `simHelpers.ts` directly, preserving the existing world-event owner and cadence.

Five additional safe import-boundary reductions were completed:

| Cut | Boundary change | Safety rationale |
|---|---|---|
| 1 | Removed the `economy.ts` re-export of `establishTradeRoute` and `hasCompletedMarket`; `gameEngine.ts` exports them directly from canonical `tradeCaravans.ts`. | Removes the economy → tradeCaravans edge without changing the public gameEngine API or trade owner. |
| 2 | Moved the `ValleyStage` type to leaf module `ecologyTypes.ts`; `gameTypes.ts` now imports the type from that leaf, while `ecologyStage.ts` re-exports it for compatibility. | Removes gameTypes → ecologyStage runtime-graph participation without changing the type or ecology owner. |
| 3 | Removed the `INITIAL_CHALLENGES` re-export from `gameTypes.ts`; `saveLoad.ts` and `worldGen.ts` import the catalog directly from `challenges.ts`. | Removes a compatibility re-export edge while preserving challenge initialization and migration behavior. |
| 4 | Moved the pure tick/hour/weekday helpers to `dayCycleClock.ts`; `workSchedule.ts` now imports clock queries from the leaf. | Removes workSchedule → dayCycle coupling while preserving the 72-tick day and weekday semantics. |
| 5 | Routed `humanChat.ts` rate constants through `dayCycleClock.ts`. | Removes humanChat → dayCycle coupling without changing dialogue duration or cadence. |

The complete graph decreased from **two SCCs / 24-module primary SCC plus the 3-module economy SCC** to **one 21-module SCC**. The five changes are structural import-boundary cuts; no gameplay cadence, worker/save state, or public compatibility owner was changed.

| ID | Classification | Modules |
|---|---|---|
| C01 | runtime and high-risk (simulation hub/owner) | `src/game/adjacencyIndex.ts` ↔ `src/game/beautyGrid.ts` ↔ `src/game/challenges.ts` ↔ `src/game/dayCycle.ts` ↔ `src/game/defenseStructures.ts` ↔ `src/game/ecologyStage.ts` ↔ `src/game/ecosystemPressure.ts` ↔ `src/game/entityIndex.ts` ↔ `src/game/eventLog.ts` ↔ `src/game/forge.ts` ↔ `src/game/gameTypes.ts` ↔ `src/game/grassEcology.ts` ↔ `src/game/humanChat.ts` ↔ `src/game/juiceEffects.ts` ↔ `src/game/moonHowler.ts` ↔ `src/game/playerHuman.ts` ↔ `src/game/scentGrid.ts` ↔ `src/game/simEffects.ts` ↔ `src/game/simFocus.ts` ↔ `src/game/skills.ts` ↔ `src/game/spatialGrid.ts` ↔ `src/game/stats.ts` ↔ `src/game/workforce.ts` |
| C02 | runtime but requires owner review | `src/game/economy.ts` ↔ `src/game/townHall.ts` ↔ `src/game/tradeCaravans.ts` |

## Evidence and follow-up

The source snapshot is `docs/_roadmap_t1_dependency_snapshot.json`; the baseline build output is `docs/_roadmap_t1_build_baseline.txt`; and the focused cycle command output is `docs/_roadmap_t1_cycles_baseline.txt`. These are local working evidence and should remain uncommitted unless the developer requests otherwise.

The next engineering decision is to reconcile the historical 43-warning count with the current dependency-cruiser invocation and then select only one additional high-risk cycle reduction at a time. T1 remains unresolved because its renderer chunk edge is a separate build-topology issue. The five reductions above should remain under regression observation before further owner-boundary changes.
