# Bug: Four mountain sprite paths are preloaded but the art does not exist, so every session logs a load error

- Status: resolved (the game no longer requests the unshipped art; shipping the directional mountain art itself remains a presentation follow-up)
- Date discovered: 2026-09-10
- Version/build: Wilderfolk 0.6.4 (working tree)
- Reporter: Coding assistant — found by the new browser smoke harness (`scripts/browser-smoke.mjs`), which the Node-only test tier cannot see
- Area: Playback | UI (presentation) | asset pipeline
- Owner module: `src/game/spriteLoader.ts` (`MOUNTAIN_SPRITE_PATHS`), `src/game/terrainLayer.ts` (stamp site)
- Cadence: Asset preload on game boot — no simulation cadence involved

## Status history

- 2026-09-10 — open: the first browser run reported one console error and it reproduces on every boot.
- 2026-09-13 — mitigated: `preloadAllSprites` no longer requests `MOUNTAIN_SPRITE_PATHS`. Stamp sites still no-op via `getSprite` when the image is absent. Open until `public/sprites/mountains/` ships or stamp sites are removed.
- 2026-09-13 — resolved: the remaining reference cannot request the art either, so the boot error this report was opened for is gone. `stampPropSprite` resolves the path through the cache-only `getSprite` and returns early when it is absent (`terrainLayer.ts:1006-1007`), `getSprite` never triggers a load (`spriteLoader.ts:103-105`), and the four paths are no longer preloaded (`spriteLoader.ts:157-158`). `npm run test:accept` (production build + `scripts/browser-smoke.mjs`) reports `consoleErrors: 0`, `pageErrors: 0`, `failedRequests: 0` and exits 0. Shipping the four PNGs is an art task, not a defect.

## Observed behavior

Booting the game in a real browser logs, once per session:

```text
Asset preload failed — continuing with fallbacks Error: Failed to load sprite: /sprites/mountains/45.png
    at r.onerror (.../assets/game-ui-*.js)
```

`public/sprites/mountains/` does not exist at all, yet four paths are preloaded on boot:

- `src/game/spriteLoader.ts:19-24` — `MOUNTAIN_SPRITE_PATHS` lists `/sprites/mountains/45.png`, `135.png`, `225.png`, `315.png`.
- `src/game/terrainLayer.ts:1151` — stamps `/sprites/mountains/${rot}.png` for mountain props.

The preload failure is caught and the game continues with fallbacks, so the player sees painted terrain instead of directional mountain art. The visible consequence is limited; the reliable consequence is a console error (and a wasted request) on every launch, which now also fails the browser smoke gate.

## Expected behavior

Either the four directional mountain sprites exist and load, or the game does not ask for art it does not ship. A boot with no missing assets should produce no console error.

## Reproduction steps

1. `npm run build`, then serve `dist/` (or run the dev server).
2. Open the game in a browser with DevTools open.
3. Observe the console error for `/sprites/mountains/45.png` on boot.
4. Or run the automated equivalent: `node scripts/browser-smoke.mjs` — its report lists the error and the run fails on it.

## Evidence

- `tmp/shots/report.json` (`consoleErrors`) from `node scripts/browser-smoke.mjs`, run 2026-09-10 against the production build.
- `Get-ChildItem public/sprites` — no `mountains` directory.
- Reproduced on every one of five harness runs (seeded and unseeded), i.e. it is deterministic, not a race.

## Root cause

Not yet investigated in depth. The likely shape is a sprite set that was planned or removed: the paths are referenced in two places (preload list and stamp site) while the art was never added to `public/`. Since `terrainLayer` guards its stamp with a fallback, only the preload list turns the absence into a visible error.

## Fix

Not implemented — deliberately left to the developer, because the two possible fixes are a design decision:

1. **Art exists elsewhere** → add the four PNGs to `public/sprites/mountains/`.
2. **Art is abandoned** → remove the four preload entries and the stamp site (or gate the stamp on a capability check first), which removes the console error and the dead request.

Removing the preload list alone would silence the error but leave `terrainLayer` asking for missing art per mountain prop; the two sites should be decided together.

**Implemented (2026-09-13) — option 2:** the game no longer asks for art it does not ship. `MOUNTAIN_SPRITE_PATHS` is no longer preloaded (`spriteLoader.ts:157-158`), and the one remaining reference (`terrainLayer.ts:1151`, the ridge-peak stamp) goes through `stampPropSprite`, which looks the path up in the sprite cache and returns early on a miss (`terrainLayer.ts:1006-1007`) — so there is no request and no console error, and the painted-terrain fallback is what the player sees. When the four directional PNGs exist, add them to `public/sprites/mountains/` and back to the preload list; `mountainSpritesReady()` (`terrainLayer.ts:351-352`) already gates the decor rebuild on them, so the art starts being used without further code changes.

## Regression test

`scripts/browser-smoke.mjs` is the regression protection: it fails on any console error, so this defect cannot return unnoticed once the console is clean.

## Invariants checked

- Presentation-only: no simulation state, cadence, owner, or save field is touched by either candidate fix.
- The fallback path currently keeps the game playable, so this is not a truth defect.

## Save/migration impact

None. Sprites are not part of the save or the worker delta.

## Verification result

Resolved 2026-09-13. `npm run test:accept` (production build of the current tree, then `scripts/browser-smoke.mjs`) passes with **`consoleErrors: 0`, `knownConsoleErrors: 0`, `pageErrors: 0`, `failedRequests: 0`, `failures: []`** and exit code 0 — the boot error that was reproduced on every one of the original five harness runs is gone. Static evidence for the same conclusion: the preload list no longer contains the four paths (`spriteLoader.ts:157-158`), `getSprite` is a cache lookup that never loads (`spriteLoader.ts:103-105`), and the only remaining reference is the guarded no-op stamp (`terrainLayer.ts:1006-1007`, called from `:1151`).

Not verified: that the *painted* mountain art looks right once the real PNGs ship — that is the art task left open above, not this defect.

## Related files

- `src/game/spriteLoader.ts`
- `src/game/terrainLayer.ts`
- `public/sprites/` (missing `mountains/`)
- `scripts/browser-smoke.mjs` (the check that finds it)
