# CB-02 — React render crash has no recovery export

- Bug: An uncaught React rendering/lifecycle exception discards the UI without a safe way to download the last available colony state.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-07
- Version/build: PR #131 before follow-up commits
- Area: root React tree / persistence
- Owner module: src/components/GameErrorBoundary.tsx (UI), src/game/saveLoad.ts (canonical file export)
- Related PR: #131

## Status history
- 2026-11-07 — open: root main.tsx mounted App without a React error boundary.
- 2026-11-07 — source fixed: root fallback captures session refs, offers file-only export, and prevents crash-unmount autosave from overwriting the quick-save; CI/browser checks pending.

## Observed behavior
main.tsx rendered App directly; an exception in child render or lifecycle unmounted the game without a fallback download. The normal App unmount auto-save could write a non-authoritative display shadow.

## Expected behavior
A crashed React tree presents a recovery UI, exports the most recent available world and view only to a file, and leaves prior valid browser saves untouched.

## Reproduction steps
1. Start an active colony.
2. Trigger a React render exception inside the App tree.
3. Before this patch there was no recovery action; normal unmount ran its persistence cleanup.

## Evidence
src/main.tsx lacked a root error boundary; useGamePersistence.ts registers an unmount autosave; gameLoop.ts keeps worker-authored data independently from render state.

## Root cause
No root error boundary, and no file-only mode was exposed to the recovery UI.

## Fix / proposed fix
GameErrorBoundary snapshots read-only live session refs before unmount. The existing downloadSaveFile export runs in file-only mode, and the normal auto-save cleanup stands down during a React crash. The UI warns that the most recent worker commands may be missing.

## Save/migration impact
No save schema change. The recovered file is best-effort and does not replace ecosim_save or ecosim_imported_save.

## Verification result
NOT RUN — live browser injected-render-error test and CI as of this report. Added tests/gameErrorBoundary.test.ts plus a preservation test in tests/saveLoad.externalSlot.test.ts.
