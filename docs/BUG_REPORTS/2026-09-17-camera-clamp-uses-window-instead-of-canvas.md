# Camera clamping used the window size instead of the canvas, so the map edges were unreachable: 2026-09-17

- Bug: when the map is larger than the map viewport, the camera cannot be panned to the map's left/right edges — keyboard/WASD/arrow panning and click-to-focus both stop short
- Status: resolved
- Date discovered: 2026-09-17
- Version/build: 0.6.4
- Reporter: reported from play ("i want the size of the map i choose in settings, if it doesnt fit on screen i just should go to left or right")
- Area: UI
- Owner module: `src/game/viewState.ts` (`clampCameraTarget`, `nudgeCameraToward`), camera call sites
- Cadence: every pan input

## Status history

- 2026-09-17 — open (reported from play while reviewing the map viewport size)
- 2026-09-17 — resolved (both remaining pan paths now pass the real canvas viewport)

## Observed behavior

On the default Medium map (1200×900 world px) at the default 1.45× zoom, horizontal panning is confined
to a narrow band around the settlement. The camera stops well before the map edge, so the outer columns
of the valley cannot be reached by panning.

## Expected behavior

If the map does not fit the viewport, the camera can reach both extremes, so every part of the chosen
map size is reachable by panning.

## Reproduction steps

1. Start a settlement and hold a horizontal pan key (or drag) toward the left/right map edge.
2. Observe the camera stops short of the edge; the outermost map columns stay off-screen.

## Evidence

`clampCameraTarget` derives the allowed camera range from a viewport in **pixels**
(`viewState.ts:483-490`), and its fallback when no viewport is supplied is
`window.innerWidth`/`window.innerHeight`. The map viewport is the canvas, not the window: measured live
as **1304×813** against a **1600×900** window, because the left rail and the right inspector occupy the
difference (the inspector container is fixed at `w-[18.5rem]` = 296 px, `App.tsx:1688`).

At zoom 1.45 on the 1200×900 Medium map that produces:

| Viewport used | halfViewW = vw/2/zoom | allowed camera x range |
|---|---|---|
| window 1600 (wrong) | 551.7 | `[551.7, 648.3]` — 96.6 world px |
| canvas 1304 (correct) | 449.7 | `[449.7, 750.3]` — 300.6 world px |

So the reachable horizontal range was about a third of what it should be, short by the panel width.
Vertical was over-restricted too (900 vs the real 813).

Call sites that passed no viewport: `useKeyboardControls.ts:179` (H-to-find-settlers) and `:216`
(**the WASD/arrow + momentum pan loop** — the main panning path), `viewState.ts:530`
(`nudgeCameraToward`, reached from the click-to-focus path at `useCanvasInteractions.ts:257`), and
`App.tsx:356/592/773`. `App.tsx:741/754` and the drag-to-pan path
(`useCanvasInteractions.ts:338-344`) already passed the canvas rect — so drag-panning worked while
keyboard panning did not, which is consistent with the report.

## Root cause

`clampCameraTarget` accepts an optional viewport, but the keyboard-pan and click-nudge call sites never
supplied one, so it fell back to the **window** size. Because the window is wider than the map canvas by
the width of the side panels, the clamp kept the camera too far from the map edge on both axes.

## Regression test

`tests/cameraClamp.viewport.test.ts` already pins `clampCameraTarget`'s viewport-aware maths. This
report's defect is a **call-site** omission, so the fix is guarded by threading the viewport through the
two paths rather than by a new unit test of the clamp; `useKeyboardControls` now requires a `canvasRef`
in its options interface, so a caller cannot silently omit it again.

## Invariants checked

Camera only. The clamp remains the single authority for allowed camera targets; no simulation, save or
cadence code is touched, and `audit:deps:cycles:strict` stays green (no new module edges — the hook
already imported `clampCameraTarget`).

## Save/migration impact

None.

## Verification result

`test:types` exit 0 · `lint` 0 warnings / 0 errors · `build` exit 0 · `npm test` 167 files / 905 tests
passed · `test:browser --seed 12345` verdict pass, 0 console/page errors.

## Related commits or files

- `src/game/viewState.ts` — `clampCameraTarget`, `nudgeCameraToward`
- `src/hooks/useKeyboardControls.ts` — the WASD/arrow + momentum pan loop
- `src/hooks/useCanvasInteractions.ts` — click-to-focus nudge (drag-pan was already correct)
- `src/App.tsx` — `UseKeyboardControlsOptions` call site

## Fix

- `useKeyboardControls` takes a `canvasRef` and passes the canvas rect to `clampCameraTarget` on both
  call sites (the options field is documented with the reason, so the omission is not repeated).
- `nudgeCameraToward` accepts optional `viewportW`/`viewportH` and forwards them; the click-to-focus
  path passes the `rect` it already receives from `getEventWorldCoords`.
- `App.tsx` passes its existing `canvasRef` into `useKeyboardControls`.
