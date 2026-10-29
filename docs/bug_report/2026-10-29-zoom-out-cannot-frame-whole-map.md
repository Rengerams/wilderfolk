# Zooming out stopped before the whole map was in frame

- Bug: the camera refused to zoom out further than the zoom at which the map covers the viewport, so on any map whose aspect differs from the window a band of the valley stayed permanently out of view
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: 0.6.5.2 unreleased, base 1ea16a2
- Reporter: player report with an annotated mini-map screenshot
- Area: camera / mini-map navigation
- Owner module: `viewState.ts`
- Related PR/commit: none yet

## Status history

- 2026-10-29 — open: the player's annotated mini-map showed the visible-area rectangle covering only the middle band of the valley while houses existed above and below it.
- 2026-10-29 — resolved: the zoom-out limit is now the whole-map fit zoom; targeted tests, typecheck, lint and build pass, and the fully zoomed-out view was checked in the preview.

## Observed behavior

`zoomCameraViewAt` clamped the zoom-out to `worldCoverZoom`, the closest zoom at which the map still covers the viewport on **both** axes. On a 4:3 valley in a wide window that zoom shows only about 70–75% of the map height, and the mini-map's viewport rectangle draws exactly that band. Because the same limit applied to every zoom-out path (wheel, `-` key, zoom-out button, presets, reset), the top and bottom of the valley — and any houses built there — could not be brought into a single view. Only panning reached them, one screen at a time.

For a huge valley the old absolute floor `CAMERA_ZOOM_MIN = 0.2` was itself above the fit zoom (a 6144×4608 valley in a 1275×700 viewport fits at 0.152), so the whole map was unreachable even at the minimum zoom.

## Expected behavior

Zooming out stops when the whole valley is in frame; the empty backdrop that this reveals on the shorter axis is acceptable, since the alternative hides part of the map.

## Reproduction steps

1. Start a settlement on the default Continental, Medium map, in a 1275 px wide window.
2. Zoom out with the `-` button, the mouse wheel or the wheel hotkey until the zoom stops changing.
3. Compare the mini-map viewport rectangle with the valley: it spans the full width but only the middle band of the height; at the old floor the reported zoom was the cover zoom (about 50%), not the fit zoom (about 36%).

## Evidence

The reported screenshot shows the mini-map's yellow viewport rectangle as a middle band, with content above and below it that the player could not frame. `zoomCameraViewAt` used `Math.max(clampCameraZoom(oldZoom * factor), worldCoverZoom(...))`; `clampCameraToCoverage` (session restore and canvas resize) raised the zoom to the same cover zoom. `Camera`/`worldFitZoom` arithmetic: 1920/4096 = 0.469 (cover) versus 1080/3072 = 0.352 (fit) for a 4096×3072 map in a 1920×1080 viewport.

## Root cause

The zoom-out floor was defined as "the map still covers the viewport" instead of "the whole map is in the viewport". Those differ whenever the map and viewport aspect ratios differ, and the cover zoom is always the stricter of the two.

## Fix / proposed fix

`worldFitZoom` is the new zoom-out limit (minimum of the two axis ratios), used by `zoomCameraViewAt`, the app's zoom-to-level helper and `clampCameraToFit`, which replaces `clampCameraToCoverage` for session restore and canvas resize. `CAMERA_ZOOM_MIN` drops to an absolute safety floor of 0.05 so a huge valley can reach its fit zoom. The map zoom control disables its zoom-out button at the effective fit zoom.

## Save/migration impact

None. Saved camera zooms are still read through `clampCameraZoom`; a save recorded above the new floor is untouched, and one below the fit zoom is raised to fit on load instead of to cover.

## Verification result

- `node scripts/test.mjs unit tests/viewState.fitZoom.test.ts` — PASS (9 tests: fit zoom maths for four viewports, axis centring at fit, restore below fit, zoom-out stopping at fit on a 4096×3072 and a 6144×4608 valley, zoom-in unaffected).
- `npm run test:types` — PASS. `npm run lint` — PASS, no new warnings. `npm run build` — PASS (pre-existing chunk-size warning only).
- Preview: a fresh Medium settlement zoomed fully out on a 1275 px wide window now frames the whole valley, with the mini-map viewport rectangle reaching the canvas edges instead of a middle band — PASS.
