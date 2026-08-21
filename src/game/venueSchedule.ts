import type { WorldState } from './gameTypes';
import { TICKS_PER_HOUR, getHourOfDay } from './dayCycleClock';

export type VenueScheduleKind = 'tavern' | 'hotel';
export interface VenueSchedule { startHour: number; endHour: number }
export type VenueScheduleValidation =
  | { ok: true; status: 'accepted' | 'unchanged'; schedule: VenueSchedule }
  | { ok: false; status: 'blocked'; reason: string };

export const DEFAULT_TAVERN_SCHEDULE: VenueSchedule = Object.freeze({ startHour: 17, endHour: 23 });
export const DEFAULT_HOTEL_SCHEDULE: VenueSchedule = Object.freeze({ startHour: 6, endHour: 22 });
export const MIN_VENUE_SERVICE_HOURS = 4;
export const MAX_VENUE_SERVICE_HOURS = 18;

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

export function validateVenueSchedule(startHour: unknown, endHour: unknown): VenueScheduleValidation {
  if (typeof startHour !== 'number' || typeof endHour !== 'number' || !Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || startHour >= 24 || endHour < 0 || endHour >= 24) {
    return { ok: false, status: 'blocked', reason: 'Venue hours must use whole clock hours from 0 through 23.' };
  }
  if (endHour <= startHour) return { ok: false, status: 'blocked', reason: 'Venue service hours cannot wrap through midnight.' };
  const duration = endHour - startHour;
  if (duration < MIN_VENUE_SERVICE_HOURS) return { ok: false, status: 'blocked', reason: `Venue service must run at least ${MIN_VENUE_SERVICE_HOURS} hours.` };
  if (duration > MAX_VENUE_SERVICE_HOURS) return { ok: false, status: 'blocked', reason: `Venue service cannot exceed ${MAX_VENUE_SERVICE_HOURS} hours.` };
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

export function isVenueServiceHour(state: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind, hour: number, festivalActive = false): boolean {
  if (kind === 'tavern' && festivalActive) return true;
  const schedule = getVenueSchedule(state, kind);
  return hour >= schedule.startHour && hour < schedule.endHour;
}

export function isVenueServiceTick(state: Pick<WorldState, 'tick' | 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind, hour?: number, festivalActive = false): boolean {
  return isVenueServiceHour(state, kind, hour ?? getHourOfDay(state.tick), festivalActive);
}

export function isVenueScheduleStartTick(state: Pick<WorldState, 'tick' | 'tavernSchedule' | 'hotelSchedule'>, kind: VenueScheduleKind): boolean {
  const schedule = getVenueSchedule(state, kind);
  return state.tick % (24 * TICKS_PER_HOUR) === schedule.startHour * TICKS_PER_HOUR;
}

export function getVenueScheduleLabel(schedule: VenueSchedule): string {
  return `${String(schedule.startHour).padStart(2, '0')}:00–${String(schedule.endHour).padStart(2, '0')}:00`;
}
