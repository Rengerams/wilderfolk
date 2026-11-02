# Reinforced soil sprite path differs in case from tracked asset

- Bug: the loader and renderer asked for `ground_soil.png` while Git tracks `ground_soil.PNG`.
- Status: updated to use the lowercase asset name merged from main; latest CI and browser verification pending
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: development 0.6.5.2, PR #118
- Reporter: PR #118 Node.js CI sprite manifest test
- Area: reinforced-soil rendering and sprite preload
- Owner module: `src/game/spriteLoader.ts` (preload path), `src/game/renderer/terrain.ts` (consumer)
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/118

## Status history
- 2026-11-02 — open: Linux CI asserted one missing preloaded sprite.
- 2026-11-02 — investigating: initially changed both call sites to the then-tracked uppercase name.
- 2026-11-02 — merge resolution: main renamed the tracked asset to `ground_soil.png`; preload, terrain renderer and build catalog now all use that lowercase spelling.

## Observed behavior
At discovery, the sprite manifest requested `/sprites/ground_soil.png`, but the case-sensitive checkout contained `public/sprites/ground_soil.PNG`. The build catalog then used the uppercase suffix.

## Expected behavior
The manifest and renderer must request the exact filename stored in the repository, and the sprite manifest test must report no missing resources.

## Reproduction steps
1. Check PR #118 at the failing Node.js CI run 41366629196.
2. Run the existing sprite manifest test on a case-sensitive checkout.
3. Observe `/sprites/ground_soil.png` in the missing paths assertion.

## Evidence
The CI job log reports the missing filename in `tests/renderBatch.sprites.test.ts`. At discovery, GitHub's contents listing had `ground_soil.PNG`, not `ground_soil.png`, and `BuildCatalogPanel.tsx` used the uppercase suffix.

## Root cause
The source import URL did not match the case-sensitive Git filename.

## Fix / proposed fix
After main normalized the tracked asset to `public/sprites/ground_soil.png`, use `/sprites/ground_soil.png` consistently in `spriteLoader.ts`, `renderer/terrain.ts` and `BuildCatalogPanel.tsx`. Keep the existing manifest assertion intact.

## Save/migration impact
None.

## Verification result
- Source check: tracked lowercase asset and all three call sites aligned in the merge tree.
- Focused sprite test: NOT RUN locally; pending GitHub CI.
- Browser appearance: NOT RUN.
