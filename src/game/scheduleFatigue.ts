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

export function resolveDailyScheduleFatigue(
  entity: Entity,
  state: Pick<WorldState, 'workSchedule'>,
): { workedHours: number; fatigueBefore: number; fatigueAfter: number } {
  const workedHours = (entity.scheduleWorkedTicksToday ?? 0) / TICKS_PER_HOUR;
  const scheduleHours = getWorkSchedule(state).endHour - getWorkSchedule(state).startHour;
  const targetHours = Math.min(NEUTRAL_WORK_HOURS, scheduleHours);
  const fatigueBefore = getScheduleFatigue(entity);
  const excess = Math.max(0, workedHours - targetHours);
  const rest = Math.max(0, targetHours - workedHours);
  const recovery = BASE_DAILY_RECOVERY + rest * RECOVERY_PER_SHORT_HOUR;
  const fatigueAfter = Math.max(0, Math.min(MAX_SCHEDULE_FATIGUE, fatigueBefore + excess * FATIGUE_PER_EXCESS_HOUR - recovery));
  entity.scheduleFatigue = fatigueAfter;
  entity.scheduleWorkedTicksToday = 0;
  return { workedHours, fatigueBefore, fatigueAfter };
}
