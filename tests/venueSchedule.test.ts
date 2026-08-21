import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import {
  DEFAULT_HOTEL_SCHEDULE,
  DEFAULT_TAVERN_SCHEDULE,
  getVenueSchedule,
  isVenueServiceHour,
  isVenueScheduleStartTick,
  setVenueSchedule,
  validateVenueSchedule,
} from '../src/game/venueSchedule';

const base = { tick: 0, tavernSchedule: undefined, hotelSchedule: undefined };

describe('independent venue schedules', () => {
  it('uses the canonical legacy-compatible defaults', () => {
    expect(getVenueSchedule(base, 'tavern')).toEqual(DEFAULT_TAVERN_SCHEDULE);
    expect(getVenueSchedule(base, 'hotel')).toEqual(DEFAULT_HOTEL_SCHEDULE);
  });

  it('rejects wrapping and out-of-bounds service windows', () => {
    expect(validateVenueSchedule(22, 4).ok).toBe(false);
    expect(validateVenueSchedule(-1, 8).ok).toBe(false);
    expect(validateVenueSchedule(8, 23).ok).toBe(true);
  });

  it('keeps Tavern festival override local to Tavern', () => {
    expect(isVenueServiceHour(base, 'tavern', 9, true)).toBe(true);
    expect(isVenueServiceHour(base, 'hotel', 23, true)).toBe(false);
  });

  it('stores Tavern and Hotel windows independently', () => {
    const tavern = setVenueSchedule(base as never, 'tavern', 12, 20);
    const both = setVenueSchedule(tavern as never, 'hotel', 8, 18);
    expect(getVenueSchedule(both, 'tavern')).toEqual({ startHour: 12, endHour: 20 });
    expect(getVenueSchedule(both, 'hotel')).toEqual({ startHour: 8, endHour: 18 });
  });

  it('recognizes the configured start tick', () => {
    const state = { tick: 8 * 3, tavernSchedule: { startHour: 8, endHour: 14 }, hotelSchedule: undefined };
    expect(isVenueScheduleStartTick(state, 'tavern')).toBe(true);
    expect(isVenueScheduleStartTick({ ...state, tick: TICKS_PER_DAY }, 'tavern')).toBe(false);
  });
});
