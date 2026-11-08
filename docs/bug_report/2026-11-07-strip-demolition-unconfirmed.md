# Alt+drag strip demolition permanently removed segments with no confirmation

- Bug: The strip eraser committed every matching road/wall segment on mouse-up, unlike the armed single-building demolish.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit UX review (UX-13)
- Area: map build tools
- Owner module: `src/hooks/useCanvasInteractions.ts` + `src/App.tsx`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found the immediate `demolishStripBuildings` command.
- 2026-11-07 — resolved: the gesture arms a confirmation naming the segment count.

## Observed behavior
An Alt+drag over roads or walls removed every segment in the stroke at once, with no arming step or permanence copy.

## Expected behavior
Permanent bulk removal asks first and can be cancelled.

## Reproduction steps
1. Enter a strip build mode with roads or walls placed.
2. Alt+drag across them.
3. Before the fix the segments vanished immediately; after it a confirmation appears.

## Evidence
`pendingStripDemolition`, `confirmStripDemolition` and `cancelStripDemolition` in `useCanvasInteractions`; `ConfirmActionDialog` in `App`.

## Root cause
The strip eraser was treated as a build gesture rather than a destructive one.

## Fix / proposed fix
Queue the collected ids and apply `demolishStripBuildings` only from the confirmation.

## Save/migration impact
None.

## Verification result
- `npx tsc -p tsconfig.app.json --noEmit` — PASS.
- `npm run build` — PASS.
