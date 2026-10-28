# Version-4 rivers lose directional highlights and waterfall rapids

- Bug: Version-4 maps omit the v3 directional river glints and drop-localized foam.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: Wilderfolk 0.6.5.2, main at inspection
- Reporter: static code review after consolidation of the terrain architecture
- Area: terrain rendering
- Owner module: `src/game/renderer/whittakerTerrain.ts`
- Related PR/commit: tracked in the dedicated v4 river-surface pull request

## Status history

- 2026-10-28 — investigating: found the inconsistent version gate; applied a renderer-only fix and added v4 regressions on a PR branch. CI and live visual performance acceptance remain pending.

## Observed behavior

`buildRiverSurfaceFields` created empty `riverPhase`, `riverFlowMask` and `riverRapids` for any version other than 3, even though v4 retains river polylines, waterfall positions and active water coverage. New-game `generateWorldMap` defaults to version 4.

## Expected behavior

Generation v3 and v4 should use the same derived flow, highlights and localized rapids, while v1/v2 skip this rendering prepass. Game-water classification, path and building grids, saved river paths and maps remain unchanged.

## Reproduction steps

1. Generate a seeded Rivers map using `generateRawTerrain` and explicit version 4.
2. Inspect `buildWhittakerFields(map).riverFlowMask` near river coverage greater than 0.75.
3. Before the fix every river flow cell was unassigned and all waterfall intensities were zero because the prepass returned early; version 3 computed the fields.

## Evidence

The early exit in `src/game/renderer/whittakerTerrain.ts` checked `generationVersion !== 3`, while the pixel river shader supports `generationVersion >= 3`. This prevents v4 from displaying current-aligned crests and waterfall-localized highlights.

## Root cause

The version-gated render field calculation was not broadened when v4 inherited v3 hydrology.

## Fix / proposed fix

Reject only versions before 3 in the existing river-surface field builder. Extend `tests/terrain.riverMaterials.test.ts` with seeded v4 deterministic flow checks, injected-waterfall localization, visible pixel delta, seam-equality checks, and assertions of unchanged saved water, path/build grids and river paths. Keep the sole implementation in `renderer/whittakerTerrain.ts`; register its render-only decision with `writes: []`.

## Save/migration impact

None. This is a derived map-cache presentation change only; existing generation recipes, noise seeds, terrain versions, serialized fields and simulation worker remain unchanged. V1/v2 skip the prepass as before.

## Verification result

- Static diagnosis: **PASS** — source version-gating mismatch verified.
- Targeted regression: **NOT RUN locally**; requires CI or repository checkout.
- Standard tests / types / build: **NOT RUN locally**.
- Browser visual comparison / Huge-map FPS: **NOT RUN**.
