# Renderer and presentation defects — audit remediation (2026-11-11)

- Bug: eight presentation defects from the full-code audit (W-06, W-21–W-26, W-142) that made placement feedback freeze, grass render depleted, render code write simulation fields, and rebuild static work every tick/frame.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1, development target 0.6.5.2
- Reporter: full-code audit (`docs/plans/full-code-audit-2026-11-11.md` §4.5)
- Area: renderer, entity layer, render SoA
- Owner module: `renderer/grid.ts`, `renderer/entityComposite.ts`, `renderer/buildings.ts`, `entityLayer.ts`, `renderSnapshot.ts`, `logisticsOverlayData.ts`, `simBuffers/*`, `simulation/humanMovement.ts`

## Status history
- 2026-11-11 — resolved: each defect fixed at its renderer owner, with a regression proving the observable (marker displacement, real energy, no sim writes, cached revision).

## Observed behavior (per defect)

- **W-06** Build-validity diamonds and the strip hint were baked into the tick-keyed entity layer while the ghost plate drew per frame. `buildEntityLayerKey` had no `buildGhost`/`buildStripPreview` term, so while paused the diamonds stayed at the tile where the layer was baked.
- **W-21** The render SoA shim returned `energy: 0`; `drawGrass` clamps to 0.35, so every worker-path tuft drew depleted regardless of real grass energy.
- **W-22** `patchCatalogKinematicsFromRenderSoA` wrote `size`, `huntTargetId`, `chatTicks` and `chatPhrase` back onto display entities — a second writer of simulation fields, able to drop a hunt target and round size through float32.
- **W-23** The F4 logistics projection rebuilt its road graph, grid key and per-building commute data every tick although its inputs rarely change.
- **W-24** The cached entity layer repainted whenever the hour changed, and every tick whenever one construction site existed.
- **W-25** The terrain chunk cache key omitted atlas/overlay readiness, so a chunk baked before async material resolution kept its procedural fallback forever.
- **W-26** `humanSprites.advanceHumanWalkAnim` (a renderer-named module) mutated the simulation's `animFrame`.
- **W-142** `staticEntityLayerRevision` was rebuilt for every snapshot, including camera-only frames.

## Expected behavior

Presentation may read simulation state, never write it; cached layers must be keyed by everything their painters read and nothing else; expensive projections must be keyed on their real inputs.

## Reproduction steps

1. Enter build mode, move the ghost with the simulation paused: the secondary validity markers did not follow.
2. Run the worker path and look at grass: all tufts looked grazed.
3. Hold a hunt target on a quiet tick: the "Hunting" state could vanish after a render patch.
4. `npx vitest run tests/renderer* tests/entityLayer* tests/logistics*` on the pre-fix tree.

## Evidence

Audit traces (`entityComposite.ts:63-73`, `grid.ts:198`, `entityLayer.ts:52-78`, `entityRenderMeta.ts:179`, `grass.ts:51`, `applyKinematics.ts:20-41`, `logisticsOverlayData.ts:447-454`, `renderSnapshot.ts:186/156-188`, `terrain.ts:531-539`, `humanTick.ts:1700`), plus the new regressions that drive the real painters.

## Root cause

Cached-layer keys were incomplete, the render buffer carried a hardcoded field, and a projection patch was allowed to write authoritative fields.

## Fix / proposed fix

- Ghost verdict cloud and strip hint moved to the per-frame overlay pass (`drawBuildSnapOverlay`, `drawBuildStripPreviewOverlay`); the cached overlay keeps only terrain blockers and viewport plates.
- `RENDER_FIELD.energy` replaces the reserved word and the shim reads it; the packer writes the authoritative energy.
- The kinematics patch no longer writes simulation fields; those arrive only through the tick delta.
- Logistics projection memoised on its exact input vector plus map identity.
- `buildEntityLayerKey` drops `hourOfDay` and keys construction sites on their own `constructionProgress`; the ramped bar is a per-frame overlay.
- Terrain key carries the material-readiness terms it reads.
- `advanceHumanWalkAnim` moved to `simulation/humanMovement.ts` (the walk-integration owner); the tick is the sole writer.
- `staticEntityLayerRevision` cached on world/tick/array identity.

## Save/migration impact

None. Render buffer layout keeps its stride; both realms share the bundle.

## Verification result

- `npx vitest run` over 28 renderer/terrain/logistics/snapshot files: **177 passed**.
- `npx tsc -p tsconfig.app.json --noEmit`: **PASS**.
- `node scripts/check-import-cycles.mjs --strict`: **PASS** (no runtime cycles).
- oxlint on the changed sources: **0 errors**; comment check: **PASS**.
- Full `standard`/year suites: run by the orchestrator after integration (reported in the remediation log).
