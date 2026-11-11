# UX-03/04 — Battle, defeat and prisoner dialogs leak keyboard/focus

- Bug: fullscreen battle and war modals do not claim shared keyboard ownership or trap and restore focus.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-07
- Version/build: main after PR #130
- Area: battle report / warfare status UI
- Owner module: src/components/BattleReportScreen.tsx, src/components/WarfareStatus.tsx
- Related branch: fix/a5-top-blockers-lifecycle-load-modal-20261107

## Status history
- 2026-11-07 — open: audit UX-03/04; missing modal hooks confirmed from source.
- 2026-11-07 — investigating: wire existing useModalFocus and useOverlayKeyboard hooks without duplicated handler policy.
- 2026-11-07 — source fixed: all three modal owners now use shared focus and keyboard hooks; CI source contract passed. Runtime Tab/Escape browser verification outstanding.

## Observed behavior
Dialogs are marked aria-modal=true without keyboard ownership and focus trapping. Map hotkeys can still run and Tab can escape to background controls.

## Expected behavior
Full-screen dialog owns the keyboard, Tab cycles inside, focus enters and returns on close, Escape invokes the dialog's designated close/navigation behavior, and background map controls do not react.

## Reproduction steps
1. Open battle report, prisoners dialog, or terminal settlement screen.
2. Press Escape or map action keys, or navigate with Tab.
3. Background keys are not suppressed and focus can escape.

## Evidence
src/components/BattleReportScreen.tsx and WarfareStatus.tsx lack useOverlayKeyboard and useModalFocus; audit UX-03/04.

## Root cause
Components do not use the established overlay ownership/focus hooks.

## Fix / proposed fix
Use the shared hooks in each modal with active-scoped ownership and focus ref; test keyboard and focus behavior.

## Save/migration impact
None.

## Verification result
PASS — `tests/keyboardGuards.contract.test.ts` 26/26 and TypeScript/React build (Node.js CI 42414084557). NOT RUN — browser keyboard-walk: focus entry/restore, Tab trap and Escape across all 3 dialogs; retain investigating until real UI verification.
