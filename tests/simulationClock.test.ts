import { describe, expect, it } from 'vitest';
import {
  isNewCalendarDayTick,
  isProductionTick,
  isStartOfClockHour,
  nextTickAtClockHour,
  ticksForDays,
} from '../src/game/dayCycle';
import {
  isNewCalendarDayTick as extractedIsNewCalendarDayTick,
  isProductionTick as extractedIsProductionTick,
  isStartOfClockHour as extractedIsStartOfClockHour,
  nextTickAtClockHour as extractedNextTickAtClockHour,
  ticksForDays as extractedTicksForDays,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '../src/game/dayCycleClock';

describe('simulation clock compatibility facade', () => {
  it('keeps the existing dayCycle imports connected to the extracted helpers', () => {
    expect(ticksForDays).toBe(extractedTicksForDays);
    expect(nextTickAtClockHour).toBe(extractedNextTickAtClockHour);
    expect(isStartOfClockHour).toBe(extractedIsStartOfClockHour);
    expect(isProductionTick).toBe(extractedIsProductionTick);
    expect(isNewCalendarDayTick).toBe(extractedIsNewCalendarDayTick);
  });

  it('preserves exact hour and calendar boundary behavior', () => {
    expect(isStartOfClockHour(7 * TICKS_PER_HOUR)).toBe(true);
    expect(isStartOfClockHour(7 * TICKS_PER_HOUR + 1)).toBe(false);
    expect(nextTickAtClockHour(7 * TICKS_PER_HOUR, 7)).toBe(TICKS_PER_DAY + 7 * TICKS_PER_HOUR);
    expect(isNewCalendarDayTick({ tick: TICKS_PER_DAY, lastProcessedCalendarDay: 0 })).toBe(true);
    expect(isNewCalendarDayTick({ tick: TICKS_PER_DAY, lastProcessedCalendarDay: 1 })).toBe(false);
  });
});
