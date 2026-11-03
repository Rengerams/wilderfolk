import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { isWithinWorkCommuteLead } from '../src/game/workSchedule';

describe('work commute lead', () => {
  it('uses the fractional lead instead of waiting for the next whole hour', () => {
    const dayStart = TICKS_PER_DAY;
    expect(isWithinWorkCommuteLead(dayStart + 5 * TICKS_PER_HOUR, 7, 1.5)).toBe(false);
    expect(isWithinWorkCommuteLead(dayStart + 5.5 * TICKS_PER_HOUR, 7, 1.5)).toBe(true);
  });

  it('still leaves the full commute lead when it is a whole hour', () => {
    const dayStart = TICKS_PER_DAY;
    expect(isWithinWorkCommuteLead(dayStart + 5 * TICKS_PER_HOUR - 1, 7, 2)).toBe(false);
    expect(isWithinWorkCommuteLead(dayStart + 5 * TICKS_PER_HOUR, 7, 2)).toBe(true);
  });
});
