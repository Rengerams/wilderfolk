# Cleared camp terrain keeps snowy or rocky ground art

- Bug: saved grassland camp overrides can remain visually alpine because the ground shader reads unchanged height and temperature fields.
- Status: investigating
- Severity: high
- Date discovered: 2026-10-29
- Version/build: repository main 0.6.5.1 source inspected; exact screenshot build not identified
- Reporter: player screenshot of Black Forest starting area
- Area: terrain presentation
- Owner module: `src/game/renderer/whittakerTerrain.ts`
- Related PR/commit: candidate patch on `fix/terrain-clearing-settler-visibility-20261029`

## Status history
- 2026-10-29 — investigating: code-level mismatch confirmed; presentation fix committed, browser verification outstanding.

## Observed behavior
The supplied Black Forest screenshot shows a broad grey-white rocky/snowy centre around the camp. The generator stores Grassland tile overrides for the starting clearing, while `bakeWhittakerGround` paints with original elevation, temperature and material weights. The screenshot alone does not establish how much of the surrounding rock is intended relief.

## Expected behavior
Grassland tiles that the generator deliberately clears should have visibly grassy ground, fading smoothly to the surrounding untouched biome. Original water, elevation, mesh projection, walkability, placement rules and old-save generation recipes must not change.

## Reproduction steps
1. Create a generation-v4 map whose original camp ground is high and cold.
2. Apply the existing `setTileOverride` path to paint a Grassland clearing, without changing the continuous height fields.
3. Compare the original per-pixel terrain bake with the overridden area. Before the patch, the grassland override does not participate in the material decision.

## Evidence
`terrainGen.ensureCampClearing` and `clearStartAreaForest` store Grassland tile overrides. Before this change, `renderer/whittakerTerrain.bakeWhittakerGround` computed its snow and stone materials from `map.elevation` and `map.temperature` only.

## Root cause
The saved L0 overrides and continuous L2 terrain fields have separate responsibilities; rendering ignored the authoritative grassland edit during material selection.

## Fix / proposed fix
`buildWhittakerFields` now builds a derived sparse-to-grid grassland clearing mask. The chunk shader samples it in world coordinates to blend alpine material toward grassy, warmer local colour, leaving actual hydrology and height mesh unchanged. `tests/terrain.clearingVisuals.test.ts` exercises a cold mountain and adjacent-chunk sampling.

## Save/migration impact
None. The mask is a disposable presentation cache from existing overrides; no new saved field, generation version or physics change.

## Verification result
- Source-level code trace: confirmed.
- Targeted Vitest regression: NOT RUN in this tool session (GitHub-only source access).
- TypeScript, lint, build, and real browser seed/zoom visual acceptance: NOT RUN.
- Status remains investigating until tests and visual QA confirm the behaviour.
