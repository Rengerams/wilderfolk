import type { WorldState } from './gameTypes';
import { TICKS_PER_HOUR } from './dayCycleClock';

export type VenueScheduleKind = 'tavern' | 'hotel';
export interface VenueSchedule { startHour: number; endHour: number }
export type VenueScheduleValidation =
  | { ok: true; status: 'accepted' | 'unchanged'; schedule: VenueSchedule }
  | { ok: false; status: 'blocked'; reason: string };

export const DEFAULT_TAVERN_SCHEDULE: VenueSchedule = Object.freeze({ startHour: 17, endHour: 23 });
export const DEFAULT_HOTEL_SCHEDULE: VenueSchedule = Object.freeze({ startHour: 6, endHour: 22 });

/**
 * One settler covers a venue service window up to this many hours; a window longer
 * than it needs an extra settler ("if its goes over 8 hrs a extra person should go
 * work at the place", clarified by the owner: "well 9 hrs also fin" — 9 hours is
 * still one person, so the divisor is 9, not 8).
 *
 * `getVenueAutoStaffingTarget` therefore returns `ceil(hours / 9)` bounded below by
 * one settler and above by the building's own crew cap: 1–9h → 1, 10–18h → 2, 19h+ → 3.
 *
 * The service window itself has **no length restriction** — the owner removed both the
 * old 18-hour cap and the 4-hour floor ("they should be no restrictrion for normal work
 * or hotel or cafe"). The only remaining bound is that a window cannot wrap through
 * midnight, so 23 hours (00:00–23:00) is the widest legal one and 1 hour the narrowest.
 */
export const STANDARD_WORK_HOURS = 9;

function defaultFor(kind: VenueScheduleKind): VenueSchedule {
  return kind === 'tavern' ? DEFAULT_TAVERN_SCHEDULE : DEFAULT_HOTEL_SCHEDULE;
}

function readSchedule(state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind): unknown {
  return kind === 'tavern' ? state.tavernSchedule : state.hotelSchedule;
}

export function getVenueSchedule(state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind): VenueSchedule {
  const raw = readSchedule(state, kind);
  if (!raw || typeof raw !== 'object') return { ...defaultFor(kind) };
  const candidate = raw as { startHour?: unknown; endHour?: unknown };
  const result = validateVenueSchedule(candidate.startHour, candidate.endHour);
  return result.ok ? result.schedule : { ...defaultFor(kind) };
}

/**
 * Validates candidate service hours. Pass the venue's current schedule to have an unchanged
 * window reported as `'unchanged'` rather than `'accepted'` — the panel uses that to say no
 * command will be sent (mirrors `workSchedule.validateWorkSchedule`).
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
  // No minimum and no maximum on purpose: the owner chooses how long a venue stays
  // open ("they should be no restrictrion for normal work or hotel or cafe"), and a
  // longer window is covered by an extra settler (see `STANDARD_WORK_HOURS`) rather
  // than refused. `endHour <= startHour` above is the only width limit that remains.
  if (currentSchedule && currentSchedule.startHour === startHour && currentSchedule.endHour === endHour) {
    return { ok: true, status: 'unchanged', schedule: { startHour, endHour } };
  }
  return { ok: true, status: 'accepted', schedule: { startHour, endHour } };
}

export function setVenueSchedule(state: WorldState, kind: VenueScheduleKind, startHour: number, endHour: number): WorldState {
  const current = getVenueSchedule(state, kind);
  const result = validateVenueSchedule(startHour, endHour);
  if (!result.ok || (current.startHour === startHour && current.endHour === endHour)) return state;
  const next = structuredClone(state);
  if (kind === 'tavern') next.tavernSchedule = result.schedule;
  else next.hotelSchedule = result.schedule;
  return next;
}

export function getVenueScheduleHours(schedule: VenueSchedule): number {
  return schedule.endHour - schedule.startHour;
}

/**
 * Minimum Auto staff a venue needs for its service window: one settler up to
 * `STANDARD_WORK_HOURS` (9) hours, then an extra one per further nine hours —
 * 1–9h → 1, 10–18h → 2, 19h+ → 3 — always bounded by the building's own crew cap.
 *
 * This is the "if its goes over 8 hrs a extra person should go work at the place"
 * rule; a venue open all day is covered by more staff, never refused.
 */
export function getVenueAutoStaffingTarget(
  state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>,
  kind: VenueScheduleKind,
  maxStaff: number,
): number {
  const hours = getVenueScheduleHours(getVenueSchedule(state, kind));
  return Math.min(maxStaff, Math.max(1, Math.ceil(hours / STANDARD_WORK_HOURS)));
}

/** Returns whether a venue worker's assigned shift is active for the current hour. */
export function isVenueWorkerServiceHour(
  state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>,
  kind: VenueScheduleKind,
  hour: number,
  workerIndex: number,
  workerCount: number,
): boolean {
  const schedule = getVenueSchedule(state, kind);
  const count = Math.max(1, workerCount);
  const duration = getVenueScheduleHours(schedule) / count;
  const start = schedule.startHour + workerIndex * duration;
  const end = Math.min(schedule.endHour, start + duration);
  return hour >= start && hour < end;
}

export function isVenueServiceHour(state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind, hour: number, festivalActive = false): boolean {
  if (kind === 'tavern' && festivalActive) return true;
  const schedule = getVenueSchedule(state, kind);
  return hour >= schedule.startHour && hour < schedule.endHour;
}

export function isVenueScheduleStartTick(state: Pick<WorldState, 'tick' | 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind): boolean {
  const schedule = getVenueSchedule(state, kind);
  return state.tick % (24 * TICKS_PER_HOUR) === schedule.startHour * TICKS_PER_HOUR;
}

export function getVenueScheduleLabel(schedule: VenueSchedule): string {
  return `${String(schedule.startHour).padStart(2, '0')}:00–${String(schedule.endHour).padStart(2, '0')}:00`;
}