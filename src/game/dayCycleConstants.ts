/** Pure calendar/time constants with no game-module dependencies. */

/** Full moon hits every ~2 in-game weeks */
export const DAYS_PER_MOON_CYCLE = 14;

export const HUMAN_ADULT_MIN_AGE = 16;

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
