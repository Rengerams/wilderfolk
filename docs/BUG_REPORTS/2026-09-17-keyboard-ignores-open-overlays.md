# Keyboard handling ignored open overlays, so one Escape closed a panel and cleared the selection

- Bug: gameplay hotkeys were never gated on an open overlay; because the game handler listens on `window` in the capture phase it ran before the menu's and dashboard's own handlers, so a single Escape closed the menu *and* fell through to wipe the map selection, and zoom/building hotkeys acted on the game behind an open dashboard or shortcuts sheet
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, finding F3)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F3), verified against the tree 2026-09-17
- Area: UI
- Owner module: `src/game/keyboardOwnership.ts` (consumer: `src/hooks/useKeyboardControls.ts`)
- Cadence: presentation (per key event)

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report)
- 2026-09-17 — resolved (overlays claim the keyboard; the shortcuts sheet gates the gameplay keys)

## Observed behavior

`useKeyboardControls` registered its handler first and unconditionally:

```ts
window.addEventListener('keydown', handleKeyDown, true);   // capture phase
```

Its Escape chain ends in a catch-all that clears the selection:

```ts
} else {
  loopRef.current?.patchView({ selectedEntityId: null, selectedEntityIds: [], selectedBuildingId: null });
}
```

`GameMenu` listens on `document` in the bubble phase (`document.addEventListener('keydown', onKeyDown)`) and `GameDashboard` on `window`. Window **capture** runs before both, and neither
of those handlers is reached first or stops propagation. So pressing Escape to close the menu
also ran the game chain, found no overlay of its own, and dropped the selection. The
shortcuts overlay was worse: `showShortcutsRef` gated only the sidebar-tab block, so `1`–`9`,
`b`, `g`, `r`, `h`, `+`, `-` and Space all still acted on the game behind the open sheet.

## Expected behavior

While an overlay is open it owns the keyboard: it alone handles Escape and other keys, and no
gameplay hotkey reaches the game behind it.

## Reproduction steps

1. Select a building on the map.
2. Open ☰ Menu.
3. Press Escape.
4. **Before the fix:** the menu closes *and* the building inspector selection is cleared.
   **After the fix:** only the menu closes; the selection survives.
5. Open the shortcuts sheet (`?`) and press `b` or `1`: before the fix the build panel opened
   behind the sheet and placement mode began; after the fix nothing happens.

## Evidence

`tests/keyboardGuards.contract.test.ts` — source contracts, since this tier has no DOM:
the game handler yields to a claim, the menu and dashboard both claim and release, and the
gameplay block stops at the shortcuts sheet. Static trace of the four handlers and their
phase/target registration order.

## Root cause

Two independent problems with one shape: the game handler is registered *earlier* and more
aggressively (window + capture) than any overlay, and it had no notion of "an overlay is
open". Registration order cannot be fixed from the overlay side — a listener registered later
on the same target and phase cannot preempt an earlier one — so the overlays need a signal the
game handler can read.

## Regression test

`tests/keyboardGuards.contract.test.ts` (6 assertions over 3 tests) pins the source contract
for this and the two sibling defects (F4/F5). This is **not** a behavioural test: a
`KeyboardEvent` cannot be dispatched in this tier (`vitest.config.ts` is
`environment: 'node'`), so the guards prove the code is still written the right way round,
not that the browser does the right thing. The caveat is stated in the test file.

## Invariants checked

- The claim is a set, so nested owners cannot release each other's claim; each overlay releases
  in its effect cleanup, so an unmount cannot leave the keyboard dead.
- The claim takes effect on the *next* key event (the handler reads it live), so a menu opened
  and closed between two keys cannot swallow one.
- Ctrl+S (save) is now also blocked while an overlay owns the keyboard — deliberate: the
  overlay is a modal, and the menu has its own Save action.
- The shortcuts sheet still closes with Escape and `?`, because both are handled above the
  gameplay gate.

## Save/migration impact

None.

## Verification result

- `npx vitest run tests/keyboardGuards.contract.test.ts` — passed (6 tests).
- `npx tsc -p tsconfig.app.json --noEmit` — passed (no output).
- `npm run lint` — 0 warnings / 0 errors.
- `npm run test:all` — passed, see the batch summary in `SUMMARY.md`.
- Not verified in a browser: no DOM tier here, and the audit's own note was that the visual
  check needs one. The behavioural claim rests on the registration order, which is read from
  the four call sites rather than measured.

## Related commits or files

- `src/game/keyboardOwnership.ts` — the new claim owner
- `src/hooks/useKeyboardControls.ts` — the claim guard and the shortcuts gate
- `src/components/GameMenu.tsx`, `src/components/dashboard/GameDashboard.tsx` — claim/release
- `tests/keyboardGuards.contract.test.ts` — the guard
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F3

## Fix

`src/game/keyboardOwnership.ts` gained `claimKeyboard` / `releaseKeyboard` / `isKeyboardClaimed`
over a set of owners. `GameMenu` claims while `open` and `GameDashboard` claims while mounted.
`useKeyboardControls` returns immediately at the top of `handleKeyDown` while a claim is held,
and returns again before the gameplay block while `showShortcutsRef` is set (Escape and `?`
stay above that line).
