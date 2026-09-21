import { EntityType } from './gameTypes';
import type { Entity } from './gameTypes';

import { HUMAN_ADULT_MIN_AGE, HUMAN_CHILDHOOD_DAYS, HUMAN_VENERABLE_AGE } from './dayCycleConstants';
import {
  DAYS_PER_YEAR,
  getAbsoluteCalendarDay,
  ticksForDays,
  isNewCalendarDayTick,
} from './dayCycleClock';

export {
  DAYS_PER_YEAR,
  LEGACY_TICKS_PER_DAY,
  PER_TICK_RATE_SCALE,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  daysUntilTick,
  getAbsoluteCalendarDay,
  getCalendarDay,
  getHourOfDay,
  getTickOfDay,
  getWeekday,
  getWeekdayLabel,
  isNewCalendarDayTick,
  isProductionTick,
  isStartOfClockHour,
  isWeekend,
  isWorkDay,
  nextTickAtClockHour,
  systemsPulsesFromLegacy,
  ticksForDays,
} from './dayCycleClock';

const GAME_YEAR_OFFSET = 1700;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export {
  EVENING_START,
  FESTIVAL_GATHER_END,
  FESTIVAL_GATHER_START,
  TAVERN_SHIFT_END,
  TAVERN_SHIFT_START,
  WORK_END,
  WORK_HOURS_PER_DAY,
  WORK_START,
  allowSocialLife,
  buildWorkHours,
  formatHour,
  isActiveFreeDay,
  isFestivalGatheringHour,
  isOnInnkeeperShift,
  isOnMoonHowlerNightShift,
  isOnWorkShift,
  isTavernOpen,
  isTavernServiceHour,
  isWorkHour,
  personDayRoll,
  prefersHomeTonight,
  shouldBeAtHome,
} from './humanSchedule';

export {
  HUMAN_MOVE_OUT_MIN_AGE,
  buildResidenceOccupancy,
  countResidentsInBuilding,
  getResidenceCapacity,
  getResidenceUpgradeSlotGain,
  hasResidenceAssignment,
  hasWorkAssignment,
  isImprisoned,
  isLeaderHouseResidence,
  isNearResidence,
  isResidenceBuilding,
  isResidenceBuildingType,
  occupancyMove,
  residenceRoomFor,
  shareResidence,
} from './residencyOccupancy';

export {
  collectFamilyMembers,
  collectOwnHousehold,
  getChildCustodian,
  isAdultChildAtHome,
} from './householdComposition';

export {
  auditHousingSharingIssues,
  buildFamilyGroups,
  buildHousingUnits,
  canMoveOutOfFamilyHome,
  housingUnitNeedsReassignment,
  isUnnecessarilySharingHousing,
  pickResidenceForFamily,
  pickResidenceForHuman,
  pickResidenceForHumanExcluding,
  pickResidenceFromChildCustodian,
  rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable,
  tryMoveOutOfFamilyHome,
} from './residencySelection';

export {
  assignMissingResidences,
  isResidenceOccupantEntity,
  rebalanceOvercrowdedResidences,
  rebuildChildrenIds,
  syncPartnerResidence,
  syncResidenceOccupants,
} from './residencyReconciliation';
export type { ResidenceOccupancy } from './residencyOccupancy';

export {
  DAYS_PER_MOON_CYCLE,
  HUMAN_ADULT_MIN_AGE,
  HUMAN_CHILDHOOD_DAYS,
  HUMAN_VENERABLE_AGE,
  isFullMoonDay,
  isFullMoonNight,
  isNightHour,
  NIGHT_END,
  NIGHT_START,
} from './dayCycleConstants';

/** Promote a child to adult size/speed once — returns true on the graduation tick. */
export function tryGraduateHumanChild(
  entity: Entity,
  adultSize: number,
  adultSpeed: number,
  onGraduate?: (entity: Entity) => void,
): boolean {
  if (!entity.isJuvenile || entity.age < HUMAN_CHILDHOOD_DAYS) return false;
  entity.isJuvenile = false;
  entity.size = adultSize;
  entity.speed = adultSpeed;
  onGraduate?.(entity);
  return true;
}

