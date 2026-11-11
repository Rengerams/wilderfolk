import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_SCHEDULE } from '../src/game/workSchedule';
import { preShiftSleepPlan, shouldBeAtHomeFor } from '../src/game/humanSchedule';
import { isWorkScheduleHour } from '../src/game/workSchedule';
import { getAbsoluteCalendarDay, getHourOfDay, isWorkDay, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';

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

describe('sleep follows the next duty rather than a fixed 23:00 bedtime', () => {
  it('goes home before an early Monday watch and wakes before the two-hour commute', () => {
    const mondaySeven = 7 * TICKS_PER_DAY + 7 * TICKS_PER_HOUR;
    const sundayNine = 6 * TICKS_PER_DAY + 21 * TICKS_PER_HOUR;
    expect(preShiftSleepPlan(sundayNine, mondaySeven, 2)).toMatchObject({
      headHome: true, sleep: false, overrideNight: true,
    });
    expect(preShiftSleepPlan(sundayNine + TICKS_PER_HOUR, mondaySeven, 2).sleep).toBe(true);
    expect(preShiftSleepPlan(7 * TICKS_PER_DAY + 5 * TICKS_PER_HOUR, mondaySeven, 2).sleep).toBe(false);
  });

  it('sleeps during the afternoon before a 23:00 night duty', () => {
    const start = 6 * TICKS_PER_DAY + 23 * TICKS_PER_HOUR;
    expect(preShiftSleepPlan(start - 9 * TICKS_PER_HOUR, start, 1).headHome).toBe(true);
    expect(preShiftSleepPlan(start - 6 * TICKS_PER_HOUR, start, 1).sleep).toBe(true);
    expect(preShiftSleepPlan(start - TICKS_PER_HOUR, start, 1).sleep).toBe(false);
  });

  it('does not override ordinary sleep when the next duty is days away', () => {
    expect(preShiftSleepPlan(0, 3 * TICKS_PER_DAY, 1)).toEqual({
      headHome: false, sleep: false, overrideNight: false,
    });
  });
});
