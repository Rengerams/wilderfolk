# Full-year residence mirror diverges at day 180

- Bug: housed settlers disappear from their residence's occupants list
- Status: resolved
- Date discovered: 2026-10-22
- Version/build: 0.6.5.1, base 9bd92db
- Reporter: test failure investigation
- Area: Truth
- Owner module: groupEvents / rivalEvents

## Status history

- 2026-10-22 — open: reproduced before the test-fixture and asset-case corrections.
- 2026-10-22 — investigating: per-tick diagnostics found the first failure at tick 6200 (day 86.11). Living player settlers were assigned to a rival house.
- 2026-10-22 — resolved: removed physical rival camp founding and expansion; the full 360-day integration scenario passes with all assertions intact.

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

The obsolete founding path created a rival house, farm, well and settlers inside the village. Daily rival updates could expand that camp. Housing could select a rival house, while the player residence mirror correctly excluded it. The strategic map already held the rival settlement independently.

## Save/migration impact

No save-format change. On the next rival daily update, legacy camp buildings and local faction actors are retired, invalid player assignments to those buildings are cleared, and strategic population, diplomacy and pending raids are retained. Entity/building counters are never rewound.

## Fix

Founding creates strategic metadata only. Daily updates no longer construct camp buildings. Village camp hit tests and markers cover visiting groups only. Obsolete building creation callbacks and expansion helpers are removed.

## Verification result

The founding and expansion regressions fail before the fix and pass afterward. Legacy cleanup preserves strategic population and raid records. All 55 focused raid/frontier tests pass, and the seed-12345 full-year test completes all 360 days with zero invariant failures.
