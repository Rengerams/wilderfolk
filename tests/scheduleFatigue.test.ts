import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';
import type { Entity } from '../src/game/gameTypes';
import {
  getScheduleProductivityMultiplier,
  getScheduleFatigue,
  resolveDailyScheduleFatigue,
} from '../src/game/scheduleFatigue';

const state = { workSchedule: { startHour: 7, endHour: 18 } };

/**
 * The owner reads exactly these two numbers and nothing else — no `id`, no `alive`, no
 * `isJuvenile`. `resolveDailyScheduleFatigue` still declares `entity: Entity` while its two
 * siblings in the same file take `Pick<Entity, 'scheduleFatigue'>`; narrowing it the same way
 * would make this fixture type-check with no assertion at all. That is a `src/` change and is
 * reported, not made here, so the subject is annotated with the shared shape and asserted at
 * each call site below.
 */
type ScheduleFatigueSubject = Pick<
  Entity,
  'scheduleFatigue' | 'scheduleWorkedTicksToday'
>;

const human = (
  overrides: Partial<ScheduleFatigueSubject> = {},
): ScheduleFatigueSubject => ({
  scheduleFatigue: 0,
  scheduleWorkedTicksToday: 0,
  ...overrides,
});

/** The two properties are what the owner reads; the absent `Entity` fields are never touched. */
const asEntity = (subject: ScheduleFatigueSubject): Entity => subject as Entity;

describe('schedule fatigue', () => {
  it('adds bounded fatigue after an extended workday', () => {
    const worker = human({ scheduleWorkedTicksToday: 10 * TICKS_PER_HOUR });
    const result = resolveDailyScheduleFatigue(asEntity(worker), state);
    expect(result.workedHours).toBe(10);
    expect(result.fatigueAfter).toBeGreaterThan(0);
    expect(result.fatigueAfter).toBeLessThanOrEqual(100);
    expect(worker.scheduleWorkedTicksToday).toBe(0);
  });

  it('recovers more on a short day and never drops below zero', () => {
    const worker = human({ scheduleFatigue: 5, scheduleWorkedTicksToday: 4 * TICKS_PER_HOUR });
    const result = resolveDailyScheduleFatigue(asEntity(worker), state);
    expect(result.fatigueAfter).toBe(0);
    expect(getScheduleFatigue(worker)).toBe(0);
  });

  it('keeps a neutral nine-hour day at the bounded daily recovery rate', () => {
    // The normal work day is 9 hours (owner, 2026-09-29), and `NEUTRAL_WORK_HOURS` now matches
    // `STANDARD_PRODUCTION_WORK_HOURS`. At exactly 9 there is no excess, so fatigue only recovers:
    // 30 - BASE_DAILY_RECOVERY(4) = 26. Under the old 8-hour neutral this same standard day was
    // charged `FATIGUE_PER_EXCESS_HOUR` for one hour of overtime and landed on 36.
    const worker = human({ scheduleFatigue: 30, scheduleWorkedTicksToday: 9 * TICKS_PER_HOUR });
    const result = resolveDailyScheduleFatigue(asEntity(worker), state);
    expect(result.fatigueAfter).toBe(26);
  });

  it('charges overtime only past the nine-hour day', () => {
    const worker = human({ scheduleFatigue: 0, scheduleWorkedTicksToday: 10 * TICKS_PER_HOUR });
    const result = resolveDailyScheduleFatigue(asEntity(worker), state);
    // One excess hour: 0 + 1 x 10 - BASE_DAILY_RECOVERY(4) = 6.
    expect(result.fatigueAfter).toBe(6);
  });

  it('keeps productivity above the documented safety floor', () => {
    expect(getScheduleProductivityMultiplier({ scheduleFatigue: 0 })).toBe(1);
    expect(getScheduleProductivityMultiplier({ scheduleFatigue: 100 })).toBe(0.65);
  });
});
