# Loading a colony replaced the running game and a file load overwrote the quick-save

- Bug: Both load paths applied immediately with no confirmation, and loading a JSON file also rewrote the browser quick-save.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit UX review (UX-01 / UX-14)
- Area: save/load UI
- Owner module: `src/App.tsx` + `src/components/ConfirmActionDialog.tsx`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found direct `applyLoadedSession` calls and the file-load slot write.
- 2026-11-07 — resolved: armed confirmation on both paths, file load keeps the quick-save, re-entry guard.

## Observed behavior
A single click on "Load browser quick-save" or "Load game from file" replaced the colony immediately. `handleLoadFromFile` additionally called `saveGameToSlot`, destroying the previous browser save.

## Expected behavior
Loading is armed and cancellable, and a file load does not overwrite the browser quick-save without a separate decision.

## Reproduction steps
1. Play a colony and open the menu.
2. Click either load action; before the fix the running colony was replaced with no prompt.
3. Load a file; before the fix the quick-save slot changed to the file's world.

## Evidence
`ConfirmActionDialog` and `confirmPendingLoad` in `src/App.tsx`; file loads now show "quick-save unchanged".

## Root cause
The UI treated loading as a safe read and had no confirmation state.

## Fix / proposed fix
Arm both loads, state that unsaved progress is lost, keep the quick-save untouched on file load, and guard the confirm handler against re-entry.

## Save/migration impact
File loads no longer write the slot; existing saves are unchanged and still load.

## Verification result
- `npx tsc -p tsconfig.app.json --noEmit` — PASS.
- `npm run build` — PASS.
- Live preview: loaded the game screen without console errors.
