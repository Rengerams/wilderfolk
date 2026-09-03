import { isFullMoonNight, isNightHour } from './dayCycleConstants';
import {
  getAbsoluteCalendarDay,
  getHourOfDay,
  isWeekend,
  isWorkDay,
} from './dayCycleClock';

/** Shift start (07:00). */
export const WORK_START = 7;
/** Shift end exclusive — free from 18:00 onward. */
export const WORK_END = 18;
/** After-work/home transition. */
export const EVENING_START = 18;
/** Tavern service window, inclusive start and exclusive end. */
export const TAVERN_SHIFT_START = 17;
export const TAVERN_SHIFT_END = 23;
/** Festival gathering window for realtime movement. */
export const FESTIVAL_GATHER_START = 15;
export const FESTIVAL_GATHER_END = 22;
/** Work hours per weekday; daily construction uses this unit. */
export const WORK_HOURS_PER_DAY = WORK_END - WORK_START;

export function buildWorkHours(buildDays: number): number {
  return Math.max(WORK_HOURS_PER_DAY, Math.round(buildDays * WORK_HOURS_PER_DAY));
}

export function isWorkHour(hour: number): boolean {
  return hour >= WORK_START && hour < WORK_END;
}

export function isOnWorkShift(tick: number, hour?: number): boolean {
  if (!isWorkDay(tick)) return false;
  const currentHour = hour ?? getHourOfDay(tick);
  return isWorkHour(currentHour);
}

export function isTavernServiceHour(hour: number): boolean {
  return hour >= TAVERN_SHIFT_START && hour < TAVERN_SHIFT_END;
}

export function isTavernOpen(hour: number, festivalActive?: boolean): boolean {
  return festivalActive ? true : isTavernServiceHour(hour);
}

export function isFestivalGatheringHour(hour: number, festivalActive?: boolean): boolean {
  return festivalActive === true && hour >= FESTIVAL_GATHER_START && hour < FESTIVAL_GATHER_END;
}

export function isOnInnkeeperShift(tick: number, hour?: number, festivalActive?: boolean): boolean {
  const currentHour = hour ?? getHourOfDay(tick);
  return isTavernOpen(currentHour, festivalActive);
}

export function isOnMoonHowlerNightShift(tick: number, hour?: number): boolean {
  const currentHour = hour ?? getHourOfDay(tick);
  return isFullMoonNight(getAbsoluteCalendarDay(tick), currentHour);
}

export function shouldBeAtHome(hour: number): boolean {
  return isNightHour(hour) || hour >= EVENING_START || hour < WORK_START;
}

/** Stable 0..1 roll for one person on one colony day. */
export function personDayRoll(entityId: number, tick: number, salt = 0): number {
  const day = getAbsoluteCalendarDay(tick);
  let hash = (
    Math.imul(entityId | 0, 374761393)
    ^ Math.imul(day | 0, 668265263)
    ^ Math.imul(salt | 0, 1274126177)
  ) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822519) >>> 0;
  return (hash % 10000) / 10000;
}

export function prefersHomeTonight(entityId: number, tick: number, hour: number): boolean {
  const weekend = isWeekend(tick);
  const roll = (salt: number) => personDayRoll(entityId, tick, salt);

  if (hour >= 23 || hour < 5) return roll(101) > 0.07;
  if (hour >= 5 && hour < WORK_START) return roll(102) > 0.12;
  if (hour >= EVENING_START && hour < 22) return roll(103) < 0.50;
  if (hour >= 22 && hour < 23) return roll(104) > 0.20;
  if (weekend && hour >= WORK_START && hour < EVENING_START) return roll(105) < 0.30;
  return false;
}

export function isActiveFreeDay(entityId: number, tick: number): boolean {
  if (isWeekend(tick)) return personDayRoll(entityId, tick, 201) >= 0.30;
  return !prefersHomeTonight(entityId, tick, EVENING_START + 1);
}

export function formatHour(hour: number): string {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const suffix = normalizedHour < 12 ? 'am' : 'pm';
  const display = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  return `${display}${suffix}`;
}

export function allowSocialLife(hour: number, hasWorkplace: boolean, tick?: number): boolean {
  if (tick != null && isWeekend(tick)) return true;
  return !(isWorkHour(hour) && hasWorkplace);
}
