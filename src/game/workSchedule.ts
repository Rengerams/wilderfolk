import type { WorldState } from './gameTypes';
import { getHourOfDay, isWorkDay, TICKS_PER_DAY, TICKS_PER_HOUR } from './dayCycleClock';

export const DEFAULT_WORK_START_HOUR = 7;
export const DEFAULT_WORK_END_HOUR = 16;

/** Baseline work window for production scaling — 9 hours = 1.0 output. */
export const STANDARD_PRODUCTION_WORK_HOURS = 9;

export interface WorkSchedule {
  startHour: number;
  endHour: number;
}

export type WorkScheduleValidation =
  | { ok: true; status: 'accepted' | 'unchanged'; schedule: WorkSchedule }
  | { ok: false; status: 'blocked'; reason: string };

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = Object.freeze({
  startHour: DEFAULT_WORK_START_HOUR,
  endHour: DEFAULT_WORK_END_HOUR,
});

function isWholeClockHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 24;
}

/**
 * Validates candidate start and end hours. There is deliberately no length restriction: a longer
 * window simply scales production and carries more fatigue.
 */
export function validateWorkSchedule(
  startHour: unknown,
  endHour: unknown,
  currentSchedule?: WorkSchedule,
): WorkScheduleValidation {
  if (!isWholeClockHour(startHour) || !isWholeClockHour(endHour)) {
    return {
      ok: false,
      status: 'blocked',
      reason: 'Work hours must use whole clock hours from 0 through 23.',
    };
  }

  if (endHour <= startHour) {
    return {
      ok: false,
      status: 'blocked',
      reason: 'The standard work window cannot wrap through midnight.',
    };
  }

  const schedule: WorkSchedule = { startHour, endHour };

  if (
    currentSchedule &&
    currentSchedule.startHour === startHour &&
    currentSchedule.endHour === endHour
  ) {
    return { ok: true, status: 'unchanged', schedule };
  }

  return { ok: true, status: 'accepted', schedule };
}

/**
 * Safely parses and normalizes unknown schedule objects (useful during save-state loads).
 */
export function normalizeWorkSchedule(value: unknown): WorkSchedule {
  if (!value || typeof value !== 'object') return { ...DEFAULT_WORK_SCHEDULE };
  const candidate = value as { startHour?: unknown; endHour?: unknown };
  const result = validateWorkSchedule(candidate.startHour, candidate.endHour);
  return result.ok ? result.schedule : { ...DEFAULT_WORK_SCHEDULE };
}

/**
 * The last raw hours pair and the schedule it normalized to. The normalized schedule depends only on
 * `startHour`/`endHour`, so a value key is exact; the cache keeps the per-tick read allocation-free.
 */
let cachedStart: unknown;
let cachedEnd: unknown;
let cachedSchedule: WorkSchedule = { ...DEFAULT_WORK_SCHEDULE };

export function getWorkSchedule(state: Pick<WorldState, 'workSchedule'>): WorkSchedule {
  const raw = state.workSchedule;
  const start = raw?.startHour;
  const end = raw?.endHour;
  if (Object.is(start, cachedStart) && Object.is(end, cachedEnd)) return cachedSchedule;
  cachedStart = start;
  cachedEnd = end;
  cachedSchedule = normalizeWorkSchedule(raw);
  return cachedSchedule;
}

export function getWorkScheduleHours(schedule: WorkSchedule): number {
  return Math.max(0, schedule.endHour - schedule.startHour);
}

/**
 * Production scales directly with the configured work window:
 * 9h -> 1.0, shorter -> lower, longer -> higher.
 */
export function getWorkHourProductionMultiplier(scheduleHours: number): number {
  if (!Number.isFinite(scheduleHours) || scheduleHours <= 0) return 0;
  return scheduleHours / STANDARD_PRODUCTION_WORK_HOURS;
}

/**
 * Immutably updates the colony work schedule in WorldState.
 */
export function setWorkSchedule(
  originalState: WorldState,
  startHour: number,
  endHour: number,
): WorldState {
  const current = getWorkSchedule(originalState);
  const result = validateWorkSchedule(startHour, endHour, current);

  if (!result.ok || result.status === 'unchanged') {
    return originalState;
  }

  return {
    ...originalState,
    workSchedule: result.schedule,
  };
}

export function isWorkScheduleHour(schedule: WorkSchedule, hour: number): boolean {
  return hour >= schedule.startHour && hour < schedule.endHour;
}

/**
 * How long before the shift a settler may spend walking to work: the schedule names when they must
 * be at work, so the hour before the start is the commute window.
 */
export const WORK_COMMUTE_LEAD_HOURS = 1;

/** The hour(s) before the shift start in which a settler heads for their workplace. */
export function isOnWorkCommuteHours(schedule: WorkSchedule, hour: number): boolean {
  const from = Math.max(0, schedule.startHour - WORK_COMMUTE_LEAD_HOURS);
  return hour >= from && hour < schedule.startHour;
}

/** Tick-precise departure check: a fractional lead must not wait for the next whole hour. */
export function isWithinWorkCommuteLead(tick: number, startHour: number, leadHours: number): boolean {
  if (!Number.isFinite(tick) || !Number.isFinite(startHour) || !Number.isFinite(leadHours)) return false;
  const tickOfDay = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  const hourOfDay = tickOfDay / TICKS_PER_HOUR;
  return hourOfDay >= startHour - leadHours && hourOfDay < startHour;
}

/**
 * Evaluates whether the colony is currently in an active work shift.
 * Must be a designated workday and fall within configured hours.
 */
export function isOnWorkScheduleShift(
  state: Pick<WorldState, 'tick' | 'workSchedule'>,
  hour?: number,
): boolean {
  if (!isWorkDay(state.tick)) return false;
  const schedule = getWorkSchedule(state);
  return isWorkScheduleHour(schedule, hour ?? getHourOfDay(state.tick));
}

/**
 * Formats the schedule as a standard 24h range string (e.g., "07:00–16:00").
 */
export function getWorkScheduleLabel(schedule: WorkSchedule): string {
  const format = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  return `${format(schedule.startHour)}–${format(schedule.endHour)}`;
}