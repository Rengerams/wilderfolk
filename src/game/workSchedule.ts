import type { WorldState } from './gameTypes';
import { TICKS_PER_HOUR, getHourOfDay, isWorkDay } from './dayCycleClock';

export const DEFAULT_WORK_START_HOUR = 7;
export const DEFAULT_WORK_END_HOUR = 18;
export const MIN_STANDARD_WORK_HOURS = 6;
export const MAX_STANDARD_WORK_HOURS = 12;

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
  return schedule.endHour - schedule.startHour;
}

export function validateWorkSchedule(startHour: unknown, endHour: unknown): WorkScheduleValidation {
  if (!isWholeClockHour(startHour) || !isWholeClockHour(endHour)) {
    return { ok: false, status: 'blocked', reason: 'Work hours must use whole clock hours from 0 through 23.' };
  }
  if (endHour <= startHour) {
    return { ok: false, status: 'blocked', reason: 'The standard work window cannot wrap through midnight.' };
  }
  const duration = endHour - startHour;
  if (duration < MIN_STANDARD_WORK_HOURS) {
    return { ok: false, status: 'blocked', reason: `The standard work window must be at least ${MIN_STANDARD_WORK_HOURS} hours.` };
  }
  if (duration > MAX_STANDARD_WORK_HOURS) {
    return { ok: false, status: 'blocked', reason: `The standard work window cannot exceed ${MAX_STANDARD_WORK_HOURS} hours.` };
  }
  const schedule = { startHour, endHour };
  return { ok: true, status: 'accepted', schedule };
}

export function setWorkSchedule(
  originalState: WorldState,
  startHour: number,
  endHour: number,
): WorldState {
  const current = getWorkSchedule(originalState);
  const result = validateWorkSchedule(startHour, endHour);
  if (!result.ok) return originalState;
  if (current.startHour === result.schedule.startHour && current.endHour === result.schedule.endHour) {
    return originalState;
  }
  const state = structuredClone(originalState);
  state.workSchedule = result.schedule;
  return state;
}

export function isWorkScheduleHour(schedule: WorkSchedule, hour: number): boolean {
  return hour >= schedule.startHour && hour < schedule.endHour;
}

export function isOnWorkScheduleShift(
  state: Pick<WorldState, 'tick' | 'workSchedule'>,
  hour?: number,
): boolean {
  if (!isWorkDay(state.tick)) return false;
  const schedule = getWorkSchedule(state);
  return isWorkScheduleHour(schedule, hour ?? getHourOfDay(state.tick));
}

export function isWorkScheduleStartTick(
  state: Pick<WorldState, 'tick' | 'workSchedule'>,
): boolean {
  const schedule = getWorkSchedule(state);
  return state.tick % (24 * TICKS_PER_HOUR) === schedule.startHour * TICKS_PER_HOUR;
}

export function getWorkScheduleLabel(schedule: WorkSchedule): string {
  const format = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  return `${format(schedule.startHour)}–${format(schedule.endHour)}`;
}