/**
 * Female fertility window. Fertility begins at the youth threshold that also opens
 * youth love (`YOUTH_LOVE_MIN_AGE` = 12 in `simulation/humanRelationships.ts`).
 *
 * Ages 12–17 may only conceive through the youth-love gate in
 * `tryDailyConception`: marriage requires `HUMAN_MOVE_OUT_MIN_AGE` (18) and an
 * affair requires `Relationship.AFFAIR_MIN_AGE` (18) on both sides, so below 18
 * this window is reachable exclusively through an existing mutual youth-love pair.
 */
export const HUMAN_FERTILITY_START = 12;
export const HUMAN_YOUTH_FERTILITY_END = 18;
const YOUTH_CONCEPTION_MULTIPLIERS: Readonly<Record<number, number>> = {
  12: 0.25,
  13: 0.25,
  14: 0.25,
  15: 0.35,
  16: 0.50,
  17: 0.70,
};
export const HUMAN_FERTILITY_PEAK_END = 35;
export const HUMAN_FERTILITY_END = 50;

export function getFemaleFertility(age: number): number {
  if (age < HUMAN_FERTILITY_START || age >= HUMAN_FERTILITY_END) return 0;
  if (age <= HUMAN_FERTILITY_PEAK_END) return 1;
  return 1 - (age - HUMAN_FERTILITY_PEAK_END) / (HUMAN_FERTILITY_END - HUMAN_FERTILITY_PEAK_END);
}

/** Reduced nearby-conception multiplier for ages 12–17; adult paths return 1.0. */
export function getYouthConceptionMultiplier(age: number): number {
  if (age >= HUMAN_YOUTH_FERTILITY_END) return 1.0;
  return YOUTH_CONCEPTION_MULTIPLIERS[age] ?? 0;
}

/** Children age faster so they mature in ~1 game year; adults age 1 year per game year. */
export const JUVENILE_DAYS_PER_AGE_YEAR = 30;
export const ADULT_DAYS_PER_AGE_YEAR = DAYS_PER_YEAR;

/** Old-age death thresholds in life-years. */
export const HUMAN_MAX_LIFESPAN_YEARS = 90;

export function getColonyDay(state: { year: number; dayInYear: number }): number {
  return state.year * DAYS_PER_YEAR + state.dayInYear;
}

export function daysLivedFromAgeYears(ageYears: number): number {
  if (ageYears <= HUMAN_CHILDHOOD_DAYS) {
    return ageYears * JUVENILE_DAYS_PER_AGE_YEAR;
  }
  return (
    HUMAN_CHILDHOOD_DAYS * JUVENILE_DAYS_PER_AGE_YEAR +
    (ageYears - HUMAN_CHILDHOOD_DAYS) * ADULT_DAYS_PER_AGE_YEAR
  );
}

