# Trait evaluation depends on DNA trait order at floating-point precision

- Bug: the pure trait evaluator produced slightly different numeric tendency values for the same three traits in different orders.
- Status: resolved
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1, unmerged Phase A PR #85
- Reporter: Node.js CI 40679466067
- Area: personality / trait influence evaluation
- Owner module: `src/game/personality/traitEvaluation.ts`
- Related PR/commit: PR #85, original head `60e37c8`

## Status history
- 2026-10-28 — investigating: code and six-permutation regression committed; completed verification pending.
- 2026-10-28 — resolved: the canonical-order accumulation and its permutation regression pass at the current head.

## Observed behavior
Three trait drawbacks at `social/reconciliation` returned the same factor but two slightly different tendencies: `-0.1935483870967742` versus `-0.19354838709677422`. This made a deep equality invariant fail even though the actual trait set was identical.

## Expected behavior
Different inherited trait slot orders must produce exactly the same bounded factor and tendency. Optional explanations must have a stable order as well.

## Reproduction steps
1. Check out PR #85 head `60e37c8`.
2. Run `npx vitest run tests/personality.traitEvaluation.test.ts`.
3. Compare `['stoic', 'chivalrous', 'fierce']` with `['fierce', 'stoic', 'chivalrous']` under `{ kind: 'social', activity: 'reconciliation' }`. The pre-fix comparison fails on the last floating-point bit.

## Evidence
GitHub Actions job 122786162141 in run 40679466067, test line 59.

## Root cause
IEEE-754 addition is not associative; the evaluator accumulated positive and negative modifiers in the order inherited traits appeared in the entity's DNA array.

## Fix / proposed fix
Canonically order at most three input trait references with a fixed sorting network of scalar locals. This imposes no array, Map, Set, string, closure or other hot-path allocations, and does not mutate source DNA. Accumulate in the same order regardless of original slot positions. Add a permutation regression that checks both standard and explained projections.

## Save/migration impact
None. Existing traits are read but neither reordered nor persisted differently.

## Verification result
- FAIL (pre-fix): `npm run test:standard`, 2,580 passed, 1 failed and 2 skipped, run 40679466067.
- PASS: `npx vitest run tests/personality.traitEvaluation.test.ts` on branch `codebot-tasks`.
