# Reinforced soil image has inconsistent path casing

- Bug: The game preloads and reads `/sprites/ground_soil.png`, but the checked-in asset is `public/sprites/ground_soil.PNG`.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: PR #119 Node.js CI run 41324964638
- Reporter: GitHub Actions CI
- Area: Sprite loading / reinforced ground rendering
- Owner modules: `src/game/spriteLoader.ts`, `src/game/renderer/terrain.ts`
- Related PR/commit: PR #119

## Status history
- 2026-11-02 — investigating: Updated both consumers to the actual on-disk casing; CI revalidation pending.

## Observed behavior
`tests/renderBatch.sprites.test.ts:83` reports missing `/sprites/ground_soil.png`; case-sensitive hosts cannot load reinforced-soil art.

## Expected behavior
Every preload URL resolves to a real file and any renderer using the image requests the same canonical path.

## Reproduction steps
1. On a case-sensitive checkout, inspect `public/sprites/ground_soil.PNG`.
2. Compare the preload entry and `drawReinforcedSoil` call to its actual filename.
3. Run the sprite wiring test; it fails on `/sprites/ground_soil.png`.

## Evidence
GitHub Contents API lists `ground_soil.PNG`; `BuildCatalogPanel.tsx` already uses the correct casing while the preload and ground renderer used lowercase.

## Root cause
A filename case mismatch hidden on case-insensitive development systems.

## Fix / proposed fix
Change both source references to `/sprites/ground_soil.PNG`; retain the real asset and the strict existence test.

## Save/migration impact
None.

## Verification result
- CI run 41324964638: FAIL before correction.
- Revised CI: pending; local repository test commands NOT RUN.
