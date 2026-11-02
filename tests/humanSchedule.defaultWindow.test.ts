import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_SCHEDULE } from '../src/game/workSchedule';
import {
  LEGACY_WINDOW,
  WORK_END,
  WORK_START,
  isOnWorkShift,
  isWorkHour,
  isWorkHourFor,
  shouldBeAtHome,
} from '../src/game/humanSchedule';
import { getAbsoluteCalendarDay, getHourOfDay, isWorkDay, TICKS_PER_HOUR } from '../src/game/dayCycle';

describe('default work window', () => {
  it('uses the shipped 07–16 schedule instead of the old 07–18 window', () => {
    expect(WORK_START).toBe(DEFAULT_WORK_SCHEDULE.startHour);
    expect(WORK_END).toBe(DEFAULT_WORK_SCHEDULE.endHour);
    expect(LEGACY_WINDOW).toEqual(DEFAULT_WORK_SCHEDULE);
    expect(isWorkHour(7)).toBe(true);
    expect(isWorkHour(15)).toBe(true);
    expect(isWorkHour(16)).toBe(false);
    expect(isWorkHour(17)).toBe(false);
    expect(shouldBeAtHome(16)).toBe(true);
    expect(shouldBeAtHome(15)).toBe(false);
    expect(isWorkHourFor({ startHour: 6, endHour: 14 }, 13)).toBe(true);
    expect(isWorkHourFor({ startHour: 6, endHour: 14 }, 14)).toBe(false);
  });

  it('ends the scheduled shift at 16:00 on a workday', () => {
    const tick = Array.from({ length: TICKS_PER_HOUR * 24 * 8 }, (_, i) => i + 1)
      .find((candidate) => isWorkDay(candidate) && getHourOfDay(candidate) === 10);
    expect(tick).toBeDefined();
    if (tick == null) return;
    expect(isOnWorkShift(tick, 15)).toBe(true);
    expect(isOnWorkShift(tick, 16)).toBe(false);
    expect(getAbsoluteCalendarDay(tick)).toBeGreaterThanOrEqual(0);
  });
});
