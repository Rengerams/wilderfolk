import { isFullMoonNight, isNightHour } from './daycycleconstants';
import {
  getAbsoluteCalendarDay,
  getHourOfDay,
  isWeekend,
  TICKS_PER_HOUR,
} from './dayCycleClock';
import { personDayRoll } from './simRng';
import { HUMAN_NEEDS } from './simulation/humanPhysiology';
import { isNearResidence } from './housingModel';
import {
  DEFAULT_WORK_SCHEDULE,
  isWorkScheduleHour,
  type WorkSchedule,
} from './workSchedule';
import type { Building, Entity } from './gameTypes';

/** Evening/home transition hour — fixed, independent of the work window. */
export const EVENING_START = 18;
/** Tavern service window, inclusive start and exclusive end. */
const TAVERN_SHIFT_START = 17;
const TAVERN_SHIFT_END = 23;
/** Festival gathering window for realtime movement. */
const FESTIVAL_GATHER_START = 17;
const FESTIVAL_GATHER_END = 21;

function isTavernServiceHour(hour: number): boolean {
  return hour >= TAVERN_SHIFT_START && hour < TAVERN_SHIFT_END;
}

export function isTavernOpen(hour: number, festivalActive?: boolean): boolean {
  return festivalActive ? true : isTavernServiceHour(hour);
}

export function isFestivalGatheringHour(hour: number, festivalActive?: boolean): boolean {
  return festivalActive === true && hour >= FESTIVAL_GATHER_START && hour < FESTIVAL_GATHER_END;
}

/**
 * A settler joins the festival gathering only when the window is open and he has no shift to be on:
 * work wins over revelry (owner: "during festival they should also work").
 */
export function isFestivalGatherer(
  hour: number,
  festivalActive: boolean | undefined,
  onShift: boolean,
  isInnkeeper: boolean,
): boolean {
  return isFestivalGatheringHour(hour, festivalActive) && !isInnkeeper && !onShift;
}

/**
 * Legacy innkeeper-duty query: the tavern service window, ignoring any festival.
 */
export function isOnInnkeeperShift(tick: number, hour?: number): boolean {
  return isTavernServiceHour(hour ?? getHourOfDay(tick));
}

export function isOnMoonHowlerNightShift(tick: number, hour?: number): boolean {
  const currentHour = hour ?? getHourOfDay(tick);
  return isFullMoonNight(getAbsoluteCalendarDay(tick), currentHour);
}

/** A scheduled shift replaces ordinary bedtime when it starts within one day. */
export function preShiftSleepPlan(
  tick: number,
  nextShiftStartTick: number | null,
  commuteLeadHours: number,
): { headHome: boolean; sleep: boolean; overrideNight: boolean } {
  if (nextShiftStartTick == null || nextShiftStartTick <= tick
    || nextShiftStartTick - tick > 24 * TICKS_PER_HOUR) {
    return { headHome: false, sleep: false, overrideNight: false };
  }
  // Full recovery is priced by the physiology owner; reserve an hour to get home
  // before bed and wake before the actual departure, not at the shift start.
  const wakeTick = nextShiftStartTick - Math.max(0, commuteLeadHours) * TICKS_PER_HOUR;
  const bedtimeTick = wakeTick - (100 / HUMAN_NEEDS.SLEEP_RECOVERY_PER_SIM_HOUR) * TICKS_PER_HOUR;
  return {
    headHome: tick >= bedtimeTick - TICKS_PER_HOUR && tick < wakeTick,
    sleep: tick >= bedtimeTick && tick < wakeTick,
    overrideNight: true,
  };
}

/** Home window for the colony work schedule, independent of individual shift sleep. */
export function shouldBeAtHomeFor(schedule: WorkSchedule | undefined, hour: number): boolean {
  const s = schedule ?? DEFAULT_WORK_SCHEDULE;
  return isNightHour(hour) || hour < s.startHour || hour >= s.endHour;
}

/**
 * An off-duty settler near their residence during sleep hours is asleep — the night window plus
 * the residency proximity rule. Anyone out at night is away from their residence and unaffected.
 */
export function isAsleepAtHome(
  human: Entity,
  buildings: Building[] | ReadonlyMap<number, Building>,
  hour: number,
  onDuty = false,
): boolean {
  return !onDuty && isNightHour(hour) && isNearResidence(human, buildings);
}

/** Schedule-aware preference to stay home, with probability bands around the shift. */
export function prefersHomeTonightFor(
  schedule: WorkSchedule | undefined,
  entityId: number,
  tick: number,
  hour: number,
): boolean {
  const s = schedule ?? DEFAULT_WORK_SCHEDULE;
  const weekend = isWeekend(tick);
  const roll = (salt: number) => personDayRoll(entityId, tick, salt);

  // Deep night is not a preference: most settlers sleep, a small deterministic minority may stay
  // out. Anyone legitimately out after dark is excluded by JOB, not by this roll.
  if (hour >= 23 || hour < 5) return roll(101) >= 0.05;
  if (hour >= 5 && hour < s.startHour) return roll(102) > 0.12;
  if (hour >= s.endHour && hour < 22) return roll(103) < 0.5;
  if (hour >= 22 && hour < 23) return roll(104) > 0.2;
  if (weekend && hour >= s.startHour && hour < s.endHour) return roll(105) < 0.3;
  return false;
}

export function allowSocialLifeFor(
  schedule: WorkSchedule | undefined,
  hour: number,
  hasWorkplace: boolean,
  tick?: number,
): boolean {
  if (tick != null && isWeekend(tick)) return true;
  return !(isWorkScheduleHour(schedule ?? DEFAULT_WORK_SCHEDULE, hour) && hasWorkplace);
}
