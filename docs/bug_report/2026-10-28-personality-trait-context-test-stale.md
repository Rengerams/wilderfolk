# Trait evaluation regression test referenced obsolete contexts

- Bug: a newly added regression assertion expected a drawback from a context that no longer has catalog effects.
- Status: resolved
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1; PR #85 unmerged Phase A
- Reporter: Node.js CI run 40676056676
- Area: trait evaluation contract tests
- Owner module: `tests/personality.traitEvaluation.test.ts` (test); `src/game/personality/traitEffectCatalog.ts` (effect data)
- Related PR/commit: PR #85

## Status history
- 2026-10-28 — investigating: assertion fixed against an actual reachable catalog context; rerun pending.
- 2026-10-28 — resolved: the corrected assertion passes at the current head.

## Observed behavior
`npm run test:standard` ran 2,582 tests, with 2,579 passing, 2 skipped and 1 failing. The test for three-trait trade-offs expected `factor < 1` at `civic/negotiation`, but the three traits in that fixture no longer contribute in that context and correctly yield factor 1.

## Expected behavior
Regression fixtures must assert effects for the canonical catalog's current reachable contexts, not test a removed trait mapping.

## Reproduction steps
1. Check out PR #85 commit `1b6e8cf`.
2. Run `npx vitest run tests/personality.traitEvaluation.test.ts` or `npm run test:standard`.
3. Observe `expected 1 to be less than 1` at the outdated `civic/negotiation` assertion.

## Evidence
GitHub Actions run 40676056676; failed job 122775059411, test line 57.

## Root cause
The third refinement changed Lucky, Chivalrous and Intuitive drawbacks from diplomacy into other real contexts, but the new combined-regression fixture was not updated.

## Fix / proposed fix
Test the existing `social/reconciliation` context with Stoic, Chivalrous and Fierce; check bounded negative factor and tendency and order independence. Do not reintroduce player-only trait effects or change runtime logic to satisfy a stale test.

## Save/migration impact
None. No state changes and no persisted fields added in PR A.

## Verification result
- FAIL: initial `npm run test:standard` on commit `1b6e8cf`.
- PASS: `npx vitest run tests/personality.traitEvaluation.test.ts` on branch `codebot-tasks`.
