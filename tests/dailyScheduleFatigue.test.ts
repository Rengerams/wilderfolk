import { describe, expect, it } from 'vitest';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { resolveDailyVillageScheduleFatigue } from '../src/game/dailyScheduleFatigue';

function state(): WorldState {
  return {
    tick: TICKS_PER_DAY,
    year: 0,
    dayInYear: 1,
    workSchedule: { startHour: 7, endHour: 19 },
    eventLog: [],
  } as unknown as WorldState;
}

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    alive: true,
    isJuvenile: false,
    faction: undefined,
    scheduleFatigue: 0,
    scheduleWorkedTicksToday: 0,
    ...overrides,
  } as Entity;
}

describe('daily village schedule fatigue', () => {
  it('emits one settlement summary for multiple meaningful work-fatigue increases', () => {
    const world = state();
    const settlers = [
      human(1, { scheduleWorkedTicksToday: 12 * TICKS_PER_HOUR }),
      human(2, { scheduleWorkedTicksToday: 12 * TICKS_PER_HOUR }),
    ];

    resolveDailyVillageScheduleFatigue(world, settlers);

    expect(world.eventLog).toHaveLength(1);
    expect(world.eventLog[0]?.message).toContain('reduced work output for 2 settlers');
    expect(world.eventLog[0]?.message).toContain('12.0h shifts');
    // Never a fatigue percentage: that scale runs the opposite way to the settler's energy out of
    // 500, so a bare percentage read as a crew near death rather than a crew working efficiently.
    expect(world.eventLog[0]?.message).not.toContain('%');
    // 12 worked hours against the 9-hour normal day: 3 excess x 10, less BASE_DAILY_RECOVERY(4) = 26.
    // The day is 9 hours (owner), so this is genuinely 3 hours of overtime rather than 4.
    expect(settlers.every((settler) => settler.scheduleFatigue === 26)).toBe(true);
  });

  it('applies off-shift zero-hour recovery without adding a work-related chronicle event', () => {
    const world = state();
    const settler = human(1, { scheduleFatigue: 80, scheduleWorkedTicksToday: 0 });

    resolveDailyVillageScheduleFatigue(world, [settler]);

    // Zero hours worked, so the whole 9-hour day counts as rest:
    // 80 - (BASE_DAILY_RECOVERY 4 + 9 x RECOVERY_PER_SHORT_HOUR 3) = 80 - 31 = 49.
    // It was 52 under the old 8-hour neutral day (8 x 3 of rest).
    expect(settler.scheduleFatigue).toBe(49);
    expect(world.eventLog).toHaveLength(0);
  });
});
