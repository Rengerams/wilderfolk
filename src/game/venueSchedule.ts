import type { WorldState } from './gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './dayCycleClock';

export type VenueScheduleKind = 'tavern' | 'hotel';
export interface VenueSchedule { startHour: number; endHour: number }
export type VenueScheduleValidation =
  | { ok: true; status: 'accepted' | 'unchanged'; schedule: VenueSchedule }
  | { ok: false; status: 'blocked'; reason: string };

export const DEFAULT_TAVERN_SCHEDULE: VenueSchedule = Object.freeze({ startHour: 17, endHour: 23 });
export const DEFAULT_HOTEL_SCHEDULE: VenueSchedule = Object.freeze({ startHour: 6, endHour: 22 });

/**
 * One settler covers a venue service window up to this many hours; longer windows add a settler.
 * The window itself has no length limit beyond not wrapping through midnight.
 */
export const STANDARD_WORK_HOURS = 9;
/** An hour of shared handover when the hotel has multiple shifts. */
export const HOTEL_SHIFT_OVERLAP_HOURS = 1;

function defaultFor(kind: VenueScheduleKind): VenueSchedule {
  return kind === 'tavern' ? DEFAULT_TAVERN_SCHEDULE : DEFAULT_HOTEL_SCHEDULE;
}

function readSchedule(state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind): unknown {
  return kind === 'tavern' ? state.tavernSchedule : state.hotelSchedule;
}

export function getVenueSchedule(state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind): VenueSchedule {
  return normalizeVenueSchedule(readSchedule(state, kind), kind);
}

/**
 * Validates candidate service hours; pass the venue's current schedule to report an unchanged window
 * as `'unchanged'` rather than `'accepted'`.
 */
export function validateVenueSchedule(
  startHour: unknown,
  endHour: unknown,
  currentSchedule?: VenueSchedule,
): VenueScheduleValidation {
  if (typeof startHour !== 'number' || typeof endHour !== 'number' || !Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || startHour >= 24 || endHour < 0 || endHour >= 24) {
    return { ok: false, status: 'blocked', reason: 'Venue hours must use whole clock hours from 0 through 23.' };
  }
  if (endHour <= startHour) return { ok: false, status: 'blocked', reason: 'Venue service hours cannot wrap through midnight.' };
  // No minimum and no maximum on purpose: the owner chooses how long a venue stays open, and a
  // longer window is covered by an extra settler; `endHour <= startHour` is the only width limit.
  if (currentSchedule && currentSchedule.startHour === startHour && currentSchedule.endHour === endHour) {
    return { ok: true, status: 'unchanged', schedule: { startHour, endHour } };
  }
  return { ok: true, status: 'accepted', schedule: { startHour, endHour } };
}

/**
 * Parses a stored venue window, falling back to that venue's documented default when it is absent
 * or unusable — the contract `getVenueSchedule` already applies to a stored value at read time.
 */
export function normalizeVenueSchedule(value: unknown, kind: VenueScheduleKind): VenueSchedule {
  if (!value || typeof value !== 'object') return { ...defaultFor(kind) };
  const candidate = value as { startHour?: unknown; endHour?: unknown };
  const result = validateVenueSchedule(candidate.startHour, candidate.endHour);
  return result.ok ? result.schedule : { ...defaultFor(kind) };
}

export function setVenueSchedule(state: WorldState, kind: VenueScheduleKind, startHour: number, endHour: number): WorldState {
  const current = getVenueSchedule(state, kind);
  const result = validateVenueSchedule(startHour, endHour);
  if (!result.ok || (current.startHour === startHour && current.endHour === endHour)) return state;
  const next = { ...state };
  if (kind === 'tavern') next.tavernSchedule = result.schedule;
  else next.hotelSchedule = result.schedule;
  return next;
}

export function getVenueScheduleHours(schedule: VenueSchedule): number {
  return schedule.endHour - schedule.startHour;
}

/**
 * Minimum Auto staff for a service window: one settler up to `STANDARD_WORK_HOURS`, then one per
 * further `STANDARD_WORK_HOURS`; hotels reserve a one-hour handover. Always respect crew cap.
 */
export function getVenueAutoStaffingTarget(
  state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>,
  kind: VenueScheduleKind,
  maxStaff: number,
): number {
  const hours = getVenueScheduleHours(getVenueSchedule(state, kind));
  // Two 9h hotel shifts cover 17h with one hour handover; 18–23h
  // require a third hotelier for the same handover and max 9h/person.
  const required = kind === 'hotel'
    ? Math.ceil((hours - HOTEL_SHIFT_OVERLAP_HOURS) / (STANDARD_WORK_HOURS - HOTEL_SHIFT_OVERLAP_HOURS))
    : Math.ceil(hours / STANDARD_WORK_HOURS);
  return Math.min(maxStaff, Math.max(1, required));
}

/**
 * The slice of a venue's service window one crew place covers: taverns split evenly, hotels
 * stagger up to 9h shifts with a one-hour overlap.
 */
export function getVenueWorkerServiceWindow(
  state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>,
  kind: VenueScheduleKind,
  workerIndex: number,
  workerCount: number,
): VenueSchedule {
  const schedule = getVenueSchedule(state, kind);
  const count = Math.max(1, workerCount);
  const hours = getVenueScheduleHours(schedule);
  if (kind !== 'hotel') {
    // Tavern shifts are unchanged.
    const duration = hours / count;
    const start = schedule.startHour + workerIndex * duration;
    return { startHour: start, endHour: Math.min(schedule.endHour, start + duration) };
  }
  // Hotel workers never exceed 9 hours; distribute the crew across the whole window with up to an
  // hour of handover at each boundary (06–23 with two workers → 06–15 and 14–23).
  const desired = (hours + HOTEL_SHIFT_OVERLAP_HOURS * (count - 1)) / count;
  const duration = Math.min(STANDARD_WORK_HOURS, desired);
  const step = count === 1 ? 0 : (hours - duration) / (count - 1);
  const start = schedule.startHour + workerIndex * step;
  return { startHour: start, endHour: Math.min(schedule.endHour, start + duration) };
}

/** Returns whether a venue worker's assigned shift is active for the current hour. */
export function isVenueWorkerServiceHour(
  state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>,
  kind: VenueScheduleKind,
  hour: number,
  workerIndex: number,
  workerCount: number,
): boolean {
  const window = getVenueWorkerServiceWindow(state, kind, workerIndex, workerCount);
  return hour >= window.startHour && hour < window.endHour;
}

/** The festival keeps a tavern open all day, whatever its service window says. */
export function isFestivalOverrideActive(state: Pick<WorldState, 'festival'>, kind: VenueScheduleKind): boolean {
  return kind === 'tavern' && state.festival?.active === true;
}

export function isVenueServiceHour(state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind, hour: number, festivalActive = false): boolean {
  if (kind === 'tavern' && festivalActive) return true;
  const schedule = getVenueSchedule(state, kind);
  return hour >= schedule.startHour && hour < schedule.endHour;
}

export function isVenueScheduleStartTick(state: Pick<WorldState, 'tick' | 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind): boolean {
  const schedule = getVenueSchedule(state, kind);
  return state.tick % TICKS_PER_DAY === schedule.startHour * TICKS_PER_HOUR;
}

export function getVenueScheduleLabel(schedule: VenueSchedule): string {
  return `${String(schedule.startHour).padStart(2, '0')}:00–${String(schedule.endHour).padStart(2, '0')}:00`;
}