# Retired camp hit-test export breaks TypeScript and calendar CI

- Bug: The game engine facade re-exports `hitTestCamp` from `groupEvents`, although the retired function is no longer exported.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-22
- Version/build: main and PR #182 head `64cce4cbc70dba7b29889159417238111842e72c`
- Reporter: GitHub Actions TypeScript and calendar invariant logs
- Area: stale game-engine export / retired visitor camps
- Owner module: `gameEngine.ts` (facade); removed gameplay owner `groupEvents.ts`
- Related PR/commit: PR #182, `f7259797b2258cf805b60b79d820dfabef71f1a2`

## Status history
- 2026-11-22 — open: the previous PR head failed Node.js CI with TS2305 and calendar scheduler with an ESM missing-export error.
- 2026-11-22 — investigating: removed the unused re-export and its stale ownership row; current-head CI not yet verified.
- 2026-11-22 — resolved: same defect as the visitor-retirement report, fixed on the pathfinding branch; `gameEngine.ts` no longer re-exports `hitTestCamp` and the typecheck, lint and ownership gates pass after merging `main`.

## Observed behavior
Node.js CI fails at `src/game/gameEngine.ts:118` with `TS2305: Module './groupEvents' has no exported member 'hitTestCamp'`. The calendar scheduler fails with the matching ESM missing export. The same stale import exists on main.

## Expected behavior
Retired visitor camp interaction APIs have no live exports or callers. Building and calendar invariants can import `gameEngine`.

## Reproduction steps
1. Check out PR #182 at `64cce4cbc70dba7b29889159417238111842e72c`.
2. Run the configured Node.js CI standard checks, or calendar invariant script.
3. Observe the missing `hitTestCamp` export at `gameEngine.ts:118`.

## Evidence
GitHub Actions workflow runs 45071868756 and 45071868851 fail for the same import. Repository search finds no active `hitTestCamp` calls, only the stale facade re-export and a historical ownership row.

## Root cause
The engine's re-export list was not updated when the on-map visitor camp hit tester was retired.

## Fix / proposed fix
Remove the unused `hitTestCamp` re-export and obsolete ownership entry. Do not resurrect the removed feature or create a stub implementation.

## Save/migration impact
None. The stale symbol was not used by persisted gameplay state.

## Verification result
- Source and CI log trace: complete.
- New-head Node.js CI and calendar gate: pending.
- Game behavior unchanged.
