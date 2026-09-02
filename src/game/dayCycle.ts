import { EntityType } from './gameTypes';
import type { Entity } from './gameTypes';

import { HUMAN_ADULT_MIN_AGE } from './dayCycleConstants';
import { TICKS_PER_DAY, DAYS_PER_YEAR, getAbsoluteCalendarDay, ticksForDays } from './dayCycleClock';
export { DAYS_PER_YEAR, LEGACY_TICKS_PER_DAY, PER_TICK_RATE_SCALE, TICKS_PER_DAY, TICKS_PER_HOUR, getAbsoluteCalendarDay, getCalendarDay, getHourOfDay,  getWeekday, getWeekdayLabel, isNewCalendarDayTick, isProductionTick, isStartOfClockHour, isWeekend,  nextTickAtClockHour, systemsPulsesFromLegacy, ticksForDays } from './dayCycleClock';

const GAME_YEAR_OFFSET = 1700;
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export {
  EVENING_START,
  
  
  
  
  
  WORK_HOURS_PER_DAY,
  
  allowSocialLife,
  
  
  
  isFestivalGatheringHour,
  
  isOnMoonHowlerNightShift,
  isOnWorkShift,
  
  
  isWorkHour,
  personDayRoll,
  prefersHomeTonight,
  shouldBeAtHome,
} from './humanSchedule';

export {
  HUMAN_MOVE_OUT_MIN_AGE,
  assignMissingResidences,
  
  buildFamilyGroups,
  
  
  canMoveOutOfFamilyHome,
  
  
  countResidentsInBuilding,
  getChildCustodian,
  getResidenceCapacity,
  getResidenceUpgradeSlotGain,
  hasResidenceAssignment,
  hasWorkAssignment,
  
  isAdultChildAtHome,
  isImprisoned,
  isLeaderHouseResidence,
  isNearResidence,
  isResidenceBuilding,
  isResidenceBuildingType,
  isResidenceOccupantEntity,
  
  
  
  pickResidenceForHuman,
  pickResidenceForHumanExcluding,
  
  
  
  rebuildChildrenIds,
  
  
  shareResidence,
  syncPartnerResidence,
  syncResidenceOccupants,
  
} from './residency';
;

export {
  
  HUMAN_ADULT_MIN_AGE,
  
  
  isNightHour,
  NIGHT_END,
  NIGHT_START,
} from './dayCycleConstants';

/**
 * Day resolution: multiple sim ticks per clock hour so settlers can walk to work,
 * chat, and eat before the day flips.
 *
 * - TICKS_PER_HOUR = 3 → TICKS_PER_DAY = 72 (was 24: 1 tick = 1 hour)
 * - getHourOfDay maps tick-of-day → 0..23
 * - Per-tick energy / wildlife rates use {@link PER_TICK_RATE_SCALE} so daily totals stay balanced
 * - Real-time: gameLoop BASE_TICKS_PER_SECOND × speed; at 1.5 ticks/s a day ≈ 48 real seconds at 1×
 */
/**
 * Human age ladders (life-years; intentional, not identical thresholds) — EK-E4
 *
 * | Age | Constant / gate              | Meaning |
 * |----:|------------------------------|---------|
 * |  12 | HUMAN_CHILDHOOD_DAYS         | Clear `isJuvenile`; adult size/speed (`tryGraduateHumanChild`) |
 * |  12 | HUMAN_FERTILITY_START        | Female fertility opens (same life-year as graduation) |
 * |  14 | YOUTH_LOVE_MIN_AGE           | May begin a school-influenced youth relationship; no marriage or household change |
 * |  16 | HUMAN_ADULT_MIN_AGE          | Social adult: adult courtship pool, adoptive singles, recruit ages |
 * |  18 | HUMAN_MOVE_OUT_MIN_AGE       | May leave parental home and marry; housing “minor” until then unless partnered |
 * |  35 | HUMAN_FERTILITY_PEAK_END     | Fertility stays 1.0 through this age |
 * |  50 | HUMAN_FERTILITY_END          | Fertility reaches 0 |
 * |  60 | HUMAN_VENERABLE_AGE          | Old-age death chance begins |
 * |  90 | HUMAN_MAX_LIFESPAN_YEARS     | Hard life-year cap / courtship upper bound |
 *
 * Housing minors: `isJuvenile || age < MOVE_OUT` **except** partnered settlers
 * are emancipated (EK-E1). Adoptive guardians use ADULT_MIN_AGE (EK-E3).
 * Ages 12–13: graduated body, not social adults. Ages 14–15 may form school-influenced
 * youth relationships and may conceive only through the low-probability mutual-youth-love rule.
 * Ages 16–17 enter adult courtship while still housing-dependent; marriage remains gated until age 18.
 *
 * Childhood matures in ~1 game year (fast juvenile calendar); adults gain
 * 1 life-year per game year — see JUVENILE_DAYS_PER_AGE_YEAR / ADULT_*.
 */
