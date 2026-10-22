# Bug: Camera clamp regressed — empty ring around the world when zoomed out

- Bug: `clampCameraTarget` ignored the viewport-aware branch and doubled the overscroll margin
- Status: resolved
- Date discovered: 2026-09-13
- Version/build: Wilderfolk 0.6.4.1 working tree
- Reporter: found while verifying the Auto-play task (`tests/cameraClamp.viewport.test.ts` red)
- Area: Play | UI
- Owner module: `src/game/viewState.ts` (`clampCameraTarget`)
- Cadence: per camera update (presentation only)

## Status history

- 2026-09-13 — open: the file's three viewport-clamp regression tests failed (360 vs ≥380; 1040 vs ≤992; 840 vs ≤432).
- 2026-09-13 — resolved: the viewport branch is taken whenever a viewport is supplied, and the margin is back to the documented 2%; all three tests pass.

## Observed behavior

Zooming out on a small map shows an empty ring around the world again, and the
camera can be dragged further past the edge than the fix that introduced
`clampCameraTarget` allowed. Three assertions in
`tests/cameraClamp.viewport.test.ts` fail:

```text
AssertionError: expected 360 to be greater than or equal to 380
AssertionError: expected 1040 to be less than or equal to 992
AssertionError: expected 840 to be less than or equal to 432
```

## Expected behavior

`clampCameraTarget` keeps the visible viewport inside the world, pins the centre
when the viewport is larger than the world, and allows only the documented 2%
overscroll past an edge.

## Reproduction steps

1. `node node_modules/vitest/vitest.mjs run tests/cameraClamp.viewport.test.ts`.
2. Or in game: small map, zoom out fully — an empty band appears around the valley.

## Root cause

Two changes in `viewState.ts` broke the documented contract:

1. The viewport-aware branch gained `&& viewportW !== worldW`. A viewport exactly
   the size of the world (the third test's case) therefore fell through to the
   plain `0 … worldW` clamp, which caps the target at `worldW` and shows a ring.
   Absence of a viewport is already expressed by the optional `viewportW == null`,
   so the extra comparison only broke a legitimate case.
2. The boundary margin was raised from `worldW * 0.02` to `worldW * 0.05`, which
   enlarges exactly the empty ring the clamp exists to prevent.

## Fix

- take the viewport branch whenever `viewportW`/`viewportH` are supplied and positive;
- restore the 2% margin, with a comment stating why it stays small.

## Regression test

`tests/cameraClamp.viewport.test.ts` (3 cases) — unchanged, and green again:
zoomed-out centre pinning, normal-zoom edge clamping, and the
viewport-equals-world case.

## Save/migration impact

None — camera state is presentation; it is not part of the simulation save
contract.

## Verification result

`tsc -b` 0, `oxlint --type-aware --type-check` 0 warnings / 0 errors, the file's 3
tests pass, and the full local suite passes.

## Related commits or files

- `src/game/viewState.ts`
- `src/App.tsx`, `src/hooks/useKeyboardControls.ts`, `src/hooks/useCanvasInteractions.ts` (consumers)
- `tests/cameraClamp.viewport.test.ts`
