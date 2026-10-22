# Bug: Child sprites render with an opaque pale rectangle

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer-provided gameplay screenshot
- Area: Play | UI
- Owner module: Child sprite asset preparation and human renderer
- Cadence: Render only

## Status history

- 2026-08-28 — investigating: screenshot showed a juvenile human sprite rendered on a pale opaque rectangle, unlike the surrounding transparent world sprites.
- 2026-09-09 — still investigating: re-verified against earlier HEAD — juveniles draw from `new_child_set/new/*.png` via raw `drawImage` with no alpha keying; pale background was baked into the shipped art.
- 2026-09-10 — still investigating (partial fix): developer commits `13b2d75`/"sprites" + `c33ba1b`/grgr (HEAD) replaced the art. Re-measured current PNGs (deterministic pixel scan): `child_girl_doctorsdaughter.png` now has real alpha (40.5% transparent, 0.2% near-white) — **fixed**; `child_boy_bakersboy.png` (52.3% near-white opaque), `child_boy_merchantson.png` (59.5%), and `child_girl_poorservant.png` (40.4%) remain **100% opaque with the pale rectangle baked in**. Renderer still draws via raw `drawImage` with no alpha strip, so the three still-bad sprites will keep rendering with the pale background. Loader path unchanged: `/sprites/new_child_set/new/child_*.png`.
- 2026-09-13 — resolved: the baked matte was removed offline from those three PNGs
  (border flood-fill, art-side as prescribed); all four children now measure real
  transparency with < 0.25 % near-white-opaque coverage. The requested
  asset-contract test is not written yet (no PNG decoder in the test tier).

## Observed behavior

The child character art includes or receives an opaque rectangular background, which obscures terrain and makes the character read as a pasted image rather than a world entity.

## Expected behavior

Child art must use an alpha-aware asset or render treatment. Only the child sprite pixels should draw; terrain, shadows, and other world entities must remain visible around the sprite.

## Reproduction steps

1. Load a world containing a juvenile human using the child sprite art.
2. Zoom close enough to inspect the sprite.
3. Observe the pale rectangular backdrop around the figure.

## Evidence

Developer-provided gameplay screenshot on 2026-08-28.

## Root cause

Two facts combine, and both are confirmed:

1. **The art has no alpha channel for three of the four children.** `child_boy_bakersboy.png`,
   `child_boy_merchantson.png`, and `child_girl_poorservant.png` are 100% opaque RGB with the
   pale matte baked into the pixels (deterministic pixel scan: 52.3%, 59.5%, and 40.4%
   near-white opaque area). `child_girl_doctorsdaughter.png` was re-exported with real alpha
   (40.5% transparent, 0.2% near-white) and renders correctly, which isolates the cause to
   the assets rather than the renderer.
2. **Nothing removes a matte at runtime, by design.** The child path draws
   `new_child_set/new/child_*.png` through a plain `drawImage`; there is no colour-key,
   chroma-key, or mask step for child art. So a baked background necessarily renders as a
   pale rectangle.

Image-generation models output RGB and have no alpha channel, which is how the matte got
baked in during the last art pass. The renderer is not the defect: adding runtime keying would
be a presentation hack that changes what "the art" means for every future asset.

## Fix

Asset-side, one file at a time, keeping the loader path and the raw `drawImage` render path:

1. Re-export/re-cut the three affected PNGs **with a real alpha channel** — either generate on a
   flat solid matte (magenta `#FF00FF` or a colour absent from the costume) and key that exact
   colour to transparent offline, or flood-fill transparency inward from the border.
2. Verify each file with the deterministic pixel scan (transparent fraction > 0 outside the
   silhouette, near-white opaque fraction < 1%) before wiring anything.
3. Leave `humanSprites.ts` / `spriteLoader.ts` paths unchanged; the loader already points at
   `/sprites/new_child_set/new/child_*.png`.

Do **not** add runtime alpha keying to the renderer. If art must be recovered from an RGB
export in future, the recovery belongs in the offline asset step, not in the draw loop.

## Regression test

Add a local asset-contract check that scans every `public/sprites/new_child_set/new/child_*.png`
and asserts (a) the image has an alpha channel, (b) at least some pixels are fully transparent,
and (c) near-white-opaque coverage stays under 1% of the image. That converts this defect class
into a failing check the next time art is regenerated. Manual confirmation over varied terrain
(grass, forest, water, snow) at normal play zoom still applies.

## Invariants checked

Not applicable — render-only correction. Confirmed during investigation that the child render
path draws position/size from authoritative entity state and cannot feed anything back into
age, movement, selection, collision, or simulation state.

## Save/migration impact

None — asset bytes only. No entity field, save schema, or worker delta is involved.

## Verification result

Fixed 2026-09-13, asset-side as prescribed (no runtime keying was added). The pale
matte was flood-filled to transparency inward from the border on the three files,
matching the matte against the art's own near-white/low-saturation tone
(`r,g,b ≥ 232`, channel spread ≤ 22) so enclosed light details stay opaque.

Deterministic pixel scan (every 3rd pixel, current files):

| file | transparent | near-white opaque (was) |
|---|---|---|
| `child_boy_bakersboy.png` | 52.2 % (was 0 %) | 0.14 % (was ~52 %) |
| `child_boy_merchantson.png` | 59.4 % (was 0 %) | 0.11 % (was ~60 %) |
| `child_girl_poorservant.png` | 40.5 % (was 0 %) | 0.20 % (was ~40 %) |
| `child_girl_doctorsdaughter.png` (control) | 37.0 % | 0.00 % |

The cleared fraction matches the previously measured matte fraction to within one
point on each file, and the surviving near-white pixels (0.11–0.20 %) are the
enclosed highlights, i.e. the fill removed the background and kept the figure.

**Not done:** the asset-contract test this report asks for. The Node test tier has
no PNG decoder (no image dependency is declared), so a check on pixel content
cannot be written without first extracting the decoder that already lives inside
`scripts/browser-smoke.mjs` — recorded as a follow-up rather than faked with a
header-only check that would pass on an opaque RGBA file. **Human check still
owed:** how the three children read over grass, forest, water, and snow at normal
play zoom (the loading path and `drawImage` render path are unchanged).

## Related files

- child sprite assets
- `src/game/renderer/humans.ts`
- sprite asset loading/cache modules
