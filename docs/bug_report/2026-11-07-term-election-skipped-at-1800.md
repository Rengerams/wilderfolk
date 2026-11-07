# Term elections skipped by 18:00-only rollover gate

- Bug: SIM-01 — The year rollover check lived in the 18:00 world-events phase, but year rollover is true only at 00:00. The audit reproduced a year-2 boundary with no election ceremony.
- Status: investigating
- Severity: critical
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 / inspected main (7 November 2026)
- Reporter: FULL-AUDIT-2026-11-07.md, audit ID SIM-01
- Area: Calendar and elections
- Owner module: src/game/dailyWorldEvents.ts (schedule) and src/game/villageLeadership.ts (ceremony)
- Related branch: fix/a1-calendar-phase-regressions-20261107

## Status history
- 2026-11-07 — open: reproduced in the audit's code trace and recorded as SIM-01.
- 2026-11-07 — investigating: scheduling change committed on the fix branch; regression suite and CI are not yet verified.

## Observed behavior
The year rollover check lived in the 18:00 world-events phase, but year rollover is true only at 00:00. The audit reproduced a year-2 boundary with no election ceremony.

## Expected behavior
Every eligible scheduled term election begins at the first 00:00 of its due year, without skipping ordinary vacancy elections.

## Reproduction steps
Use a world with eligible settlers, lastElectionYear=0, no pending election; set tick one below 2 * DAYS_PER_YEAR * TICKS_PER_DAY, year=1, dayInYear=359; call gameTick once; previously electionCeremony stayed null.

## Evidence
7 November full audit, SIM-01; source-level mismatch between the 00:00-only calendar gate and the 18:00 caller.

## Root cause
dailyWorldEvents.tickDailyWorldEvents ran at 18:00 while its yearRollover condition required dayInYear=0 and the previous calendar day greater than zero, which can be true only at 00:00.

## Fix / proposed fix
Moved year-boundary scheduling to tickYearBoundaryWorldEvents called at midnight by tickLayerDaily; the existing villageLeadership term starter remains the sole ceremony owner.

## Save/migration impact
none (no save schema changes)

## Verification result
- Focused regression: NOT RUN at report creation. tests/calendarPhase.auditRegressions.test.ts — SIM-01 real gameTick transition
- Typecheck/lint/build: NOT RUN at report creation; GitHub CI to provide the authoritative verdict.
