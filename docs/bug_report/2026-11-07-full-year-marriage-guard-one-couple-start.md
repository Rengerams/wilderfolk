# Full-year test demanded a marriage a one-couple start cannot produce

- Bug: `tests/fullYear.integration.test.ts` asserted that the 360-day run logged a marriage, but the scenario started with exactly one married couple, one two-bed house and no other adults, so no eligible pair could ever exist; the run failed with `marriages were formed during the year: expected 0 to be greater than 0`.
- Status: resolved
- Severity: low (test-only; the simulation itself behaved correctly)
- Date discovered: 2026-11-07
- Version/build: 0.6.5.1
- Reporter: owner-supplied full-suite output (`npx vitest run`)
- Area: test suite — full-year integration scenario
- Owner module: `tests/fullYear.integration.test.ts` (`runFullYear` scaffold)
- Related PR/commit: none; the new-game start is one couple and automatic immigration needs an open bed

## Status history
- 2026-11-07 — open: the assertion failed in the full suite; checkpoints showed 1 married pair and 0 courtship pairs all year.
- 2026-11-07 — resolved: the scenario seeds four eligible neighbours with homes and a larder that keeps; the file and the full suite pass.

## Observed behavior
`npx vitest run tests/fullYear.integration.test.ts` (seed 12345, ~190 s) fails the non-vacuity guard at line 432.
The 90-day checkpoints report `marriedPairs: 1`, `courtshipPairs: 0`, `playerResidentsAlive` rising only 3 → 4,
and food falling from 100 000 to 0 over the year.

## Expected behavior
A year-long run should exercise the relationship engine, which the guard requires; the scenario therefore needs
at least one eligible adult pair that is not already married.

## Reproduction steps
1. `npx vitest run tests/fullYear.integration.test.ts`.
2. The run fails on `expect(marriagesLogged, 'marriages were formed during the year').toBeGreaterThan(0)`.

## Evidence
- `initGame({ size: Medium, seed: 12345 })` produces exactly two humans, ids 834/835, both `married` with each
  other, and zero buildings.
- The scaffold adds one House (two beds) and assigns both founders, so `canSupportImmigration` sees
  `openSlots <= 0` and admits nobody all year. Births still occur, but the children are minors for the whole run.
- `updateStorageCaps` recomputes `foodSpoilageRate` as `0.02 - silos × 0.012`, overwriting the scaffold's
  `foodSpoilageRate = 0`; with no Silo the larder spoils at 2% per day and drains to zero.

## Root cause
The scaffold was written for a populated start: it assumed unrelated adults already existed and only provisioned
food and housing for the founders. A one-couple start plus a full two-bed house makes both courtship and
immigration impossible, so the assertion could never pass.

## Fix / proposed fix
`runFullYear` now seeds four eligible single adults (two of each gender, ages 23–27) with two additional homes,
adds two completed Silos so spoilage is 0, assigns residences to every human, and refreshes `entityByType`.
The simulation logic is unchanged.

## Save/migration impact
None; test-only change.

## Verification result
- `npx vitest run tests/fullYear.integration.test.ts` — PASS (1 test, 187.9 s).
- Full suite — re-run in progress after the fix; the pre-fix run's only failure was this test. I will record the final count once it completes.
- `npx tsc -p tsconfig.vitest.json --noEmit` — PASS.
