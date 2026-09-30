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

  it('has no length restriction — the owner chooses how long a venue stays open', () => {
    // Owner, 2026-09-29: "i choose how long the tavern should be open",
    // "if want them to work 12 hrs the system shouldnt stop", and
    // "they should be no restrictrion for normal work or hotel or cafe".
    // The old 18-hour cap refused the 19-hour (04:00-23:00) tavern from the owner's
    // screenshot, and the old 4-hour floor refused a short evening. Both are gone.
    expect(validateVenueSchedule(4, 23)).toEqual({
      ok: true,
      status: 'accepted',
      schedule: { startHour: 4, endHour: 23 },
    });
    expect(validateVenueSchedule(0, 23).ok).toBe(true); // widest legal
    expect(validateVenueSchedule(8, 20).ok).toBe(true); // the 12-hour case
    expect(validateVenueSchedule(17, 23).ok).toBe(true); // the shipped default
    expect(validateVenueSchedule(20, 22).ok).toBe(true); // 2h, under the old floor
    expect(validateVenueSchedule(21, 22).ok).toBe(true); // 1h, the narrowest legal
    // Only two things are still refused: a non-hour, and a window that wraps or is empty.
    expect(validateVenueSchedule(23, 24).ok).toBe(false);
    expect(validateVenueSchedule(22, 4).ok).toBe(false); // wrap
    expect(validateVenueSchedule(9, 9).ok).toBe(false); // empty
  });

  it('round-trips a long window through getVenueSchedule rather than reverting to the default', () => {
    // A regression guard for the silent-fallback path: `getVenueSchedule` returns the
    // canonical default whenever the stored value fails validation, so a cap that
    // rejected long windows also made a saved long window read back as 17:00-23:00.
    const stored = { tick: 0, tavernSchedule: { startHour: 4, endHour: 23 }, hotelSchedule: undefined };
    expect(getVenueSchedule(stored, 'tavern')).toEqual({ startHour: 4, endHour: 23 });
  });

  it('reports an unchanged window as unchanged so the panel can say no command is sent', () => {
    const current = { startHour: 17, endHour: 23 };

    expect(validateVenueSchedule(17, 23, current)).toEqual({
      ok: true,
      status: 'unchanged',
      schedule: current,
    });
    expect(validateVenueSchedule(18, 23, current).status).toBe('accepted');
    // Without the current window the owner cannot tell, and must stay 'accepted'.
    expect(validateVenueSchedule(17, 23).status).toBe('accepted');
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

  it('adds an extra settler only past the 9-hour window the owner set', () => {
    // Owner: "if its goes over 8 hrrs a extra person should go work at the place",
    // then "well 9 hrs also fin" — so 9 hours is still one settler and 10 is the
    // first window that needs a second. A venue open all day is staffed, not refused.
    const withTavern = (startHour: number, endHour: number) => ({
      ...base,
      tavernSchedule: { startHour, endHour },
    });
    expect(getVenueAutoStaffingTarget(withTavern(8, 17), 'tavern', 5)).toBe(1); // 9h
    expect(getVenueAutoStaffingTarget(withTavern(8, 18), 'tavern', 5)).toBe(2); // 10h
    expect(getVenueAutoStaffingTarget(withTavern(8, 20), 'tavern', 5)).toBe(2); // 12h
    expect(getVenueAutoStaffingTarget(withTavern(4, 23), 'tavern', 5)).toBe(3); // 19h
    // A short window still needs its one settler — the floor is one, not zero.
    expect(getVenueAutoStaffingTarget(withTavern(21, 22), 'tavern', 5)).toBe(1); // 1h
    // The building's own crew cap still wins over the rule.
    expect(getVenueAutoStaffingTarget(withTavern(4, 23), 'tavern', 2)).toBe(2);
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