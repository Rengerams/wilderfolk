# Idle skill decay never fires at 18:00

- Bug: SIM-02 — The idle-skill decay loop was gated with isNewCalendarDayTick while tickDailyWorldEvents was invoked at 18:00, so it never executed. The audit held a non-active skill at 50 over 300 ticks.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 / inspected main (7 November 2026)
- Reporter: FULL-AUDIT-2026-11-07.md, audit ID SIM-02
- Area: Calendar and skills
- Owner module: src/game/skills.ts (decay) / src/game/tickLayerDaily.ts (schedule)
- Related branch: fix/a1-calendar-phase-regressions-20261107

## Status history
- 2026-11-07 — open: reproduced in the audit's code trace and recorded as SIM-02.
- 2026-11-07 — investigating: scheduling change committed on the fix branch; regression suite and CI initially unverified.
- 2026-11-07 — resolved: the real gameTick regression passed and all five GitHub Actions workflows were green at commit 3546fd55 (Node.js CI run 42409653516).

## Observed behavior
The idle-skill decay loop was gated with isNewCalendarDayTick while tickDailyWorldEvents was invoked at 18:00, so it never executed. The audit held a non-active skill at 50 over 300 ticks.

## Expected behavior
A non-active job skill decays by SKILL_IDLE_DECAY_PER_DAY at the new day boundary, while the active job remains excluded.

## Reproduction steps
Give an adult player settler a non-active skill of 50, run gameTick across midnight, then inspect the skill. Before this change the field remained 50.

## Evidence
7 November full audit, SIM-02; source-level mismatch between the 00:00-only calendar gate and the 18:00 caller.

## Root cause
The only call to decayIdleSkills sat behind isNewCalendarDayTick inside the 18:00 world-events owner.

## Fix / proposed fix
Moved the decay call to tickLayerDaily's 00:00 phase, retaining the existing skills.ts writer and active-job exemption.

## Save/migration impact
none (existing skill fields only)

## Verification result
- Focused regression: PASS — tests/calendarPhase.auditRegressions.test.ts — SIM-02 exact one-day decay (tests/calendarPhase.auditRegressions.test.ts: 3/3 passed).
- Typecheck/lint/build and affected tests: PASS — Node.js CI run 42409653516, 1,054 test cases (1,052 passed, 2 skipped at final revision).
- Required full 720-day A2 calendar gate: NOT RUN; scheduled as a separate audit action.
