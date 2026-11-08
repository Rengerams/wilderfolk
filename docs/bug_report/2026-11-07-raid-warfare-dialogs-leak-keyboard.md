# Raid report and warfare dialogs left the game keyboard active

- Bug: `BattleReportScreen` and both `WarfareStatus` dialogs declared `aria-modal` but did not trap focus or claim the keyboard, so Space/Escape acted on the game behind them.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit UX review (UX-03 / UX-04 / UX-02)
- Area: modal accessibility
- Owner module: `src/components/BattleReportScreen.tsx` + `src/components/WarfareStatus.tsx`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: neither file imported the shared focus/keyboard hooks.
- 2026-11-07 — resolved: both dialogs use `useModalFocus` and `useOverlayKeyboard`; execution copy states permanence.

## Observed behavior
Tab escaped the report/dialog, Escape did not close it, focus was not restored, and gameplay hotkeys kept firing behind the backdrop.

## Expected behavior
Each full-screen dialog traps focus, owns Escape, restores focus on close, and blocks gameplay hotkeys.

## Reproduction steps
1. Open a raid report or the prisoners dialog.
2. Press Tab and Escape; before the fix focus left the dialog and the map cleared selection.
3. Press Space; before the fix the game paused/unpaused.

## Evidence
`tests/keyboardGuards.contract.test.ts` now lists both components and requires the shared focus hook.

## Root cause
The dialogs were built as visual overlays without the repository's modal contract.

## Fix / proposed fix
Attach `useModalFocus` to the root dialog and `useOverlayKeyboard` with the close action; state that execution is permanent.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/keyboardGuards.contract.test.ts tests/battleReportScreen.test.ts` — PASS.
- `npm run build` — PASS.
