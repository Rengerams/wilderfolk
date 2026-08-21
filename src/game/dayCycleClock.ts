export const TICKS_PER_HOUR = 3;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;
export const DAYS_PER_YEAR = 360;
export const PER_TICK_RATE_SCALE = 1 / TICKS_PER_HOUR;
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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
  const d = getWeekday(tick);
  return d === 5 || d === 6;
}

export function isWorkDay(tick: number): boolean {
  return !isWeekend(tick);
}
