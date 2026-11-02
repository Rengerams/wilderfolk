# Career workday credit lags midnight attendance settlement

- Bug: Real work shifts are recorded by the attendance owner at midnight but career history is not credited until the following noon production pass, twelve in-game hours later.
- Status: investigating — gameplay fix committed, CI verification pending
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: PR #118, large-colony benchmark run 41371714383
- Reporter: user and GitHub Actions
- Area: career history, daily work attendance, population benchmark
- Owner modules: `src/game/dailyScheduleFatigue.ts`, `src/game/careers/careerHistory.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/118

## Observed behavior

The 1,800-resident benchmark recorded 1,441 workers with settled attendance at tick 576 (the second midnight), but zero credited career days at the end of its two-day run. The next midday production pass would grant those credits, making the benchmark horizon appear too short. This is a real scheduling defect, not a reason to lengthen the test.

## Expected behavior

A verified shift counts toward career history at the midnight that closes the worked day. The credit uses the just-completed day's absolute day, verified site and profession, and positive observed hours. No credit is inferred from job assignment, production output, or full stores.

## Root cause

`resolveDailyVillageScheduleFatigue` settles `scheduleWorkedTicksToday` at 00:00, but `dailyBuildingEconomy.tickBuildingProduction` reads that snapshot at 12:00 to invoke `recordCareerWork`. Work performed the prior day thus remains uncredited for twelve in-game hours, including through the large benchmark's end-of-day checkpoint.

## Fix

- Move the dispatch of the existing sole career writer and milestone owner into the existing midnight attendance settlement loop.
- Pass the existing `ctx.buildingById` index from `tickLayerDaily`; do not add another population or building scan.
- Validate the witnessed site, profession and hours against the completed workplace as before.
- Recognize player settlers temporarily in Moon Howler form as owners of their witnessed prior human shifts without admitting foreign factions.
- Remove only the delayed career-write block from noon production; production still reads the settled attendance snapshot.
- Preserve the strict genuine-work audit in the three-day 1,800-resident benchmark now on main; the midnight production defect remains independently fixed.

## Verification

- Source-level pipeline and regression tests updated for immediate midnight credit, full stores, idempotence and transformed human shifts.
- GitHub CI and real 1,800-resident three-day verification: pending.
- No save schema or migrations changed.
