import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import {
  DEFAULT_HOTEL_SCHEDULE,
  DEFAULT_TAVERN_SCHEDULE,
  getVenueSchedule,
  getVenueAutoStaffingTarget,
  isVenueWorkerServiceHour,
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

  it('calculates minimum Auto staffing from venue hours and the 9-hour standard', () => {
    expect(getVenueAutoStaffingTarget(base, 'tavern', 2)).toBe(1);
    expect(getVenueAutoStaffingTarget(base, 'hotel', 2)).toBe(2);
    expect(getVenueAutoStaffingTarget({ ...base, hotelSchedule: { startHour: 7, endHour: 16 } }, 'hotel', 2)).toBe(1);
  });

  it('splits Auto venue coverage into bounded worker shifts', () => {
    expect(isVenueWorkerServiceHour(base, 'hotel', 6, 0, 2)).toBe(true);
    expect(isVenueWorkerServiceHour(base, 'hotel', 13, 0, 2)).toBe(true);
    expect(isVenueWorkerServiceHour(base, 'hotel', 14, 0, 2)).toBe(false);
    expect(isVenueWorkerServiceHour(base, 'hotel', 14, 1, 2)).toBe(true);
    expect(isVenueWorkerServiceHour(base, 'hotel', 22, 1, 2)).toBe(false);
    expect(isVenueWorkerServiceHour(base, 'tavern', 17, 0, 1)).toBe(true);
    expect(isVenueWorkerServiceHour(base, 'tavern', 23, 0, 1)).toBe(false);
  });

  it('recognizes the configured start tick', () => {
    const state = { tick: 8 * 3, tavernSchedule: { startHour: 8, endHour: 14 }, hotelSchedule: undefined };
    expect(isVenueScheduleStartTick(state, 'tavern')).toBe(true);
    expect(isVenueScheduleStartTick({ ...state, tick: TICKS_PER_DAY }, 'tavern')).toBe(false);
  });
});
