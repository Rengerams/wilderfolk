# Immigration treats one-off food spending as recurring demand

- Bug: Immigration treats one-off food spending as recurring demand.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-08
- Version/build: PR #133 merged locally with main 0d7d9937
- Reporter: integration verification
- Area: pregnancy / immigration
- Owner module: src/game/economyLedger.ts; src/game/dailyPopulation.ts
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/133

## Status history
- 2026-11-08 — resolved: combined the current owners and verified targeted regressions.

## Observed behavior
A one-off recruitment expense can turn seven-day and monthly food history negative despite meal production being sustainable; a full family may fail where one arrival is affordable, and reputation capacity is not an assignable bed.

## Expected behavior
Keep all expenses in accounting but use meals for sustainability. Forecast the maximum of projected meal trend and population demand. Find an affordable party size bounded by actual unreserved beds and retain one daily admission roll.

## Reproduction steps
1. Inspect PR #133 against main 0d7d9937.
2. Exercise the short/long term or one-off recruitment scenarios in the regression files below.
3. Compare routing/medical verdicts or accepted party sizes against the owners’ rules.

## Evidence
Regression files: tests/dailyPopulation.foodAdmission.test.ts, tests/dailyImmigration.gridSync.test.ts, tests/economyLedger.foodFlow.test.ts, tests/immigration.composition.test.ts. The merged pregnancy implementation contained both exported stage functions before resolution.

## Root cause
The sustainability reader included every expense; forecasting added population and trend growth, while admission considered the largest party and reputation capacity.

## Fix / proposed fix
Keep all expenses in accounting but use meals for sustainability. Forecast the maximum of projected meal trend and population demand. Find an affordable party size bounded by actual unreserved beds and retain one daily admission roll.

## Save/migration impact
No new persisted or worker fields. Legacy pregnancies with absent progress continue advancing. No user save edited.

## Verification result
PASS: 172 tests across 14 relevant files, including the regression files above; npm run test:types. PASS: lint, import-cycle gate, source/docs/comments checks, function overlap and production bundle. PASS: existing producers harness, 30 days / 8,640 ticks with bot enabled, seed 12345: 31 settlers, zero homeless settlers, zero invariant violations, zero stalled ticks. Full npm run build remains blocked by the pre-existing missing duplicate-code baseline.
