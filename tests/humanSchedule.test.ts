import { describe, expect, it } from 'vitest';
import {
  EVENING_START,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  WORK_END,
  WORK_START,
  isFestivalGatheringHour,
  isOnWorkShift,
  isTavernOpen,
  personDayRoll,
  prefersHomeTonight,
} from '../src/game/dayCycle';
import {
  EVENING_START as extractedEveningStart,
  isFestivalGatheringHour as extractedIsFestivalGatheringHour,
  isOnWorkShift as extractedIsOnWorkShift,
  isTavernOpen as extractedIsTavernOpen,
  personDayRoll as extractedPersonDayRoll,
  prefersHomeTonight as extractedPrefersHomeTonight,
} from '../src/game/humanSchedule';

describe('human schedule compatibility facade', () => {
  it('keeps public dayCycle schedule helpers connected to the extracted implementation', () => {
    expect(EVENING_START).toBe(extractedEveningStart);
    expect(isOnWorkShift).toBe(extractedIsOnWorkShift);
    expect(isTavernOpen).toBe(extractedIsTavernOpen);
    expect(isFestivalGatheringHour).toBe(extractedIsFestivalGatheringHour);
    expect(personDayRoll).toBe(extractedPersonDayRoll);
    expect(prefersHomeTonight).toBe(extractedPrefersHomeTonight);
  });

  it('preserves workday, festival, and deterministic daily-decision boundaries', () => {
    const monday = 7 * TICKS_PER_DAY;
    const saturday = 12 * TICKS_PER_DAY;

    expect(isOnWorkShift(monday + WORK_START * TICKS_PER_HOUR)).toBe(true);
    expect(isOnWorkShift(monday + WORK_END * TICKS_PER_HOUR)).toBe(false);
    expect(isOnWorkShift(saturday + WORK_START * TICKS_PER_HOUR)).toBe(false);
    expect(isTavernOpen(12, true)).toBe(true);
    expect(isFestivalGatheringHour(15, true)).toBe(true);
    expect(personDayRoll(42, monday, 103)).toBe(personDayRoll(42, monday + 17, 103));
  });
});
