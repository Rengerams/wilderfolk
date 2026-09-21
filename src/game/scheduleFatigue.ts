import type { Entity, WorldState } from './gameTypes';
import { TICKS_PER_HOUR } from './dayCycle';
import { getWorkSchedule } from './workSchedule';

export const MAX_SCHEDULE_FATIGUE = 100;
export const NEUTRAL_WORK_HOURS = 8;
export const FATIGUE_PER_EXCESS_HOUR = 10;
export const RECOVERY_PER_SHORT_HOUR = 3;
export const BASE_DAILY_RECOVERY = 4;

export function getScheduleFatigue(entity: Pick<Entity, 'scheduleFatigue'>): number {
  return Math.max(0, Math.min(MAX_SCHEDULE_FATIGUE, entity.scheduleFatigue ?? 0));
}

export function getScheduleProductivityMultiplier(entity: Pick<Entity, 'scheduleFatigue'>): number {
  return Math.max(0.65, 1 - getScheduleFatigue(entity) * 0.0035);
}

export function recordScheduleWorkTick(entity: Entity): void {
  if (!entity.alive || entity.isJuvenile || entity.faction) return;
  entity.scheduleWorkedTicksToday = (entity.scheduleWorkedTicksToday ?? 0) + 1;
}

/**
 * Resolve a settler's fatigue for the day.
 *
 * Takes only the two fields it actually touches, matching its siblings `getScheduleFatigue` and
 * `getScheduleProductivityMultiplier` above. It deliberately does **not** narrow on `alive`, `isJuvenile`
 * or `faction` the way `recordScheduleWorkTick` does — this is the end-of-day settle, and it must run
 * for every settler who accrued hours, so a full `Entity` is not required to answer it (2026-09-20
 * audit: the narrower parameter is what lets the fixture call this without casting a partial entity).
 */
/**
 * The standard work window's length, capped at the neutral day — the loop-invariant half of
 * `resolveDailyScheduleFatigue` below.
 *
 * Exported so a pass that resolves many settlers can derive it once instead of paying
 * `getWorkSchedule` (which normalizes and allocates a fresh `{startHour, endHour}`) twice per
 * settler. `state.workSchedule` is written only at the worker boundary (`simPrep`, `simDelta`).
 */
export function getScheduleTargetHours(state: Pick<WorldState, 'workSchedule'>): number {
  const schedule = getWorkSchedule(state);
  return Math.min(NEUTRAL_WORK_HOURS, schedule.endHour - schedule.startHour);
}

export function resolveDailyScheduleFatigue(
  entity: Pick<Entity, 'scheduleFatigue' | 'scheduleWorkedTicksToday'>,
  state: Pick<WorldState, 'workSchedule'>,
  /** Pre-derived `getScheduleTargetHours(state)` for a caller resolving many settlers in one pass. */
  targetHoursForPass?: number,
): { workedHours: number; fatigueBefore: number; fatigueAfter: number } {
  const workedHours = (entity.scheduleWorkedTicksToday ?? 0) / TICKS_PER_HOUR;
  const targetHours = targetHoursForPass ?? getScheduleTargetHours(state);
  const fatigueBefore = getScheduleFatigue(entity);
  const excess = Math.max(0, workedHours - targetHours);
  const rest = Math.max(0, targetHours - workedHours);
  const recovery = BASE_DAILY_RECOVERY + rest * RECOVERY_PER_SHORT_HOUR;
  const fatigueAfter = Math.max(0, Math.min(MAX_SCHEDULE_FATIGUE, fatigueBefore + excess * FATIGUE_PER_EXCESS_HOUR - recovery));
  entity.scheduleFatigue = fatigueAfter;
  entity.scheduleWorkedTicksToday = 0;
  return { workedHours, fatigueBefore, fatigueAfter };
}