# A render throw blanked the whole game with no way to export

- Bug: No React error boundary existed, so one panel throw unmounted the app and lost the player's route to a save.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit codebase review (CB-02 / UX-06)
- Area: application shell
- Owner module: `src/components/AppErrorBoundary.tsx` + `src/game/liveSessionSave.ts`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: grep found no `ErrorBoundary`/`componentDidCatch` in `src/`.
- 2026-11-07 — resolved: one top-level boundary with live-save export and reload.

## Observed behavior
Any throw from a panel or projection unmounted the React tree and left a blank page with no message or save control.

## Expected behavior
A render failure shows a readable screen and can export the current colony before reloading.

## Reproduction steps
1. Force a component render throw inside the game shell.
2. Before the fix the page goes blank; after it the boundary screen appears.

## Evidence
`src/main.tsx` now wraps `App` in `AppErrorBoundary`; `registerLiveSessionSave` supplies the running loop's world/view.

## Root cause
No top-level boundary existed.

## Fix / proposed fix
One boundary around the router, an export button that uses the live loop when available and the stored quick-save otherwise, and a reload button.

## Save/migration impact
None; the boundary only reads/export the existing save owner.

## Verification result
- `npx tsc -p tsconfig.app.json --noEmit` — PASS.
- `npm run build` — PASS.
