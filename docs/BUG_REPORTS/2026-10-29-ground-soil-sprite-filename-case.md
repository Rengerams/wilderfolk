# Ground reinforcement sprite 404s because the file is named `ground_soil.PNG`

- Bug: the preloaded ground-soil art never loads on a case-sensitive filesystem
- Status: resolved
- Date discovered: 2026-10-29
- Version/build: 0.6.5.2 unreleased, base dc09da9
- Reporter: preview console validation
- Area: assets / renderer / build catalogue

## Status history

- 2026-10-21 — introduced: the ground-reinforcement art was registered on disk as `ground_soil.PNG`
  while every code path asks for `/sprites/ground_soil.png` (commit `c1ccfff1`).
- 2026-10-29 — observed again as a console error on a fresh preview load; the file is renamed to
  `ground_soil.png` and every reference, the asset register row and the catalogue test follow the
  lowercase name.

## Observed behavior

1. A fresh load logs `Asset preload failed — continuing with fallbacks Error: Failed to load sprite:
   /sprites/ground_soil.png` from `spriteLoader.ts`.
2. The request answers 404: `public/sprites/` held `ground_soil.PNG`, and the Linux dev server and
   the packaged build are both case-sensitive.
3. The renderer's only use of the sprite (`drawReinforcedSoil`) skips every tile when the image has
   no pixels, so a reinforced soil tile never drew its art; the build catalogue's Ground
   Reinforcement tile kept an uppercase path and did load, so the two paths disagreed.
4. `ASSET_REGISTER.md` carried the uppercase row plus a second, stale `Ground_soil.png` row for the
   same file.

## Expected behavior

One lowercase filename, the same path in the preload list, the catalogue tile, the renderer and the
asset register, and no failed preload on a fresh load.

## Reproduction steps

1. Load the game with a cold cache on Linux (or the sandbox preview).
2. Watch the console during the asset preload phase.
3. Inspect the network log for `/sprites/ground_soil.png` — 404.

## Evidence

`spriteLoader.ts` preloaded `/sprites/ground_soil.png`, `terrain.ts` asked `getSprite` for the same
path and `BuildCatalogPanel.tsx` asked for `/sprites/ground_soil.PNG`; the only file on disk was
`public/sprites/ground_soil.PNG`. After the rename, a fresh preview load reports no preload failure
and the catalogue test in `tests/uxBatch.interactionWindows.test.ts` pins the lowercase path.
