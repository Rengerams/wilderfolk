# Pregnancy merge introduced competing hospital thresholds

- Bug: Pregnancy merge introduced competing hospital thresholds.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-08
- Version/build: PR #133 merged locally with main 0d7d9937
- Reporter: integration verification
- Area: pregnancy / immigration
- Owner module: src/game/simulation/humanLifecycle.ts; src/game/hospitalCare.ts
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/133

## Status history
- 2026-11-08 — resolved: combined the current owners and verified targeted regressions.

## Observed behavior
The merge of PR #133 and current main leaves both a nominal-term isPregnancyHospitalDue and a personal-term isPregnancyHospitalStage. Routing and care can disagree.

## Expected behavior
Keep main’s existing isPregnancyHospitalDue entrypoint and compute it from the individual due progress. Medical needs and urgency use the same owner; main retains staffed-ward routing, verified admission status, duty-hour accounting and birth-key genetics. Preserve nominal UI progress above 100%.

## Reproduction steps
1. Inspect PR #133 against main 0d7d9937.
2. Exercise the short/long term or one-off recruitment scenarios in the regression files below.
3. Compare routing/medical verdicts or accepted party sizes against the owners’ rules.

## Evidence
Regression files: tests/humanLifecycle.test.ts, tests/hospitalWalk.regression.test.ts, tests/pregnancyHospitalWork.test.ts, tests/settlers.indoors.test.ts, tests/workAbsence.reasons.test.ts. The merged pregnancy implementation contained both exported stage functions before resolution.

## Root cause
Two branches introduced equivalent hospital-stage responsibilities with different due-date calculations.

## Fix / proposed fix
Keep main’s existing isPregnancyHospitalDue entrypoint and compute it from the individual due progress. Medical needs and urgency use the same owner; main retains staffed-ward routing, verified admission status, duty-hour accounting and birth-key genetics. Preserve nominal UI progress above 100%.

## Save/migration impact
No new persisted or worker fields. Legacy pregnancies with absent progress continue advancing. No user save edited.

## Verification result
PASS: 172 tests across 14 relevant files, including the regression files above; npm run test:types. PASS: lint, import-cycle gate, source/docs/comments checks, function overlap and production bundle. PASS: existing producers harness, 30 days / 8,640 ticks with bot enabled, seed 12345: 31 settlers, zero homeless settlers, zero invariant violations, zero stalled ticks. Full npm run build remains blocked by the pre-existing missing duplicate-code baseline.
