# Invention Fair exact 60% probability boundary enters wrong outcome

- Bug: The standard-project roll at exactly 0.6 incorrectly returns `failure`, not `malfunction`.
- Status: investigating (source fix committed; CI verification pending)
- Severity: medium
- Date discovered: 2026-11-11
- Version/build: PR #142 head 443ef638d267b3c551f4b3b033b91025428c2800
- Reporter: affected Node.js CI on PR #142
- Area: Invention Fair deterministic outcome classification
- Owner module: `src/game/inventionFair.ts` — `rollInventionFairOutcome`
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/142

## Status history

- 2026-11-11 — investigating: CI reported one failed simulation outcome test out of 3,032, specifically expected `malfunction` but got `failure`.
- 2026-11-11 — investigating: integer-percentage thresholds and exact-boundary regression cases added; awaiting required CI verification.

## Observed behavior

The standard project has success/failure/comic/danger weights of 20%/40%/30%/10%. The old code compares the roll against `0.20 + 0.40`, which JavaScript computes as `0.6000000000000001`. A roll of exactly `0.6` is therefore considered below the failure cutoff and incorrectly classified as `failure`.

## Expected behavior

Cumulative boundaries are exact: 0.0–<0.2 success, 0.2–<0.6 useful failure, 0.6–<0.9 comic malfunction, and 0.9–<1.0 dangerous failure. Adjacent tiers, including the high-risk project's 0.5 and 0.7 boundaries, must agree with the same contract.

## Reproduction steps

1. Run `npm test -- unit inventionFair.simulation` against pre-fix PR #142.
2. The test `uses the exact specified four outcome bands for every project` asserts `rollInventionFairOutcome('standard', 0.6) === 'malfunction'`.
3. The observed result is `failure`; the suite fails at line 128 of `tests/inventionFair.simulation.test.ts`.

## Evidence

- CI: 452 affected test files, 451 passed, 1 failed; 3,029 tests passed, 1 failed, 2 skipped.
- Direct arithmetic evidence: `0.2 + 0.4 === 0.6000000000000001`.
- Source owner: `rollInventionFairOutcome` in `src/game/inventionFair.ts`.

## Root cause

Binary floating-point summation of fractional probability weights shifts the 60% cumulative cutoff slightly upward.

## Fix / proposed fix

Store the four weights as **integer percentages** (e.g., `[20, 40, 30, 10]`) in the single existing project table, compare the 0–100-scaled RNG roll against integer cumulative cutoffs, and test immediately before and exactly at critical boundaries. No alternative RNG or independent probability system is introduced.

## Save/migration impact

None. The saved event project identifier and outcome strings are unchanged. The RNG continues returning 0–1 floats. Only the threshold representation used to classify the same intended probability bands changes.

## Verification result

- Failing pre-fix CI: **FAIL**, as above.
- Regression additions: **COMMITTED**, execution pending.
- Standard/production build, calendar scheduler and 120-day simulation on fixed head: **PENDING**.
