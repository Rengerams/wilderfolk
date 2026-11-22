# Visitor-camp retirement left a dangling export and a deleted test in the gates

- Bug: PR #180 removed `hitTestCamp` from `groupEvents.ts` and deleted `tests/visitorSpawn.gridSync.test.ts`, but `gameEngine.ts` still re-exported the removed function and `tests/ticksPerDay.literals.test.ts` still read the deleted file, so the typecheck and the unit gate fail on `main`.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-22
- Version/build: Wilderfolk 0.6.5.2 development, `main` at `10cb51fe`
- Reporter: merge of `main` into the pathfinding branch
- Area: build gates / module exports
- Owner module: `src/game/gameEngine.ts` (barrel re-export), `tests/ticksPerDay.literals.test.ts` (literal audit table)
- Related PR/commit: `ba33c475` (visitor retirement, PR #180); fixed in PR #181

## Status history
- 2026-11-22 — resolved: both stale references removed after the visitor-camp cleanup; typecheck and unit gates pass again.

## Observed behavior
- `npx tsc -p tsconfig.app.json --noEmit` → `src/game/gameEngine.ts(118,3): error TS2305: Module '"./groupEvents"' has no exported member 'hitTestCamp'`.
- `node scripts/test.mjs unit` → `tests/ticksPerDay.literals.test.ts` fails with `ENOENT: no such file or directory, open '/app/tests/visitorSpawn.gridSync.test.ts'`.

## Expected behavior
Removing a function or test file also removes every import, re-export and audit-table reference to it, so the repository's own gates stay green on `main`.

## Reproduction steps
1. Check out `main` at `10cb51fe`.
2. Run `npx tsc -p tsconfig.app.json --noEmit` and `npx vitest run tests/ticksPerDay.literals.test.ts`.

## Evidence
`git show origin/main:src/game/gameEngine.ts` still lists `hitTestCamp` in the `./groupEvents` re-export block, while `git show origin/main:src/game/groupEvents.ts` no longer defines it. The literal audit table still named the deleted visitor-spawn test.

## Root cause
The visitor-camp retirement touched the owning module and its tests but not the barrel re-export in `gameEngine.ts` or the audit table entry that reads the deleted test file.

## Fix / proposed fix
Removed the `hitTestCamp` re-export line and the deleted test's entry in the day-length literal audit table. No behavior change.

## Save/migration impact
None.

## Verification result
- `npx tsc -p tsconfig.app.json --noEmit`, `tsc -p tsconfig.vitest.json --noEmit`, `tsc -p tsconfig.node.json --noEmit` — PASS.
- `node scripts/test.mjs unit` — 537 files, 3584 tests, PASS after the fix (one fewer case: the deleted visitor-spawn entry left the literal audit table).