export const HUMAN_CHILDHOOD_DAYS = 12;

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
/** Female fertility window. Fertility begins at the game's age-14 youth threshold. */
export const HUMAN_FERTILITY_START = 14;
export const HUMAN_YOUTH_FERTILITY_END = 18;
const YOUTH_CONCEPTION_MULTIPLIERS: Readonly<Record<number, number>> = {
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

/** Reduced nearby-conception multiplier for ages 14–17; adult paths use 1. */
export function getYouthConceptionMultiplier(age: number): number {
  return YOUTH_CONCEPTION_MULTIPLIERS[age] ?? 0;
}

/** Children age faster so they mature in ~1 game year; adults age 1 year per game year. */
export const JUVENILE_DAYS_PER_AGE_YEAR = 30;
export const ADULT_DAYS_PER_AGE_YEAR = DAYS_PER_YEAR;

/** Old-age death thresholds in life-years (1 game year ≈ 1 life-year for adults). */
export const HUMAN_VENERABLE_AGE = 60;
export const HUMAN_MAX_LIFESPAN_YEARS = 90;
/** Upper bound for courtship / affairs — matches life-year lifespan cap. */

export function getColonyDay(state: { year: number; dayInYear: number }): number {
  return state.year * DAYS_PER_YEAR + state.dayInYear;
}

export function daysLivedFromAgeYears(ageYears: number): number {
  if (ageYears <= HUMAN_CHILDHOOD_DAYS) {
    return ageYears * JUVENILE_DAYS_PER_AGE_YEAR;
  }
  return HUMAN_CHILDHOOD_DAYS * JUVENILE_DAYS_PER_AGE_YEAR
    + (ageYears - HUMAN_CHILDHOOD_DAYS) * ADULT_DAYS_PER_AGE_YEAR;
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
  entity.birthDay = ((birthColonyDay % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  if (day !== undefined) entity.birthDay = day;
  if (month !== undefined) {
    entity.birthMonth = month;
  } else if (day !== undefined) {
    entity.birthMonth = Math.floor(day / 30);
  } else {
    entity.birthMonth = Math.floor(entity.birthDay / 30);
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
  entity.maxAge = HUMAN_MAX_LIFESPAN_YEARS;
}

/** Display age — humans use the colony calendar; wildlife converts life-days to years. */
export function getAgeInYears(
  entity: Entity,
  state: Pick<import('./gameTypes').WorldState, 'year' | 'dayInYear' | 'tick'>,
): number {
  if (entity.type === EntityType.Human) {
    return computeHumanAgeYears(entity, getColonyDay(state));
  }
  return Math.max(0, Math.floor(entity.age / DAYS_PER_YEAR));
}

export function getOldAgeDeathChance(age: number): number {
  if (age < HUMAN_VENERABLE_AGE) return 0;
  if (age >= HUMAN_MAX_LIFESPAN_YEARS) return 1;
  return 0.02 + (age - HUMAN_VENERABLE_AGE) / (HUMAN_MAX_LIFESPAN_YEARS - HUMAN_VENERABLE_AGE) * 0.98;
}

/** Small daily chance for an adult to die from illness or accident regardless of age. */
export const HUMAN_DAILY_ILLNESS_CHANCE = 0.00012;

/**
 * Once-per-calendar-day conception rolls (not per tick).
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

/** Calendar-aligned event intervals (replace legacy raw tick modulo). */
export const EVENT_INTERVAL = {
  disaster: ticksForDays(40),
  tradeRoute: ticksForDays(8),
  churchCure: ticksForDays(1),
  wolfRecruit: ticksForDays(21),
  tamedHuntAssist: ticksForDays(3),
} as const;

/** Marks the current calendar day as processed after the daily layer succeeds. */
export function markCalendarDayProcessed(state: import('./gameTypes').WorldState): void {
  if (state.tick > 0 && state.tick % TICKS_PER_DAY === 0) {
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
  const dayOfMonth = (entity.birthDay % 30) + 1;
  return `${MONTH_NAMES[month]} ${dayOfMonth}, ${realYear}`;
}

/** Keep parent childrenIds in sync with motherId/fatherId on each child. */
/** Rescale legacy per-tick/year ages to the v0.4 day-based calendar. */
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
    // Pre-v0.4.2 bug: +1 life-year every colony day (founder "66" at day 38).
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
  
  isKillableSettlerEntity,
  killHuman,
  
  reconcileOrphanedMarriages,
  
} from './humanLifecycleCleanup';
