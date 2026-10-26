/**
 * F1 of the 2026-09-16 lifecycle/social audit (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`):
 * `creditChildSchoolDay` compared the `schoolTicksToday` **tick** counter against a **hours**
 * threshold (`WORK_HOURS_PER_DAY * 0.5` = 5.5), so a child who sat in class for ~1.7 in-game hours
 * was credited a whole school day and `schoolDays` accrued ~3.3× too fast.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { SCHOOL_DAY_MIN_HOURS, SCHOOL_DAY_MIN_TICKS, SCHOOL_HOURS_PER_DAY, isSchoolTime, creditChildSchoolDay, recordChildSchoolTick } from '../src/game/education';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';

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
    expect(SCHOOL_DAY_MIN_HOURS).toBe(SCHOOL_HOURS_PER_DAY * 0.5);
    expect(SCHOOL_DAY_MIN_TICKS).toBe(Math.floor(SCHOOL_HOURS_PER_DAY * 0.5 * TICKS_PER_HOUR));
    // Three in-game hours at twelve ticks per hour.
    expect(SCHOOL_DAY_MIN_TICKS).toBe(36);
  });

  it('runs classes from 09:00 until 15:00', () => {
    expect(isSchoolTime(0, 8)).toBe(false);
    expect(isSchoolTime(0, 9)).toBe(true);
    expect(isSchoolTime(0, 14)).toBe(true);
    expect(isSchoolTime(0, 15)).toBe(false);
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

/**
 * 2026-10-22: a school day needs the teacher in the classroom as well as the
 * pupil — the credit is gated on a teacher standing at the school, not only on
 * a staffed building the child happens to be at.
 */
describe('school-day credit needs the teacher there', () => {
  /** A workday tick inside class hours, found through the owner's own rule. */
  function classTick(): number {
    for (let day = 1; day < 10; day++) {
      const tick = day * TICKS_PER_DAY + 10 * TICKS_PER_HOUR;
      if (isSchoolTime(tick, 10)) return tick;
    }
    throw new Error('no workday class tick found');
  }

  function school(occupants: number[]): Building {
    return {
      id: 50,
      type: BuildingType.School,
      completed: true,
      occupants,
      x: 100,
      y: 100,
      width: 20,
      height: 20,
    } as unknown as Building;
  }

  /** A pupil standing exactly where the tick sends them at this school. */
  function pupilAt(target: Building): Entity {
    const spot = humanBuildingTarget(target, 1, false);
    return child({ x: spot.x, y: spot.y });
  }

  it('credits a classroom tick while the teacher is there', () => {
    const target = school([900]);
    const kid = pupilAt(target);
    recordChildSchoolTick(kid, target, 10, true, classTick());
    expect(kid.schoolTicksToday).toBe(1);
  });

  it('credits nothing while no teacher is at the school', () => {
    const target = school([900]);
    const kid = pupilAt(target);
    recordChildSchoolTick(kid, target, 10, false, classTick());
    expect(kid.schoolTicksToday ?? 0).toBe(0);
  });

  it('credits nothing for a child who is not at the school', () => {
    const target = school([900]);
    const kid = child({ x: 900, y: 900 });
    recordChildSchoolTick(kid, target, 10, true, classTick());
    expect(kid.schoolTicksToday ?? 0).toBe(0);
  });

  it('credits nothing outside the class hours', () => {
    const target = school([900]);
    const kid = pupilAt(target);
    recordChildSchoolTick(kid, target, 20, true, classTick());
    expect(kid.schoolTicksToday ?? 0).toBe(0);
  });
});
