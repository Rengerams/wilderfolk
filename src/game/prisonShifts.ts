/**
 * The prison roster: three nine-hour shifts with a one-hour handover, covering all 24 hours.
 *
 * The building's own `WorkSchedule` cannot express this — it is a single window and may not wrap
 * through midnight — so the roster owns the windows. A guard's shift is derived from their position in
 * the crew and the calendar week, which rotates the crew weekly without any saved state.
 */
import { getAbsoluteCalendarDay } from './dayCycleClock';

export type PrisonShiftKey = 'morning' | 'afternoon' | 'night';

export interface PrisonShift {
  key: PrisonShiftKey;
  label: string;
  /** Inclusive. */
  startHour: number;
  /** Exclusive, and below `startHour` when the shift wraps past midnight (24 = midnight). */
  endHour: number;
}

/**
 * Chronological order. A crew of three holds one shift each; the next week's rotation moves every
 * guard one shift on, so nobody keeps the nights.
 */
export const PRISON_SHIFTS: readonly PrisonShift[] = Object.freeze([
  { key: 'morning', label: 'Morning', startHour: 7, endHour: 16 },
  { key: 'afternoon', label: 'Afternoon / evening', startHour: 15, endHour: 24 },
  { key: 'night', label: 'Night', startHour: 23, endHour: 8 },
]);

/** One guard per shift — the crew that leaves no unguarded hour. */
export const PRISON_GUARDS_FOR_FULL_COVERAGE = PRISON_SHIFTS.length;

/**
 * How many prisoners a Prison holds: its occupancy minus the crew that keeps the doors shut. The beds
 * have one formula so the arrest path and the moon-howler conversion cannot disagree about them.
 */
export function prisonPrisonerCapacity(maxOccupants: number): number {
  return Math.max(1, maxOccupants - PRISON_GUARDS_FOR_FULL_COVERAGE);
}

export interface PrisonRosterEntry {
  shift: PrisonShift;
  /** The guard holding this shift, or `null` while it is vacant. */
  guardId: number | null;
}

export function shiftCoversHour(shift: PrisonShift, hour: number): boolean {
  if (shift.endHour > shift.startHour) return hour >= shift.startHour && hour < shift.endHour;
  return hour >= shift.startHour || hour < shift.endHour;
}

export function shiftLengthHours(shift: PrisonShift): number {
  const raw = shift.endHour - shift.startHour;
  return raw > 0 ? raw : raw + 24;
}

/** Every clock hour of the day, in order. */
export function shiftHours(shift: PrisonShift): number[] {
  const hours: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    if (shiftCoversHour(shift, hour)) hours.push(hour);
  }
  return hours;
}

/** Which shifts are on duty at this hour — two during a handover, never none. */
export function prisonShiftsAtHour(hour: number): PrisonShift[] {
  return PRISON_SHIFTS.filter((shift) => shiftCoversHour(shift, hour));
}

/**
 * The week the game's own weekday numbering defines: `getWeekday` is `absoluteDay % 7`, so a week
 * starts where that remainder returns to zero.
 */
export function prisonWeekIndex(tick: number): number {
  return Math.floor(getAbsoluteCalendarDay(tick) / 7);
}

/** The shift a guard holds: their crew position, advanced one shift per calendar week. */
export function shiftForCrewIndex(crewIndex: number, weekIndex: number): PrisonShift {
  const count = PRISON_SHIFTS.length;
  const index = (((crewIndex + weekIndex) % count) + count) % count;
  return PRISON_SHIFTS[index];
}

/**
 * The one roster rule the guard duty and the prison window both read. Crew order is by id, so the
 * rotation is stable and no guard is moved off a shift mid-week.
 */
export function prisonRoster(guardIds: readonly number[], tick: number): PrisonRosterEntry[] {
  const week = prisonWeekIndex(tick);
  const crew = [...guardIds].sort((a, b) => a - b);
  const roster: PrisonRosterEntry[] = PRISON_SHIFTS.map((shift) => ({ shift, guardId: null }));
  crew.forEach((guardId, crewIndex) => {
    const held = shiftForCrewIndex(crewIndex, week);
    const entry = roster.find((row) => row.shift.key === held.key);
    if (entry && entry.guardId == null) entry.guardId = guardId;
  });
  return roster;
}

/** The shift this guard holds, or `null` when he is not on the roster. */
export function prisonShiftForGuard(
  guardId: number,
  guardIds: readonly number[],
  tick: number,
): PrisonShift | null {
  return prisonRoster(guardIds, tick).find((entry) => entry.guardId === guardId)?.shift ?? null;
}

/** Every hour with no guard holding a shift that covers it. */
export function unguardedPrisonHours(roster: readonly PrisonRosterEntry[]): number[] {
  const covered = new Set<number>();
  for (const entry of roster) {
    if (entry.guardId == null) continue;
    for (const hour of shiftHours(entry.shift)) covered.add(hour);
  }
  const unguarded: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    if (!covered.has(hour)) unguarded.push(hour);
  }
  return unguarded;
}

export function vacantPrisonShifts(roster: readonly PrisonRosterEntry[]): PrisonShift[] {
  return roster.filter((entry) => entry.guardId == null).map((entry) => entry.shift);
}
