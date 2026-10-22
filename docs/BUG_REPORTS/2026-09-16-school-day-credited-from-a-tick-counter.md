# A school day was credited from a tick counter compared against an hours threshold (≈3.3× too cheap)

- **Bug:** `creditChildSchoolDay` compared `schoolTicksToday` — a **tick** counter, incremented once per tick by `recordChildSchoolTick` — against `WORK_HOURS_PER_DAY * 0.5`, a threshold in **hours** (5.5). The effective requirement was 5 ticks ≈ 1.7 in-game hours, so a child who barely visited school was credited a whole school day and `schoolDays` accrued ~3.3× too fast
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** 2026-09-16 lifecycle/social audit, finding **F1** (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`); runtime-reproduced there and re-verified here
- **Area:** Truth (education progression) with a Play consequence (children graduate and mature far too early)
- **Owner module:** `src/game/education.ts` (`creditChildSchoolDay`, `recordChildSchoolTick`, the school constants)
- **Cadence:** daily credit, per-tick attendance counting (`humanTick.ts:780`)

## Status history

- 2026-09-16 — open (found by the lifecycle/social audit; its repro script showed `schoolTicksToday = 5` → `schoolDays = 1` while `4` credited nothing)
- 2026-09-16 — resolved (threshold converted to ticks in one named place; regression test added; suite, build, lint and the 360-day gate green)

## Observed behavior

```ts
// src/game/education.ts:166-172 (before)
export function creditChildSchoolDay(child: Entity): void {
  const ticks = child.schoolTicksToday ?? 0;
  if (ticks >= Math.floor(WORK_HOURS_PER_DAY * 0.5)) {   // 5.5 hours compared to a tick count
    child.schoolDays = (child.schoolDays ?? 0) + 1;
  }
  child.schoolTicksToday = 0;
}
```

With `TICKS_PER_HOUR = 3`, the requirement was 5 ticks ≈ 1.7 in-game hours. `schoolDays` therefore
reached `SCHOOL_MIN_DAYS_FOR_BOOST` (3) after three short visits, `SCHOOL_GRADUATION_DAYS` (15) and the
`applyEducationGraduation` tier bonuses arrived far earlier than designed, `getSchoolAgeMultiplier`
sped maturation up sooner, and `tryFormSchoolyardBond`'s `schoolDays % 5 === 0` gate fired on the
wrong cadence.

## Expected behavior

A school day is credited once the child has actually attended half a school day — 5.5 in-game hours,
i.e. 16 ticks at 3 ticks/hour — and attendance is counted in the unit it is stored in.

## Reproduction steps

1. Before the fix: `creditChildSchoolDay({ schoolTicksToday: 5 })` → `schoolDays = 1`.
2. `npx vitest run tests/education.schoolDayTicks.test.ts` — the "does not credit a school day for a
   short visit" case fails against the old expression.

## Evidence

- `src/game/education.ts:185` — `child.schoolTicksToday = (child.schoolTicksToday ?? 0) + 1;` (ticks).
- `src/game/humanSchedule.ts:24` — `WORK_HOURS_PER_DAY = WORK_END - WORK_START` = 11 (hours).
- `src/game/gameConstants.ts:83,87` — `TICKS_PER_HOUR: 3`, `TICKS_PER_DAY: 72`.
- No test referenced `schoolTicksToday` or `creditChildSchoolDay` before this fix, which is why the
  unit mismatch survived a fully green gate.

## Root cause

A unit mismatch at a single comparison: the stored counter is ticks, the constant it was compared
against is hours. Because both are plain numbers, neither the type system nor any existing test could
see it.

## Regression test

`tests/education.schoolDayTicks.test.ts` (4 tests):
- `SCHOOL_DAY_MIN_TICKS` is `SCHOOL_DAY_MIN_HOURS × TICKS_PER_HOUR` and equals 16;
- a 5-tick visit credits **no** school day (fails before the fix);
- exactly 16 ticks credits one day;
- a second credit for the same day adds nothing.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant
assertions satisfied. The change feeds the same `schoolDays` field, so no invariant or cadence moved;
education progression is simply slower and now matches the documented half-day rule.

## Save/migration impact

None. `schoolTicksToday` and `schoolDays` keep their meaning and their persisted shape; only the
threshold changed, and no save field is added or renamed.

## Verification result

- `npx vitest run tests/education.schoolDayTicks.test.ts tests/school.roster.test.ts tests/school.bonds.test.ts tests/school.gossip.test.ts tests/humanGraduation.education.test.ts` — passed (23 tests).
- `npm run build`, `npm run lint` (0 warnings / 0 errors on 321 files), `npm run test:types` — passed.
- `npm test` and `npm run test:full-year` — passed (see the batch verification in `CHANGELOG.md`).

## Related commits or files

- `src/game/education.ts` — new `SCHOOL_DAY_MIN_HOURS` / `SCHOOL_DAY_MIN_TICKS`, threshold uses the tick constant
- `tests/education.schoolDayTicks.test.ts` — new

## Fix

The hour threshold is converted once, in the module that owns the school rules:

```ts
export const SCHOOL_DAY_MIN_HOURS = WORK_HOURS_PER_DAY * 0.5;      // 5.5 h
export const SCHOOL_DAY_MIN_TICKS = Math.floor(SCHOOL_DAY_MIN_HOURS * TICKS_PER_HOUR);  // 16
```

and `creditChildSchoolDay` compares `ticks >= SCHOOL_DAY_MIN_TICKS`. Naming both makes the unit
unambiguous, so the next reader cannot repeat the mistake — and the audit's open question ("is a
school day half an attendance day or a short visit?") is now answered in the code the only way the
existing `WORK_HOURS_PER_DAY`-derived intent allows.
