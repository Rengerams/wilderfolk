import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_SCHEDULE } from '../src/game/workSchedule';
import { shouldBeAtHomeFor } from '../src/game/humanSchedule';
import { isWorkScheduleHour } from '../src/game/workSchedule';
import { getAbsoluteCalendarDay, getHourOfDay, isWorkDay, TICKS_PER_HOUR } from '../src/game/dayCycle';

describe('default work window', () => {
  it('uses the shipped 07–16 schedule instead of the old 07–18 window', () => {
    expect(DEFAULT_WORK_SCHEDULE).toEqual({ startHour: 7, endHour: 16 });
    expect(isWorkScheduleHour(DEFAULT_WORK_SCHEDULE, 7)).toBe(true);
    expect(isWorkScheduleHour(DEFAULT_WORK_SCHEDULE, 15)).toBe(true);
    expect(isWorkScheduleHour(DEFAULT_WORK_SCHEDULE, 16)).toBe(false);
    expect(isWorkScheduleHour(DEFAULT_WORK_SCHEDULE, 17)).toBe(false);
    expect(shouldBeAtHomeFor(DEFAULT_WORK_SCHEDULE, 16)).toBe(true);
    expect(shouldBeAtHomeFor(DEFAULT_WORK_SCHEDULE, 15)).toBe(false);
    expect(isWorkScheduleHour({ startHour: 6, endHour: 14 }, 13)).toBe(true);
    expect(isWorkScheduleHour({ startHour: 6, endHour: 14 }, 14)).toBe(false);
  });

  it('ends the scheduled shift at 16:00 on a workday', () => {
    const tick = Array.from({ length: TICKS_PER_HOUR * 24 * 8 }, (_, i) => i + 1)
      .find((candidate) => isWorkDay(candidate) && getHourOfDay(candidate) === 10);
    expect(tick).toBeDefined();
    if (tick == null) return;
    expect(isWorkDay(tick) && isWorkScheduleHour(DEFAULT_WORK_SCHEDULE, 15)).toBe(true);
    expect(isWorkDay(tick) && isWorkScheduleHour(DEFAULT_WORK_SCHEDULE, 16)).toBe(false);
    expect(getAbsoluteCalendarDay(tick)).toBeGreaterThanOrEqual(0);
  });
});
