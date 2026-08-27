export const TICKS_PER_HOUR = 3;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;
export const LEGACY_TICKS_PER_DAY = 24;
export const DAYS_PER_YEAR = 360;
export const PER_TICK_RATE_SCALE = 1 / TICKS_PER_HOUR;
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type CalendarState = {
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
  if (tick <= 0) return 0;
  return Math.floor(tick / TICKS_PER_DAY) % DAYS_PER_YEAR;
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

export function ticksForDays(days: number): number {
  return Math.round(days * TICKS_PER_DAY);
}

/**
 * Scales a legacy systems-layer step count so calendar length matches the
 * original 24-tick-day era.
 */
export function systemsPulsesFromLegacy(legacyPulses: number): number {
  return Math.max(1, Math.round(legacyPulses * TICKS_PER_HOUR));
}

/** Absolute sim tick when clock hour 0–23 next begins at or after fromTick. */
export function nextTickAtClockHour(fromTick: number, hour: number): number {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const dayStart = Math.floor(fromTick / TICKS_PER_DAY) * TICKS_PER_DAY;
  let target = dayStart + normalizedHour * TICKS_PER_HOUR;
  if (fromTick >= target) target += TICKS_PER_DAY;
  return target;
}

/** True only on the first sub-hour tick of a clock hour. */
export function isStartOfClockHour(tick: number): boolean {
  return getTickOfDay(tick) % TICKS_PER_HOUR === 0;
}

/** Calendar-aligned production and rare-event gate. */
export function isProductionTick(tick: number, interval: number): boolean {
  if (tick <= 0 || interval <= 0) return false;
  if (tick % TICKS_PER_DAY !== 0) return false;
  const dayIndex = getAbsoluteCalendarDay(tick);
  const intervalDays = Math.max(1, Math.round(interval / TICKS_PER_DAY));
  if (dayIndex % intervalDays !== 0) return false;
  if (intervalDays <= 1 && !isWorkDay(tick)) return false;
  return true;
}

/** True once per in-game day; skips reload mid-day and duplicate same-tick calls. */
export function isNewCalendarDayTick(state: CalendarState): boolean {
  if (state.tick <= 0 || state.tick % TICKS_PER_DAY !== 0) return false;
  const day = getAbsoluteCalendarDay(state.tick);
  return day > (state.lastProcessedCalendarDay ?? -1);
}
