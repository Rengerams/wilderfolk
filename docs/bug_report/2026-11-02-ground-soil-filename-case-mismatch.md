# Reinforced soil sprite path differs in case from tracked asset

- Bug: the loader and renderer asked for `ground_soil.png` while Git tracks `ground_soil.PNG`.
- Status: investigating — code correction committed; latest CI and browser verification pending
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: development 0.6.5.2, PR #118
- Reporter: PR #118 Node.js CI sprite manifest test
- Area: reinforced-soil rendering and sprite preload
- Owner module: `src/game/spriteLoader.ts` (preload path), `src/game/renderer/terrain.ts` (consumer)
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/118

## Status history
- 2026-11-02 — open: Linux CI asserted one missing preloaded sprite.
- 2026-11-02 — investigating: changed both code paths to the actual checked-in filename; fresh CI pending.

## Observed behavior
The sprite manifest requests `/sprites/ground_soil.png`. On the case-sensitive CI filesystem this path does not exist. The actual committed asset is `public/sprites/ground_soil.PNG`, which the build catalog already references.

## Expected behavior
The manifest and renderer must request the exact filename stored in the repository, and the sprite manifest test must report no missing resources.

## Reproduction steps
1. Check PR #118 at the failing Node.js CI run 41366629196.
2. Run the existing sprite manifest test on a case-sensitive checkout.
3. Observe `/sprites/ground_soil.png` in the missing paths assertion.

## Evidence
The CI job log reports the missing filename in `tests/renderBatch.sprites.test.ts`. GitHub's contents listing has `ground_soil.PNG`, not `ground_soil.png`. `BuildCatalogPanel.tsx` already uses the uppercase suffix.

## Root cause
The source import URL did not match the case-sensitive Git filename.

## Fix / proposed fix
Use the existing tracked `ground_soil.PNG` name consistently in `spriteLoader.ts` and `renderer/terrain.ts`. Keep the existing manifest assertion intact.

## Save/migration impact
None.

## Verification result
- Source check: filename and both call sites inspected; correction committed.
- Focused sprite test: NOT RUN locally; pending GitHub CI.
- Browser appearance: NOT RUN.
