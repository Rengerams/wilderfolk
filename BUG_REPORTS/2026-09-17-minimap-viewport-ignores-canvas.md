# The minimap viewport rectangle ignored the canvas size

- Bug: the minimap drew its camera rectangle as `world.width / zoom * scaleX * 0.5`, which collapses to `minimapWidth / (2 * zoom)` — it never read the map canvas, so the box was the wrong size and did not follow a window resize
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, finding F6)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F6), verified against the tree 2026-09-17
- Area: UI
- Owner module: `src/components/MiniMap.tsx` (renderer contract: `src/game/viewState.ts`)
- Cadence: presentation (per draw)

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report)
- 2026-09-17 — resolved (the rectangle is derived from the map canvas and the zoom)

## Observed behavior

```ts
const scaleX = W / world.width;                              // W = 152 minimap px
…
const camW = (world.width / camera.zoom) * scaleX * 0.5;     // ≡ W / (2 * zoom)
const camH = (world.height / camera.zoom) * scaleY * 0.5;    // ≡ H / (2 * zoom)
```

The renderer's own contract says the visible world span is the **canvas** divided by the zoom:
`worldToScreen` places the camera centre at `cw / 2` (`viewState.ts:566-575`), and the canvas
is sized in CSS pixels. The correct rectangle is therefore
`(canvasWidth / zoom) * (W / world.width)`. Substituting `world.width / 2` for the canvas width
makes the box correct only when the canvas happens to be exactly half the world width, and
because no canvas measurement was involved it never changed when the window did.

## Expected behavior

The rectangle matches the visible region of the map, at any window size and zoom.

## Reproduction steps

1. Start a Medium map (1200×900) and zoom to 1.45×.
2. Compare the minimap's rectangle with the area the main view actually shows:
   **before the fix** the box is roughly a quarter of the true width.
3. Resize the window: with the main viewport visibly wider, the box stays the same size.

## Evidence

Static trace of the rectangle arithmetic, `worldToScreen`'s `cw / 2` contract, and the canvas
sizing path. Magnitudes were computed, not observed: the audit's own estimate ("~52 px drawn
instead of ~137 px") is arithmetic from a ~1560 px canvas, and no browser measurement was made
here either — the visual magnitude remains SUSPECTED, the defect does not.

## Root cause

The rectangle was derived from the world's dimensions instead of the render viewport's, on the
assumption that the canvas is half the world. `MiniMap` received only `worldRef`, `viewRef` and
`onNavigate`, so it had no way to measure the canvas even though its parent (`GameMapStage`)
already holds that ref.

## Regression test

None added: the defect is arithmetic inside a `requestAnimationFrame` draw against a canvas 2D
context, and this tier has no DOM (`vitest.config.ts` is `environment: 'node'`). A pure helper
could be extracted and tested, but that would reshape the component for one expression; the
change is a three-line substitution whose correctness is the renderer's `cw / 2` contract,
stated in the code comment. Disclosed rather than papered over with a source-scan assertion
that would prove nothing about the number.

## Invariants checked

- The fallback when the canvas is absent is the world size, which is the same
  "whole map visible" answer the old expression gave when the canvas really was half the world.
- `scaleX`/`scaleY` (and so the north-west corner placement) are unchanged, so only the box size
  moved.
- The effect's dependency array gained the ref, which is stable, so the draw loop is not rescheduled.

## Save/migration impact

None.

## Verification result

- `npx tsc -p tsconfig.app.json --noEmit` — passed (no output).
- `npm run lint` — 0 warnings / 0 errors.
- `npm run test:all` — passed, see the batch summary in `SUMMARY.md`.
- The rendered rectangle was **not** measured in a browser; see the SUSPECTED note above.

## Related commits or files

- `src/components/MiniMap.tsx` — the rectangle and the new `canvasRef` prop
- `src/components/GameMapStage.tsx` — passes its existing `canvasRef`
- `src/game/viewState.ts` — `worldToScreen`, the contract the fix follows
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F6

## Fix

`MiniMap` takes the map `canvasRef` (destructured as `mapCanvasRef` to avoid shadowing its own
canvas ref) and computes:

```ts
const rect = mapCanvasRef.current?.getBoundingClientRect();
const camW = ((rect?.width ?? world.width) / camera.zoom) * scaleX;
const camH = ((rect?.height ?? world.height) / camera.zoom) * scaleY;
```
