# Human activity priority drift

- Status: investigating
- Severity: high
- Date discovered: 2026-11-28
- Version/build: 0.6.5.2 development
- Reporter: humanTick source audit
- Area: realtime human activity
- Owner modules: humanTick.ts (activity orchestration), workAbsence.ts (workplace duty)

## Status history
- 2026-11-28 — investigating: static evidence confirmed, shared-duty implementation and regression committed; execution pending.

## Observed behavior and evidence
The previous onJobShift omitted ordinary priest duty and official duty. Although attendance compensated at individual call sites, the festival and free-roam gates did not consistently recognize the same duties. An ordinary priest scheduled through 21:00 could gather at the festival at 18:00 instead of staying at work. Affair pursuit also did not exclude every gathering or escape branch. The noon schoolyard gate checked assignment but not actual classroom presence or school day. Overnight lover sleep read a mutable partner indoor ID during the sequential human pass.

## Expected behavior
One duty decision serves simulation and projections, with actual duty and commuting protected from discretionary movement. Schoolyard interactions require actual class attendance. The two lovers' prior indoor presence is observed before movement. All human walking uses the shared integration.

## Reproduction
Use the existing church fixture in tests/prisonFestivalWorkContinuity.test.ts, set a weekday colony shift of 12:00–21:00 and an active festival, then advance to 18:00. Check that the priest is inside the church and accrues duty. Other findings are static traces, not live-save reproductions.

## Fix
Consume resolveShift in tickHumans, including the prison watch and moon priest duty. Protect activity gates, snapshot valid overnight tryst presence, require school time and classroom/teacher presence at noon, and use the shared walk integration for prisoners and caravans without changing their road-speed policy.

## Save/migration impact
None; no persistent fields.

## Verification
Existing prison, venue, priest and school tests plus the extended priest/festival regression are applicable. Local test execution not available through the repository connector. CI and live-save verification pending. Hunter-specific attendance proof and peer selection for schoolyard bonds remain outside this change.
