# Pre-existing issues exposed by performance validation

- Bug: save residence duplication and existing validation fixture mismatches
- Status: open
- Date discovered: 2026-10-20
- Version/build: base 46b4890, version 0.6.5.1
- Reporter: performance validation
- Area: save/migration

## Status history

- 2026-10-20 — open: reproduced on the unchanged base while validating the performance pass.
- 2026-10-20 — residence duplication repaired in the leader-house follow-up; the supplied day-267 roundtrip now reports zero invariant errors. Test fixture mismatches remain open.

## Observed behavior

1. Roundtripping the supplied day-267 save retains player population but produces 16 residence invariant errors: eight humans are listed at both residence zero and another residence. The unchanged base and optimized run produce identical errors. Other supplied saves produce 8 or 16 errors.
2. The yearly-spawn grid test cannot find a spawn-bearing seed in its fixture search. The same failure reproduces on the base checkout.
3. Two worker-boundary closure tests compare an undefined authoritative grave-record list with the display's empty list. Both failures reproduce on the base checkout.

4. The residency day-boundary budget suite fails its end-of-day fixed-point assertion on both the base and final code (one of six cases). Its other five checks pass.

## Expected behavior

Save reload preserves unique residence membership. Existing regression fixtures produce the states their assertions require, and worker boundary tests use the declared optional-list semantics without concealing actual data loss.

## Reproduction steps

1. Run the existing population harness with the supplied day-267 save, `PERF_TICKS=72`, `PERF_WARMUP=12`, `PERF_ROUNDTRIP=1`; inspect the roundtrip invariant errors.
2. Run `node scripts/test.mjs unit tests/dailySpawn.gridSync.test.ts` on base 46b4890.
3. Run `node scripts/test.mjs unit tests/workerBoundary.closure.test.ts` on the same base.

## Evidence

The committed performance JSON records roundtrip errors for the unchanged base and optimized runs. The yearly-spawn test fails 1 of 3 cases; worker-boundary closure fails 2 of 6. The housing day-boundary suite also fails its fixed-point case on the base checkout. These failures were not skipped, deleted or weakened in the performance change.
