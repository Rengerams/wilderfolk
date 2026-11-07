# Every unpaused frame forced a layout read and allocated a position per mover

- Bug: The loop read `canvas.offsetWidth/offsetHeight` once per unpaused frame to build the sim focus, and the motion pass allocated a fresh position object for every visible entity before deciding it did not need one.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V0.6.5.1 audit (PERF-09, PERF-16)
- Reporter: full-audit performance pass
- Area: renderer / game loop
- Owner module: `src/game/gameLoop.ts` (frame focus), `src/game/renderer/motionInterpolation.ts` (`presentationPosition`)
- Related PR/commit: this branch (`master-approach-buglist`)

## Status history
- 2026-11-07 — open: audit traced the per-frame `offsetWidth` read and the per-mover `{x, y}` allocation.
- 2026-11-07 — resolved: the loop reads the ResizeObserver size, and an unsmeared mover returns the entity itself.

## Observed behavior
`frameBody` queried `offsetWidth`/`offsetHeight` on every unpaused frame before computing the simulation focus, forcing style/layout work that the `ResizeObserver` had already answered. `presentationPosition` built a `current` object plus a blended object for every mover in view, including stationary ones and teleports that are discarded immediately.

## Expected behavior
A frame reads no layout it does not need and does not allocate a position for a mover it draws exactly where it stands.

## Reproduction steps
1. Watch the frame path in a profile at 1x with a populated colony.
2. Observe the layout read each frame and the per-mover allocations.

## Evidence
- `tests/renderer.motionAndHover.test.ts` — "does not smear a mover that teleported between ticks" now also asserts the returned object is the entity itself.
- `src/game/gameLoop.ts` — the focus uses `this.layoutSize`, guarded on a measured size.

## Root cause
The frame path predated the `ResizeObserver` layout cache, and the interpolation helper copied the entity before comparing positions.

## Fix / proposed fix
The focus reads the cached layout size; `presentationPosition` compares coordinates directly and returns the entity for the stationary and teleport cases, leaving one object only for a genuinely blended position.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/renderer.motionAndHover.test.ts` — PASS (10/10).
- `npx vitest run renderer` — PASS as part of the wider regression set.
- `npm run test:types`, `npm run lint`, `npm run build` — PASS.
- `SpeedDiag` frame-time comparison — NOT RUN (no profile captured in this change).
