# Visitor groups neither advance nor depart

- Bug: TEST-16 — Visitor group day counters and the daily gift logic rely on isNewCalendarDayTick, but the sole tickVisitorGroups call was in the 18:00 world-events phase.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 / inspected main (7 November 2026)
- Reporter: FULL-AUDIT-2026-11-07.md, audit ID TEST-16
- Area: Calendar and visitors
- Owner module: src/game/groupEvents.ts (visitor lifecycle) / src/game/tickLayerDaily.ts (schedule)
- Related branch: fix/a1-calendar-phase-regressions-20261107

## Status history
- 2026-11-07 — open: reproduced in the audit's code trace and recorded as TEST-16.
- 2026-11-07 — investigating: scheduling change committed on the fix branch; regression suite and CI are not yet verified.

## Observed behavior
Visitor group day counters and the daily gift logic rely on isNewCalendarDayTick, but the sole tickVisitorGroups call was in the 18:00 world-events phase.

## Expected behavior
Visitors gift and count down on each eligible day at 00:00, then depart once daysLeft reaches zero; arrival grace behavior remains unchanged.

## Reproduction steps
Seed a pilgrim camp with daysLeft=3 and spawnedAtCalendarDay=5, then run gameTick across days 7, 8 and 9. Previously neither daysLeft nor gifts changed.

## Evidence
7 November full audit, TEST-16; source-level mismatch between the 00:00-only calendar gate and the 18:00 caller.

## Root cause
tickVisitorGroups was scheduled only from an 18:00 function despite its new-calendar-day gate requiring midnight.

## Fix / proposed fix
Moved the existing visitor lifecycle call to the 00:00 phase; no change to visitor decision or grace period logic.

## Save/migration impact
none (uses existing visitorGroups save fields)

## Verification result
- Focused regression: NOT RUN at report creation. tests/calendarPhase.auditRegressions.test.ts — TEST-16 gifts, countdown, departure
- Typecheck/lint/build: NOT RUN at report creation; GitHub CI to provide the authoritative verdict.
