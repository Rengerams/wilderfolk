/** Pure calendar/time constants with no game-module dependencies. */

/** Full moon hits every ~2 in-game weeks */
export const DAYS_PER_MOON_CYCLE = 14;

/**
 * Adult floor: courtship, marriage, affairs, leadership, adoption singles and recruit ages.
 * 18 is the documented age ladder (`docs/archive/FERTILITY_AGE14_F1.md`: "The adult marriage
 * threshold remains 18"; `docs/archive/YOUTH_LOVE_FEATURE.md`: "18 = Adult transition"), and it
 * matches `HUMAN_MOVE_OUT_MIN_AGE` (18) in `residencyOccupancy.ts` and `Relationship.AFFAIR_MIN_AGE`
 * (18). It was 16 until 2026-09-16, which let 16–17 year olds court, be recruited as adults, be
 * offered a home of their own and be elected leader — see
 * `BUG_REPORTS/2026-09-16-adult-floor-was-16-against-the-documented-18.md`.
 * Full age ladder lives next to related constants in `dayCycle.ts` (EK-E4).
 */
export const HUMAN_ADULT_MIN_AGE = 18;

/** Colony days a human stays a juvenile; `tryGraduateHumanChild` promotes on the graduation tick. */
export const HUMAN_CHILDHOOD_DAYS = 12;

/** Age in life-years at which the old-age death rate starts to apply. */
export const HUMAN_VENERABLE_AGE = 60;


export const NIGHT_START = 20;
export const NIGHT_END = 6;

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START || hour < NIGHT_END;
}

/** @param colonyDay Absolute colony day (year * DAYS_PER_YEAR + dayInYear), never wrapping per year. */
export function isFullMoonDay(colonyDay: number): boolean {
  return colonyDay % DAYS_PER_MOON_CYCLE === 0;
}

/** Full-moon night spans 8pm on a full-moon day through 6am the next morning. */
export function isFullMoonNight(colonyDay: number, hourOfDay: number): boolean {
  if (!isNightHour(hourOfDay)) return false;
  if (isFullMoonDay(colonyDay)) return true;
  if (hourOfDay < NIGHT_END) {
    return isFullMoonDay(colonyDay - 1);
  }
  return false;
}
