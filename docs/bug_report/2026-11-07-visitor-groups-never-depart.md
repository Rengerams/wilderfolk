# Visitor groups neither advance nor depart

- Bug: TEST-16 — Visitor group day counters and the daily gift logic rely on isNewCalendarDayTick, but the sole tickVisitorGroups call was in the 18:00 world-events phase.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 / inspected main (7 November 2026)
- Reporter: FULL-AUDIT-2026-11-07.md, audit ID TEST-16
- Area: Calendar and visitors
- Owner module: src/game/groupEvents.ts (visitor lifecycle) / src/game/tickLayerDaily.ts (schedule)
- Related branch: fix/a1-calendar-phase-regressions-20261107

## Status history
- 2026-11-07 — open: reproduced in the audit's code trace and recorded as TEST-16.
- 2026-11-07 — investigating: scheduling change committed on the fix branch; regression suite and CI initially unverified.
- 2026-11-07 — resolved: the real gameTick regression passed and all five GitHub Actions workflows were green at commit 3546fd55 (Node.js CI run 42409653516).

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
- Focused regression: PASS — tests/calendarPhase.auditRegressions.test.ts — TEST-16 gifts, countdown, departure (tests/calendarPhase.auditRegressions.test.ts: 3/3 passed).
- Typecheck/lint/build and affected tests: PASS — Node.js CI run 42409653516, 1,054 test cases (1,052 passed, 2 skipped at final revision).
- Required full 720-day A2 calendar gate: NOT RUN; scheduled as a separate audit action.
