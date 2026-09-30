import type { WorldState } from './gameTypes';
import { getHourOfDay, isWorkDay } from './dayCycleClock';

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
 * Validates candidate start and end hours.
 *
 * There is deliberately **no length restriction**: the owner sets how long the colony
 * works ("they should be no restrictrion for normal work or hotel or cafe"). The old
 * `MIN_STANDARD_WORK_HOURS = 2` / `MAX_STANDARD_WORK_HOURS = 16` band refused a short
 * day and a long one; both are now legal. A longer window simply scales production
 * (`getWorkHourProductionMultiplier`) and carries more fatigue, which is the intended
 * pressure — not a refusal.
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

export function getWorkSchedule(state: Pick<WorldState, 'workSchedule'>): WorkSchedule {
  return normalizeWorkSchedule(state.workSchedule);
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
 * How long before the shift a settler is allowed to spend walking to work.
 *
 * The schedule names when a settler must be *at* work, not when they set off, so the hour before
 * the start is the commute window (owner spec: "they should arrive at begin time at work, they
 * have an hour to commute").
 */
export const WORK_COMMUTE_LEAD_HOURS = 1;

/** The hour(s) before the shift start in which a settler heads for their workplace. */
export function isOnWorkCommuteHours(schedule: WorkSchedule, hour: number): boolean {
  const from = Math.max(0, schedule.startHour - WORK_COMMUTE_LEAD_HOURS);
  return hour >= from && hour < schedule.startHour;
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