/**
 * The prison roster: three nine-hour shifts with a one-hour handover, assigned to the crew and
 * rotated weekly. The duty pass reads only these rules, so the arithmetic is what keeps a prison
 * staffed or leaking.
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/gameTypes';
import {
  PRISON_GUARDS_FOR_FULL_COVERAGE,
  PRISON_SHIFTS,
  prisonPrisonerCapacity,
  prisonRoster,
  prisonShiftsAtHour,
  prisonWeekIndex,
  shiftHours,
  unguardedPrisonHours,
  vacantPrisonShifts,
} from '../src/game/prisonShifts';

describe('the roster covers the day', () => {
  it('is three nine-hour shifts whose one-hour handovers cover all 24 hours', () => {
    expect(PRISON_SHIFTS.map((shift) => shiftHours(shift).length)).toEqual([9, 9, 9]);

    const covered = new Set<number>();
    let handoverHours = 0;
    for (let hour = 0; hour < 24; hour++) {
      const shifts = prisonShiftsAtHour(hour);
      expect(shifts.length).toBeGreaterThan(0);
      if (shifts.length > 1) handoverHours += 1;
      for (const shift of shifts) for (const h of shiftHours(shift)) covered.add(h);
    }

    // 27 h of work over 24 h of day leaves exactly three one-hour handovers, and no gap.
    expect(handoverHours).toBe(3);
    expect(covered.size).toBe(24);
  });

  it('puts one guard on every shift and moves each of them one shift on each week', () => {
    const crew = [11, 22, 33];
    const first = prisonRoster(crew, 0);
    expect(first.map((entry) => entry.guardId)).toEqual([11, 22, 33]);
    expect(unguardedPrisonHours(first)).toEqual([]);

    const second = prisonRoster(crew, 7 * TICKS_PER_DAY);
    expect(second.map((entry) => entry.guardId)).toEqual([33, 11, 22]);
    expect(unguardedPrisonHours(second)).toEqual([]);

    // Three weeks on, the rotation is back where it started.
    expect(prisonRoster(crew, 21 * TICKS_PER_DAY).map((e) => e.guardId)).toEqual([11, 22, 33]);
  });

  it('leaves open the vacant shift\u2019s hours, minus what its neighbours\u2019 handovers cover', () => {
    // Week 0, two guards: crew positions 0 and 1 take morning and afternoon, so the night is vacant.
    const roster = prisonRoster([11, 22], 0);
    expect(PRISON_GUARDS_FOR_FULL_COVERAGE).toBe(3);
    expect(vacantPrisonShifts(roster).map((shift) => shift.key)).toEqual(['night']);
    // The night runs 23:00-08:00, but 23:00 is the afternoon's last hour and 07:00 the morning's
    // first: with the handover, one missing guard leaves seven hours open rather than nine.
    expect(unguardedPrisonHours(roster)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('leaves the whole day open with no crew at all', () => {
    expect(unguardedPrisonHours(prisonRoster([], 0))).toHaveLength(24);
  });

  it('starts a new week where the game clock does', () => {
    expect(prisonWeekIndex(0)).toBe(0);
    expect(prisonWeekIndex(6 * TICKS_PER_DAY)).toBe(0);
    expect(prisonWeekIndex(7 * TICKS_PER_DAY)).toBe(1);
  });
});

describe('the prison holds four prisoners beside its guard shifts', () => {
  it('counts the cells as the occupancy left after the crew that covers the day', () => {
    const occupancy = BUILDING_CONFIGS[BuildingType.Prison].maxOccupants;
    expect(prisonPrisonerCapacity(occupancy)).toBe(4);
    // Both sides of the split, so a change to either the building or the roster shows up here.
    expect(occupancy).toBe(PRISON_GUARDS_FOR_FULL_COVERAGE + 4);
  });
});
