# Founding settlers visually disappear at overview zoom

- Bug: the overview renderer shrinks every unselected settler to a tiny skin-coloured dot, even when the colony has only two inhabitants.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: repository main 0.6.5.1 source inspected; exact screenshot build not identified
- Reporter: player screenshot and report that settlers were no longer visible
- Area: human sprite presentation
- Owner module: `src/game/humanSprites.ts` (detail policy), `src/game/renderer/humans.ts` (drawing)
- Related PR/commit: candidate patch on `fix/terrain-clearing-settler-visibility-20261029`

## Status history
- 2026-10-29 — investigating: low-zoom sprite suppression confirmed in source; improved overview policy committed, runtime confirmation outstanding.

## Observed behavior
The screenshot clearly shows wildlife but no identifiable human bodies. At camera zoom below 1.15×, `drawHumans` unconditionally used skin-coloured markers only ~2–4 pixels across. This is a plausible cause, not proof that the save lost entities.

## Expected behavior
A founding camp should show human characters even at overview zoom. Large settlements should still use efficient, readable markers, and selected humans should remain full sprites.

## Reproduction steps
1. Start with two living founders and use a 0.5×/0.75× overview zoom.
2. Observe `humanRenderDetail` previously returned marker mode regardless of population and `drawHumans` used the same unconditional threshold.
3. Compare with the small-colony policy: 12 or fewer visible humans render as sprites, while a crowd above that limit still gets high-contrast markers.

## Evidence
`humanSprites.HUMAN_SPRITE_MIN_ZOOM = 1.15`; before the patch, `renderer/humans.drawHumans` drew a tiny marker at every lower zoom. Render SoA prioritizes player settlers over wildlife, so the screenshot does not by itself imply serialization loss.

## Root cause
Overview level of detail applied crowd-only optimization to tiny new colonies; original markers also had insufficient contrast against textured terrain.

## Fix / proposed fix
The existing `humanRenderDetail` owner now selects full sprites for a small on-screen group and preserves compact rendering for larger crowds. Remaining markers have a slightly larger radius and light outer halo. `tests/humanSprites.test.ts` covers both thresholds and selection.

## Save/migration impact
None. Presentation-only; world population and entity positions are untouched.

## Verification result
- Source-level code trace: confirmed.
- Targeted Vitest regression: NOT RUN in this tool session (GitHub-only source access).
- TypeScript, lint, build, and gameplay inspection: NOT RUN.
- Status remains investigating pending runtime verification.
