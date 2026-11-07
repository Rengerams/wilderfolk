# Calendar regressions are not required in pull request CI

- Bug: TEST-03, TEST-04, TEST-12; related TEST-01/02/05/08, TQ-01/03/06/08.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-07
- Version/build: 0.6.5.1, main after PR #129
- Reporter: 2026-11-07 full audit
- Area: CI / calendar
- Owner module: .github/workflows/node.js.yml and scripts/test.mjs (test gate); src/game/gameTick.ts remains gameplay scheduler
- Related branch: fix/a2-fast-calendar-ci-gate-20261107

## Status history
- 2026-11-07 — open: the PR gate uses --changed and --passWithNoTests, so calendar coverage is not guaranteed on unrelated edits.
- 2026-11-07 — investigating: dedicated, always-running short calendar gate proposed (no 720-day continuous simulation).

## Observed behavior
The standard PR job executes only Vitest's affected test selection, excluding fullYear.integration.test.ts and longRunColony.integration.test.ts. Calendar owners have unit tests, but the required PR check may not exercise the real gameTick calendar boundaries.

## Expected behavior
Every PR must run a real gameTick integration gate covering the Year-2 midnight election, exactly-once daily skill decay, visitor gifts/checkout, and simulation invariants. A broken midnight call must fail the required gate even when only an unrelated source file changes.

## Reproduction steps
1. Modify an unrelated source file on a PR.
2. Observe Node.js CI invokes npm test -- standard --changed <base> and the runner appends --passWithNoTests.
3. The affected test subset need not include tests/calendarPhase.auditRegressions.test.ts.

## Evidence
node.js.yml: Run PR checks and affected tests. scripts/test.mjs: affected-only unit selection with --passWithNoTests; A1 calendar regression file is otherwise correct.

## Root cause
The affected-test optimization is incorrectly treated as a complete calendar gate; an owner-direct or affected-only test suite cannot enforce the schedule contract.

## Fix / proposed fix
Add a dedicated always-on PR and main job calling a named scheduler-only runner command with explicit test files and no --passWithNoTests. Use direct time jumps to just before calendar boundaries, then call real gameTick: never loop 720 in-game days in PR CI. Keep longer simulations separate.

## Save/migration impact
none.

## Verification result
NOT RUN — code and CI changes are being prepared.
