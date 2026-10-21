# Full-year residence mirror diverges at day 180

- Bug: housed settlers disappear from their residence's occupants list
- Status: open
- Date discovered: 2026-10-22
- Version/build: 0.6.5.1, base 9bd92db
- Reporter: test failure investigation
- Area: Truth
- Owner module: residencyReconciliation / gameTick

## Status history

- 2026-10-22 — open: reproduced before the test-fixture and asset-case corrections.

## Observed behavior

The full-year integration scenario, seed 12345, fails its day-180 invariant checkpoint. Settlers 1096, 1658, 1720 and 2005 retain residenceBuildingId 1 but are absent from that building's occupants.

## Expected behavior

Every living eligible resident with a residence assignment appears in that residence's occupants at the tick boundary.

## Reproduction steps

1. Check out base 9bd92db and install locked dependencies.
2. Run `npm test -- unit fullYear.integration`.
3. Inspect the day-180 invariant assertion in the existing integration scenario.

## Evidence

The pre-fix wider run failed with `Simulation invariants at day 180` and the four missing-resident errors above. The test is unchanged in the fixture repair.

## Root cause

Not established. The residence assignment and its occupants mirror diverge; the failing assertion must remain enabled while the responsible write is traced.

## Save/migration impact

Not assessed. No save-format change is proposed.