/** Set birth calendar from a target life-age at a given colony day. */
export function setHumanBirthFromAge(
  entity: Entity,
  ageYears: number,
  colonyDay: number,
  month?: number,
  day?: number,
): void {
  const daysLived = daysLivedFromAgeYears(Math.max(0, ageYears));
  const birthColonyDay = colonyDay - daysLived;
  entity.birthYear = Math.floor(birthColonyDay / DAYS_PER_YEAR);

  if (month !== undefined && day !== undefined) {
    const normalizedDay = day >= 1 && day <= 30 ? day - 1 : day % 30;
    entity.birthMonth = ((month % 12) + 12) % 12;
    entity.birthDay = entity.birthMonth * 30 + normalizedDay;
  } else {
    entity.birthDay = ((birthColonyDay % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
    if (day !== undefined) entity.birthDay = day;
    entity.birthMonth = month !== undefined ? month : Math.floor(entity.birthDay / 30);
  }

  entity.age = Math.max(0, ageYears);
  entity.isJuvenile = entity.age < HUMAN_CHILDHOOD_DAYS;
  entity.maxAge = HUMAN_MAX_LIFESPAN_YEARS;
}

export function computeHumanAgeYears(
  entity: Entity,
  colonyDay: number,
  options?: { schoolAgeMultiplier?: number },
): number {
  if (!Number.isFinite(entity.birthYear) || !Number.isFinite(entity.birthDay)) {
    return Math.max(0, entity.age);
  }
  const birthColonyDay = entity.birthYear * DAYS_PER_YEAR + entity.birthDay;
  let daysLived = Math.max(0, colonyDay - birthColonyDay);
  const juvenileSpan = HUMAN_CHILDHOOD_DAYS * JUVENILE_DAYS_PER_AGE_YEAR;
  const schoolMult = options?.schoolAgeMultiplier ?? 1;

  if (schoolMult > 1 && daysLived < juvenileSpan) {
    daysLived = Math.min(daysLived * schoolMult, juvenileSpan);
  }
  if (daysLived < juvenileSpan) {
    return Math.floor(daysLived / JUVENILE_DAYS_PER_AGE_YEAR);
  }
  const adultDays = daysLived - juvenileSpan;
  return HUMAN_CHILDHOOD_DAYS + Math.floor(adultDays / ADULT_DAYS_PER_AGE_YEAR);
}

export function syncHumanAgeFromCalendar(
  entity: Entity,
  state: { year: number; dayInYear: number },
  options?: { schoolAgeMultiplier?: number },
): void {
  if (entity.type !== EntityType.Human) return;
  entity.age = computeHumanAgeYears(entity, getColonyDay(state), options);
  // Deliberately does NOT write `isJuvenile`: the graduation transition owns that flag.
  // Setting it here made `tryGraduateHumanChild` — called every tick from humanTick.ts
  // *after* this sync — unsatisfiable, because it requires `isJuvenile && age >=
  // HUMAN_CHILDHOOD_DAYS` and the sync had just cleared the flag on exactly that tick.
  // No human ever graduated, so `entity.size`/`speed` stayed at child values and
  // `applyEducationGraduation` (the only writer of `educated`) never ran.
  entity.maxAge = HUMAN_MAX_LIFESPAN_YEARS;
}

/** Display age — humans use the colony calendar; wildlife converts life-days to years. */
export function getAgeInYears(
  entity: Entity,
  state?: Pick<import('./gameTypes').WorldState, 'year' | 'dayInYear' | 'tick'>,
): number {
  if (entity.type === EntityType.Human) {
    return state ? computeHumanAgeYears(entity, getColonyDay(state)) : Math.max(0, entity.age);
  }
  return Math.max(0, Math.floor(entity.age / DAYS_PER_YEAR));
}

/** Annual old-age mortality rate (2% at age 60, scaling to 100% at age 90). */
export function getOldAgeAnnualDeathChance(age: number): number {
  if (age < HUMAN_VENERABLE_AGE) return 0;
  if (age >= HUMAN_MAX_LIFESPAN_YEARS) return 1;
  return 0.02 + ((age - HUMAN_VENERABLE_AGE) / (HUMAN_MAX_LIFESPAN_YEARS - HUMAN_VENERABLE_AGE)) * 0.98;
}

/** Daily roll chance for old-age death (scaled across the 360-day calendar year). */
export function getOldAgeDeathChance(age: number): number {
  const annual = getOldAgeAnnualDeathChance(age);
  if (annual <= 0) return 0;
  if (annual >= 1) return 1;
  return annual / DAYS_PER_YEAR;
}

/** Small daily chance for an adult to die from illness or accident regardless of age. */
export const HUMAN_DAILY_ILLNESS_CHANCE = 0.00012;

/**
 * Once-per-calendar-day conception rolls.
 * Tuned for ~1 birth per married couple per game year when housed together.
 */
export const HUMAN_DAILY_PREGNANCY_CHANCE_HOME = 0.18;
export const HUMAN_DAILY_PREGNANCY_CHANCE_NEAR = 0.0045;
export const HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE = 0.14;

export const PREGNANCY_TICKS = ticksForDays(24);
export const REPRODUCTION_COOLDOWN_TICKS = ticksForDays(150);

/** Building output intervals tied to the day/night calendar. */
export const PRODUCTION_INTERVAL = {
  farm: ticksForDays(1),
  greenhouse: ticksForDays(1),
  lumber: ticksForDays(1),
  quarry: ticksForDays(1),
  mine: ticksForDays(1),
  store: ticksForDays(2),
  market: ticksForDays(2),
  workshop: ticksForDays(2),
  silo: ticksForDays(2),
  townHall: ticksForDays(3),
  hospital: ticksForDays(5),
  huntingSpot: ticksForDays(1),
  fishingSpot: ticksForDays(1),
} as const;

export const IMMIGRATION_CHECK_TICKS = ticksForDays(2);
export const FESTIVAL_CHECK_TICKS = ticksForDays(50);

/** Calendar-aligned event intervals. */
export const EVENT_INTERVAL = {
  disaster: ticksForDays(40),
  tradeRoute: ticksForDays(8),
  churchCure: ticksForDays(1),
  wolfRecruit: ticksForDays(21),
  tamedHuntAssist: ticksForDays(3),
} as const;

/** Marks the current calendar day as processed after the daily layer succeeds. */
export function markCalendarDayProcessed(state: import('./gameTypes').WorldState): void {
  if (state.tick > 0 && isNewCalendarDayTick(state.tick)) {
    state.lastProcessedCalendarDay = getAbsoluteCalendarDay(state.tick);
  }
}

/** Get birth date string from entity birth fields */
export function getBirthDateString(entity: { birthYear: number; birthMonth: number; birthDay: number }): string {
  const realYear = GAME_YEAR_OFFSET + entity.birthYear;
  const monthIndex = Number.isFinite(entity.birthMonth)
    ? entity.birthMonth
    : Math.floor(entity.birthDay / 30);
  const month = ((monthIndex % 12) + 12) % 12;
  const dayOfMonth = (((entity.birthDay % 30) + 30) % 30) + 1;
  return `${MONTH_NAMES[month]} ${dayOfMonth}, ${realYear}`;
}

/** Rescale legacy per-tick/year ages to the day-based calendar. */
export function migrateHumanAges(
  humans: Entity[],
  state?: { year: number; dayInYear: number },
  options?: { forceCalendar?: boolean },
): void {
  const colonyDay = state ? getColonyDay(state) : 0;
  for (const human of humans) {
    if (human.type !== EntityType.Human || human.faction) continue;
    const stored = Math.max(0, human.age);
    const computed = state ? computeHumanAgeYears(human, colonyDay) : stored;
    const looksLikeLegacyFastAge = stored > HUMAN_MAX_LIFESPAN_YEARS + 5;
    const looksLikeLegacyPerDayAging =
      colonyDay > 0
      && stored > computed + 5
      && stored >= colonyDay * 0.85
      && human.birthYear === 0
      && human.birthDay === 0;

    let ageYears = stored;
    if (options?.forceCalendar || looksLikeLegacyFastAge || looksLikeLegacyPerDayAging) {
      if (computed < stored - 3 && (human.birthYear !== 0 || human.birthDay !== 0)) {
        ageYears = computed;
      } else if ((human.generation ?? 0) <= 1 && colonyDay < DAYS_PER_YEAR * 2) {
        ageYears = human.isJuvenile
          ? Math.min(HUMAN_CHILDHOOD_DAYS - 1, Math.floor(colonyDay / JUVENILE_DAYS_PER_AGE_YEAR))
          : Math.min(35, 28 + Math.floor(colonyDay / ADULT_DAYS_PER_AGE_YEAR));
      } else {
        ageYears = Math.min(
          HUMAN_MAX_LIFESPAN_YEARS - 1,
          Math.max(human.isJuvenile ? 0 : HUMAN_ADULT_MIN_AGE, computed),
        );
      }
    } else if (state && Math.abs(computed - stored) <= 2) {
      ageYears = computed;
    }

    if (state) {
      setHumanBirthFromAge(human, ageYears, colonyDay);
    } else {
      human.maxAge = HUMAN_MAX_LIFESPAN_YEARS;
      human.age = ageYears;
    }
    if (human.isJuvenile && human.age >= HUMAN_CHILDHOOD_DAYS) {
      human.isJuvenile = false;
    }
  }
}

export {
  finalizeHumanDeath,
  isKillableSettlerEntity,
  killHuman,
  reconcileFamilyReferencesAfterRemoval,
  reconcileOrphanedMarriages,
  removeHumanFromBuildingOccupants,
} from './humanLifecycleCleanup';