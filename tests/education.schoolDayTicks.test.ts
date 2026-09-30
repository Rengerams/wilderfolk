/**
 * F1 of the 2026-09-16 lifecycle/social audit (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`):
 * `creditChildSchoolDay` compared the `schoolTicksToday` **tick** counter against a **hours**
 * threshold (`WORK_HOURS_PER_DAY * 0.5` = 5.5), so a child who sat in class for ~1.7 in-game hours
 * was credited a whole school day and `schoolDays` accrued ~3.3× too fast.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { SCHOOL_DAY_MIN_HOURS, SCHOOL_DAY_MIN_TICKS, creditChildSchoolDay } from '../src/game/education';
import { TICKS_PER_HOUR, WORK_HOURS_PER_DAY } from '../src/game/dayCycle';

function child(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 1,
    type: EntityType.Human,
    name: 'Kid',
    alive: true,
    isJuvenile: true,
    ...overrides,
  } as Entity;
}

describe('school-day credit threshold (F1)', () => {
  it('expresses half a school day in ticks, not in hours', () => {
    expect(SCHOOL_DAY_MIN_HOURS).toBe(WORK_HOURS_PER_DAY * 0.5);
    expect(SCHOOL_DAY_MIN_TICKS).toBe(Math.floor(WORK_HOURS_PER_DAY * 0.5 * TICKS_PER_HOUR));
    // 5.5 in-game hours at 3 ticks/hour.
    expect(SCHOOL_DAY_MIN_TICKS).toBe(16);
  });

  it('does not credit a school day for a short visit', () => {
    const kid = child({ schoolTicksToday: 5 });
    creditChildSchoolDay(kid);
    expect(kid.schoolDays ?? 0).toBe(0);
    expect(kid.schoolTicksToday).toBe(0);
  });

  it('credits one school day after half a school day of attendance', () => {
    const kid = child({ schoolTicksToday: SCHOOL_DAY_MIN_TICKS });
    creditChildSchoolDay(kid);
    expect(kid.schoolDays).toBe(1);
    expect(kid.schoolTicksToday).toBe(0);
  });

  it('does not credit twice for the same day', () => {
    const kid = child({ schoolTicksToday: SCHOOL_DAY_MIN_TICKS });
    creditChildSchoolDay(kid);
    creditChildSchoolDay(kid);
    expect(kid.schoolDays).toBe(1);
  });
});
