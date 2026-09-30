import { Time } from './gameConstants';

/** The tick rate and day length are owned by `gameConstants.Time`; this module only derives. */
export const TICKS_PER_HOUR = Time.TICKS_PER_HOUR;
export const TICKS_PER_DAY = Time.HOURS_PER_DAY * TICKS_PER_HOUR;
export const LEGACY_TICKS_PER_DAY = 24;
export const DAYS_PER_YEAR = Time.DAYS_PER_YEAR;
export const PER_TICK_RATE_SCALE = 1 / TICKS_PER_HOUR;
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type CalendarState = {
  tick: number;
  lastProcessedCalendarDay?: number;
};

export function getTickOfDay(tick: number): number {
  return ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

export function getHourOfDay(tick: number): number {
  return Math.floor(getTickOfDay(tick) / TICKS_PER_HOUR);
}

export function getCalendarDay(tick: number): number {
  const day = Math.floor(tick / TICKS_PER_DAY);
  return ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
}

export function getAbsoluteCalendarDay(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

export function getWeekday(tick: number): number {
  return ((getAbsoluteCalendarDay(tick) % 7) + 7) % 7;
}

export function getWeekdayLabel(tick: number): string {
  return WEEKDAY_LABELS[getWeekday(tick)] ?? 'Mon';
}

export function isWeekend(tick: number): boolean {
  const day = getWeekday(tick);
  return day === 5 || day === 6;
}

export function isWorkDay(tick: number): boolean {
  return !isWeekend(tick);
}

/**
 * The player's year: `WorldState.year` counts closed years from 0, so the first year reads as 1.
 * Pass only an absolute year — a term interval such as `ELECTION_INTERVAL_YEARS` is a length.
 */
export function displayYear(storedYear: number): number {
  return storedYear + 1;
}

export function ticksForDays(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.round(days * TICKS_PER_DAY);
}

/**
 * Whole days from `nowTick` until `untilTick`, never negative — the countdown the inspectors show for
 * a prison sentence, a diplomacy deadline and a festival cooldown.
 *
 * `ticksForDays` is the inverse conversion and lives here too, so the forward one belongs beside it:
 * four views and the header each wrote `Math.ceil((untilTick - tick) / TICKS_PER_DAY)` by hand, two of
 * them without the lower clamp, so an elapsed deadline could read as a negative day count
 */
export function daysUntilTick(nowTick: number, untilTick: number): number {
  if (!Number.isFinite(nowTick) || !Number.isFinite(untilTick)) return 0;
  return Math.max(0, Math.ceil((untilTick - nowTick) / TICKS_PER_DAY));
}

/**
 * Scales a legacy systems-layer step count so calendar length matches the
 * original 24-tick-day era.
 */
export function systemsPulsesFromLegacy(legacyPulses: number): number {
  if (!Number.isFinite(legacyPulses) || legacyPulses <= 0) return 0;
  return Math.max(1, Math.round(legacyPulses * TICKS_PER_HOUR));
}

/** Absolute sim tick when clock hour 0–23 next begins at or after fromTick. */
export function nextTickAtClockHour(fromTick: number, hour: number): number {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const dayStart = Math.floor(fromTick / TICKS_PER_DAY) * TICKS_PER_DAY;
  let target = dayStart + normalizedHour * TICKS_PER_HOUR;
  // Corrected: only advance to tomorrow if fromTick is strictly past the hour start
  if (fromTick > target) target += TICKS_PER_DAY;
  return target;
}

/** True only on the first sub-hour tick of a clock hour. */
export function isStartOfClockHour(tick: number): boolean {
  return getTickOfDay(tick) % TICKS_PER_HOUR === 0;
}

/** Calendar-aligned production and rare-event gate. */
export function isProductionTick(tick: number, interval: number): boolean {
  if (!Number.isFinite(tick) || tick <= 0 || !Number.isFinite(interval) || interval <= 0) {
    return false;
  }
  if (getTickOfDay(tick) !== 0) return false;
  const dayIndex = getAbsoluteCalendarDay(tick);
  const intervalDays = Math.max(1, Math.round(interval / TICKS_PER_DAY));
  if (dayIndex % intervalDays !== 0) return false;
  if (intervalDays <= 1 && !isWorkDay(tick)) return false;
  return true;
}

/**
 * True once per in-game day; skips reload mid-day and duplicate same-tick calls.
 * Polymorphic: accepts either a CalendarState object or a raw tick number.
 */
export function isNewCalendarDayTick(
  stateOrTick: CalendarState | number,
  lastProcessedCalendarDay?: number,
): boolean {
  const tick = typeof stateOrTick === 'number' ? stateOrTick : stateOrTick.tick;
  const lastProcessed =
    typeof stateOrTick === 'number'
      ? lastProcessedCalendarDay
      : stateOrTick.lastProcessedCalendarDay;

  if (!Number.isFinite(tick) || tick <= 0) return false;
  if (getTickOfDay(tick) !== 0) return false;

  const day = getAbsoluteCalendarDay(tick);
  return lastProcessed == null || day > lastProcessed;
}