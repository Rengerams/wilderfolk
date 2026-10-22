# A held movement key survived focus loss, so the camera panned forever

- Bug: the keyup handler skipped its delete whenever the event target was a text field, and nothing reset the held-key set on window blur or tab hide — so a movement key pressed on the map stayed held after alt-tab or after clicking into a search box, and the momentum loop kept the map drifting
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, finding F5)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F5), verified against the tree 2026-09-17
- Area: UI
- Owner module: `src/hooks/useKeyboardControls.ts` (camera drag: `src/hooks/useCanvasInteractions.ts`)
- Cadence: presentation (per key event / per frame)

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report)
- 2026-09-17 — resolved (keyup always deletes; focus loss releases keys, momentum and a live drag)

## Observed behavior

```ts
const handleKeyUp = (e: KeyboardEvent) => {
  if (isEditableTarget(e.target)) return;   // ← the delete is dropped
  keysRef.current.delete(e.key.toLowerCase());
};
```

`isEditableTarget` resolves the *current* `document.activeElement` when the event target is not
an element (`hotkeys.ts`), so releasing a key while a text field holds focus never removed it
from the set. Alt-tabbing never delivers the keyup at all. Nothing else reset the set: a
search of `src/` found no `blur` or `visibilitychange` handler touching `keysRef` (only
`audio/graph.ts`, for audio). The camera momentum loop re-adds velocity every frame from the
held set, so the residual friction never wins and the map slides by itself.

The same missing focus-loss handling left the mouse-drag refs set: `useCanvasInteractions`
reset `isDraggingRef`/`cameraDragStartRef` only in `handleMouseUp` and `handleMouseLeave`, and
`GameMapStage` binds those handlers on the canvas element only. Pressing on the map,
alt-tabbing, releasing elsewhere and returning left the camera following the cursor with no
button held.

## Expected behavior

Losing the window releases every held key and any in-progress camera drag.

## Reproduction steps

1. Hold `d` (or an arrow key) so the map pans.
2. Alt-tab away and release the key.
3. Return to the game.
4. **Before the fix:** the map keeps sliding until that key is pressed and released again.
5. Press the mouse on the map, alt-tab mid-drag, release outside, return and move the mouse:
   **before the fix** the camera follows the cursor with no button pressed.

## Evidence

`tests/keyboardGuards.contract.test.ts` asserts the keyup body no longer consults
`isEditableTarget` and that the blur/visibility release listeners exist. Static trace of the
momentum loop, `isEditableTarget`'s active-element fallback, and the canvas-only mouse
bindings.

## Root cause

Two assumptions that only hold while the game has focus: that a keyup is always delivered, and
that it is always addressed to the element the key was pressed on. Neither survives alt-tab or
a focus change. Deleting an absent key is free, so the guard on keyup was pure loss.

## Regression test

Covered by `tests/keyboardGuards.contract.test.ts` (source contract; no DOM in this tier — see
the caveat in the F3 report).

## Invariants checked

- `keysRef` is only read by the momentum loop and only written on key events plus the new
  release, so clearing it cannot affect anything else.
- Zeroing `cameraVelRef` is idempotent and already happens when no key is held.
- Resetting the drag refs reuses `handleMouseLeave`, the same path the pointer already takes
  when it leaves the canvas, so the reset cannot diverge from the normal exit path.
- `visibilitychange` also fires when the page becomes visible again; resetting then is a no-op
  because no drag or key can be in progress.

## Save/migration impact

None.

## Verification result

- `npx vitest run tests/keyboardGuards.contract.test.ts` — passed (6 tests).
- `npx tsc -p tsconfig.app.json --noEmit` — passed (no output).
- `npm run lint` — 0 warnings / 0 errors.
- `npm run test:all` — passed, see the batch summary in `SUMMARY.md`.
- Not verified in a browser (no DOM tier): alt-tab behaviour cannot be exercised here.

## Related commits or files

- `src/hooks/useKeyboardControls.ts` — keyup, and the blur/visibility release
- `src/hooks/useCanvasInteractions.ts` — drag reset on focus loss
- `src/game/hotkeys.ts` — `isEditableTarget`
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F5

## Fix

`handleKeyUp` deletes unconditionally; `window.blur` and `document.visibilitychange` clear
`keysRef` and zero `cameraVelRef`; `useCanvasInteractions` runs `handleMouseLeave` on
`window.blur`, `pointercancel` and `visibilitychange`, removing all three in its cleanup.
