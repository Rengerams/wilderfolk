# PR #120 merge restored outdated simulation registries

- Bug: The manual PR #120 merge silently restored obsolete decision and ownership documentation over newer main changes.
- Status: fix implemented; CI validation pending
- Severity: high
- Date discovered: 2026-11-02
- Version/build: PR #120 head 2361e14c650924a531af3c25c7b0a96412758798, merged into main as f8be454d2a5924e3164f7552d3e74c8b09e69a9e
- Reporter: GitHub Actions Node.js CI build 125059178680
- Area: branch integration, TypeScript registry ownership
- Owner module: `src/game/simulation/decisionRegistry.ts` and its corresponding overview
- Related PR/commit: #120; corrective follow-up PR

## Status history
- 2026-11-02 — resolved the three overlapping-file conflicts against updated main while retaining 101 intervening commits, and restored the relevant ownership descriptions. CI pending.
- 2026-11-02 — investigating: reproduced from CI log and main versus merged PR diff; restoring current decision and ownership records while retaining the intended fixes.

## Observed behavior
The standard test TypeScript compilation fails at `tests/simulation.decisionRegistry.test.ts` lines 94, 105, 142 and 175 with TS7053. The required `virtualPlayer` decision is absent from `DecisionKey` and `SIMULATION_DECISIONS` in the merged branch. Comparison also shows unrelated current changelog and descriptions of midnight work credit, worker previews and food policy were replaced by stale versions.

## Expected behavior
Merging the changelog checker and unused meal-helper fixes must leave existing main decision keys, actual owner schedules and documentation intact.

## Reproduction steps
1. Check out merged PR #120 commit `f8be454d2a5924e3164f7552d3e74c8b09e69a9e`.
2. Run `npm run test:standard` (CI standard TypeScript gate).
3. Observe TS7053 at the four test locations.

## Evidence
GitHub Actions run 41376955248, job 125059178680; main before PR #120 at `7d6a1b2` contained `virtualPlayer` with `writes: []` and the current midnight career credit ownership. The PR #120 diff removed these unrelated records.

## Root cause
A previous manual merge used older Git blobs for active documentation instead of reconciling the newest main tree with the narrowly scoped feature changes.

## Fix / proposed fix
Restore `CHANGELOG.md`, `OWNERSHIP_OVERVIEW.md`, `docs/BUG_REPORTS/SUMMARY.md`, and `src/game/simulation/decisionRegistry.ts` from pre-merge main. Preserve the original PR #120 entries and removal of the unused `isMealCheckHour` ownership references. Retain existing registry type guards and required-key tests rather than suppressing any errors.

## Save/migration impact
None. No world or gameplay writer changes.

## Verification result
Original CI error: CONFIRMED. Corrected source and ownership contract: static review PASS. Follow-up CI: PENDING. No local npm commands were executed.
