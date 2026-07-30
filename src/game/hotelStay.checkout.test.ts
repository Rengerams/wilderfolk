/**
 * Hotel lodging must end at morning checkout, not a full day after check-in (EJ-12).
 */
import { describe, expect, it } from 'vitest';
import { hotelCheckoutTick } from './hotelStay';
import {
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  getAbsoluteCalendarDay,
  getHourOfDay,
  NIGHT_END,
} from './dayCycle';

describe('hotelCheckoutTick', () => {
  it('evening check-in checks out next morning, not next evening', () => {
    const evening = 19 * TICKS_PER_HOUR;
    const until = hotelCheckoutTick(evening);
    expect(getHourOfDay(until)).toBe(NIGHT_END);
    expect(getAbsoluteCalendarDay(until)).toBe(1);
    // Shorter than a full day after check-in (would be evening+TICKS_PER_DAY)
    expect(until - evening).toBeLessThan(TICKS_PER_DAY);
    expect(until).toBe(TICKS_PER_DAY + NIGHT_END * TICKS_PER_HOUR);
  });

  it('late-night check-in still leaves at dawn the same morning cycle', () => {
    // 02:00 is after previous dawn's "next" boundary logic → next 06:00 is same calendar day
    const lateNight = 2 * TICKS_PER_HOUR;
    const until = hotelCheckoutTick(lateNight);
    expect(getHourOfDay(until)).toBe(NIGHT_END);
    expect(getAbsoluteCalendarDay(until)).toBe(0);
    expect(until).toBe(NIGHT_END * TICKS_PER_HOUR);
  });
});
