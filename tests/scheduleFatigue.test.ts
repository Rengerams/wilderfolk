import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';
import type { Entity } from '../src/game/gameTypes';
import {
  getScheduleProductivityMultiplier,
  getScheduleFatigue,
  recordScheduleWorkTick,
  resolveDailyScheduleFatigue,
} from '../src/game/scheduleFatigue';
import { human as settler } from '../src/test/factories';

const state = { workSchedule: { startHour: 7, endHour: 18 } };

/**
 * `resolveDailyScheduleFatigue` reads only `scheduleFatigue` and
 * `scheduleWorkedTicksToday`, so the fixture carries only that shared shape.
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
    // A neutral nine-hour day has no excess, so fatigue only recovers:
    // 30 - BASE_DAILY_RECOVERY(4) = 26.
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

  it('credits no attendance to a jailed settler', () => {
    const free = settler(1);
    const jailed = settler(2, { prisonBuildingId: 9, prisonerUntilTick: 500 });

    recordScheduleWorkTick(free, 3);
    recordScheduleWorkTick(jailed, 3);

    expect(free.scheduleWorkedTicksToday).toBe(3);
    expect(jailed.scheduleWorkedTicksToday).toBeUndefined();
  });

  it('keeps productivity above the documented safety floor', () => {
    expect(getScheduleProductivityMultiplier({ scheduleFatigue: 0 })).toBe(1);
    expect(getScheduleProductivityMultiplier({ scheduleFatigue: 100 })).toBe(0.65);
  });
});
