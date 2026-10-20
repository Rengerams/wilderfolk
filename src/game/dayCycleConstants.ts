/** Pure calendar/time constants with no game-module dependencies. */

/** Full moon hits every ~2 in-game weeks */
export const DAYS_PER_MOON_CYCLE = 14;

/** Adult floor: courtship, marriage, affairs, leadership, adoption singles and recruit ages. Must
 *  match `HUMAN_MOVE_OUT_MIN_AGE` and `Relationship.AFFAIR_MIN_AGE`; do not lower it. */
export const HUMAN_ADULT_MIN_AGE = 18;

/** Childhood in life-years ends where adulthood begins; the graduation tick promotes at this age. */
export const HUMAN_CHILDHOOD_YEARS = HUMAN_ADULT_MIN_AGE;

/** Age in life-years at which the old-age death rate starts to apply. */
export const HUMAN_VENERABLE_AGE = 60;


export const NIGHT_START = 23;
export const NIGHT_END = 6;

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START || hour < NIGHT_END;
}

/** @param colonyDay Absolute colony day (year * DAYS_PER_YEAR + dayInYear), never wrapping per year. */
export function isFullMoonDay(colonyDay: number): boolean {
  return colonyDay % DAYS_PER_MOON_CYCLE === 0;
}

/** Full-moon night spans 11pm on a full-moon day through 6am the next morning. */
export function isFullMoonNight(colonyDay: number, hourOfDay: number): boolean {
  if (!isNightHour(hourOfDay)) return false;
  if (isFullMoonDay(colonyDay)) return true;
  if (hourOfDay < NIGHT_END) {
    return isFullMoonDay(colonyDay - 1);
  }
  return false;
}
