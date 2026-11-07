# UX-01 — Loading can destroy active colony and quick-save

- Bug: slot/file load silently replaces the current colony; file load writes to the same browser quick-save key.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-07
- Version/build: main after PR #130
- Area: save/load UI and browser slot
- Owner module: src/App.tsx for player confirmation, src/game/saveLoad.ts for storage ownership
- Related branch: fix/a5-top-blockers-lifecycle-load-modal-20261107

## Status history
- 2026-11-07 — open: audit UX-01; source trace confirmed unconfirmed session replacement and quick-save overwrite.
- 2026-11-07 — investigating: guard load against active colony replacement and preserve quick-save on file import.

## Observed behavior
handleLoad and handleLoadFromFile immediately call applyLoadedSession. handleLoadFromFile also immediately calls saveGameToSlot, replacing an unrelated existing save.

## Expected behavior
When a current colony is active, the player must explicitly confirm replacement; cancelling must preserve it. File imports must not silently overwrite the existing quick-save. Double-click should not invoke concurrent load.

## Reproduction steps
1. Play an active settlement and keep another colony in the browser quick-save slot.
2. Load from browser slot or a file; no confirmation is shown.
3. Import a file; previous quick-save is overwritten by saveGameToSlot.

## Evidence
src/App.tsx handleLoad/loadFromSlot/handleLoadFromFile, audit UX-01.

## Root cause
No shared replacement-confirmation guard; file path writes through the ordinary slot writer.

## Fix / proposed fix
Require confirmation for replacing a running colony, add a guard against repeated load, and use separate imported-save storage without mutating the existing quick-save. Add regression tests.

## Save/migration impact
Keep original browser save key and file format unchanged. An imported-save slot is separate.

## Verification result
NOT RUN — pending implementation and CI.
