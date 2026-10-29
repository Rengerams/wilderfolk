# Spotlight chorus CI fixtures violate actor eligibility and cast ordering

- Bug: three `tests/spotlightLore.test.ts` failures followed the correct male-only casting change: one test assumed ascending IDs instead of distance-ranked performers; two real-tick fixtures created adult performers without specifying their required male gender.
- Status: investigating (source fix committed; fresh CI not yet verified)
- Severity: low (test/CI contract; no evidence of a gameplay defect)
- Date discovered: 2026-10-29
- Version/build: v0.6.5.2 development, PR #91, failing head `d09907b11af60003617242af066dc189b89854a4`
- Reporter: GitHub Actions Node.js CI run 40784378219
- Area: Spotlight male chorus regression fixtures
- Owner module: `tests/spotlightLore.test.ts` (test fixture); production eligibility remains owned by `src/game/spotlightLore.ts`
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/91 ; source correction `60d74c35dd2f91d7a6bfa65336326934b17f9ec9`

## Status history
- 2026-10-29 — investigating: 3 failed, 2780 passed, 2 skipped in the full CI run for the prior PR head.
- 2026-10-29 — fix committed: assert the exact cast ID set rather than artificial ID order and construct eight explicitly male chorus participants; full CI rerun still pending.

## Observed behavior
The six real selected singers have IDs `100006, 100005, 100007, 100004, 100003, 100002`; the casting test expected ascending IDs although the engine ranks eligible singers by proximity to the heroine. The gathering and ready commute cases both set `performerIds` to eight entities created without a `gender` override. `createEntity` assigns unspecified human genders from the simulation RNG; `tickSpotlightGathering` correctly aborts when any chosen performer is ineligible, leaving `spotlightLore?.phase` undefined.

## Expected behavior
All selected performers must be eligible adult men. The test must check that the cast consists of the six expected male IDs independently of distance ordering. Real-tick home-commute tests should provide eight actual eligible male actors and continue asserting stage priority and presence.

## Reproduction steps
1. Run PR #91 Node.js CI on commit `d09907b11af60003617242af066dc189b89854a4`.
2. The mixed-gender selection assertion fails at line 110 because its expected ID order differs from distance ranking.
3. The `gathering` and `ready` commute regressions fail at line 340 with an aborted scene, because the fixtures do not explicitly assign male gender.

## Evidence
GitHub run https://github.com/Rengerams/wilderfolk/actions/runs/40784378219, 1 of 423 test files failed. The production `eligibleChorus` predicate requires `entity.gender === 'male'`; `createEntity` randomly supplies a gender when unspecified. Production scene validation is functioning as designed.

## Root cause
Two test contract mismatches introduced by strengthening adult-male-only Spotlight casting, not a regression in the runtime eligibility filter.

## Fix
In the same existing test file, compare cast identity as a `Set`, preserving the six-member and male-only checks, and explicitly assign `gender: 'male'` to each adult in the real-tick home-commute fixture. No production behavior or assertions were deleted.

## Save/migration impact
None. Tests only; no state model, runtime behavior, persisted data or migration changes.

## Verification result
- Original CI failure: confirmed (3 fail / 2780 pass / 2 skip).
- Source inspection: corrected test fixture contracts on PR #91.
- Focused tests and current-head CI: NOT RUN / not yet confirmed.
- Browser smoke: NOT RUN (outside this test-only fix).
