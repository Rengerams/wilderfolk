import { isFullMoonNight, isNightHour } from './dayCycleConstants';
import {
  getAbsoluteCalendarDay,
  getHourOfDay,
  isWeekend,
  isWorkDay,
} from './dayCycleClock';
import { isNearResidence } from './residencyOccupancy';
import type { Building, Entity } from './gameTypes';

/** Legacy shift start (07:00) — used when no colony schedule is supplied. */
export const WORK_START = 7;
/** Legacy shift end exclusive (18:00) — free from 18:00 onward by default. */
export const WORK_END = 18;
/** Legacy after-work/home transition. */
export const EVENING_START = 18;
/** Tavern service window, inclusive start and exclusive end. */
export const TAVERN_SHIFT_START = 17;
export const TAVERN_SHIFT_END = 23;
/** Festival gathering window for realtime movement. */
export const FESTIVAL_GATHER_START = 15;
export const FESTIVAL_GATHER_END = 22;
/** Legacy work hours per weekday; daily construction uses this unit. */
export const WORK_HOURS_PER_DAY = WORK_END - WORK_START;

/** A work-day window (start inclusive, end exclusive). */
export interface DayWindow {
  startHour: number;
  endHour: number;
}

/** Legacy fixed 07–18 window — used when no colony schedule is supplied. */
export const LEGACY_WINDOW: DayWindow = { startHour: WORK_START, endHour: WORK_END };

export function buildWorkHours(buildDays: number): number {
  return Math.max(WORK_HOURS_PER_DAY, Math.round(buildDays * WORK_HOURS_PER_DAY));
}

/** Schedule-aware: is `hour` inside the (optionally configured) work window? */
export function isWorkHourFor(schedule: DayWindow | undefined, hour: number): boolean {
  const s = schedule ?? LEGACY_WINDOW;
  return hour >= s.startHour && hour < s.endHour;
}

export function isWorkHour(hour: number): boolean {
  return isWorkHourFor(undefined, hour);
}

export function isOnWorkShift(tick: number, hour?: number): boolean {
  if (!isWorkDay(tick)) return false;
  const currentHour = hour ?? getHourOfDay(tick);
  return isWorkHour(currentHour);
}

export function isOnWorkShiftFor(
  schedule: DayWindow | undefined,
  tick: number,
  hour?: number,
): boolean {
  if (!isWorkDay(tick)) return false;
  return isWorkHourFor(schedule, hour ?? getHourOfDay(tick));
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

/**
 * Schedule-aware: should this settler be "home" right now? True at night, before
 * the configured shift start, or from the configured shift end onward.
 */
export function shouldBeAtHomeFor(schedule: DayWindow | undefined, hour: number): boolean {
  const s = schedule ?? LEGACY_WINDOW;
  return isNightHour(hour) || hour < s.startHour || hour >= s.endHour;
}

export function shouldBeAtHome(hour: number): boolean {
  return shouldBeAtHomeFor(undefined, hour);
}

/**
 * A settler who is at home during the night is asleep.
 *
 * Composes the two owners that already describe this: the night window
 * (`isNightHour`, 20:00–06:00) and the residency proximity rule (`isNearResidence`,
 * 55 px of the assigned house). Anyone out at night — a tavern keeper, a night-shift
 * worker, a visitor, a settler still walking home — is away from their residence and
 * therefore unaffected.
 *
 * Sleepers keep their mouth shut (the ambient chatter gate in `humanTick`) and are not
 * drawn (the sleeper cull in `renderer/humans.ts`), which is what keeps a 200-citizen
 * village readable after dark. The simulation still owns every one of them.
 */
export function isAsleepAtHome(
  human: Entity,
  buildings: Building[] | ReadonlyMap<number, Building>,
  hour: number,
): boolean {
  return isNightHour(hour) && isNearResidence(human, buildings);
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

/** Schedule-aware preference to stay home, with probability bands around the shift. */
export function prefersHomeTonightFor(
  schedule: DayWindow | undefined,
  entityId: number,
  tick: number,
  hour: number,
): boolean {
  const s = schedule ?? LEGACY_WINDOW;
  const weekend = isWeekend(tick);
  const roll = (salt: number) => personDayRoll(entityId, tick, salt);

  if (hour >= 23 || hour < 5) return roll(101) > 0.07;
  if (hour >= 5 && hour < s.startHour) return roll(102) > 0.12;
  if (hour >= s.endHour && hour < 22) return roll(103) < 0.5;
  if (hour >= 22 && hour < 23) return roll(104) > 0.2;
  if (weekend && hour >= s.startHour && hour < s.endHour) return roll(105) < 0.3;
  return false;
}

export function prefersHomeTonight(entityId: number, tick: number, hour: number): boolean {
  return prefersHomeTonightFor(undefined, entityId, tick, hour);
}

export function isActiveFreeDay(entityId: number, tick: number): boolean {
  if (isWeekend(tick)) return personDayRoll(entityId, tick, 201) >= 0.3;
  return !prefersHomeTonight(entityId, tick, EVENING_START + 1);
}

export function formatHour(hour: number): string {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const suffix = normalizedHour < 12 ? 'am' : 'pm';
  const display = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  return `${display}${suffix}`;
}

export function allowSocialLifeFor(
  schedule: DayWindow | undefined,
  hour: number,
  hasWorkplace: boolean,
  tick?: number,
): boolean {
  if (tick != null && isWeekend(tick)) return true;
  return !(isWorkHourFor(schedule, hour) && hasWorkplace);
}

export function allowSocialLife(hour: number, hasWorkplace: boolean, tick?: number): boolean {
  return allowSocialLifeFor(undefined, hour, hasWorkplace, tick);
}
