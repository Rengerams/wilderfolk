import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';
import {
  getScheduleProductivityMultiplier,
  getScheduleFatigue,
  resolveDailyScheduleFatigue,
} from '../src/game/scheduleFatigue';

const state = { workSchedule: { startHour: 7, endHour: 18 } };
const human = (overrides: Partial<{ scheduleFatigue: number; scheduleWorkedTicksToday: number }> = {}) => ({
  id: 1,
  alive: true,
  isJuvenile: false,
  scheduleFatigue: 0,
  scheduleWorkedTicksToday: 0,
  ...overrides,
});

describe('schedule fatigue', () => {
  it('adds bounded fatigue after an extended workday', () => {
    const worker = human({ scheduleWorkedTicksToday: 10 * TICKS_PER_HOUR });
    const result = resolveDailyScheduleFatigue(worker, state);
    expect(result.workedHours).toBe(10);
    expect(result.fatigueAfter).toBeGreaterThan(0);
    expect(result.fatigueAfter).toBeLessThanOrEqual(100);
    expect(worker.scheduleWorkedTicksToday).toBe(0);
  });

  it('recovers more on a short day and never drops below zero', () => {
    const worker = human({ scheduleFatigue: 5, scheduleWorkedTicksToday: 4 * TICKS_PER_HOUR });
    const result = resolveDailyScheduleFatigue(worker, state);
    expect(result.fatigueAfter).toBe(0);
    expect(getScheduleFatigue(worker)).toBe(0);
  });

  it('keeps neutral eight-hour work at the bounded daily recovery rate', () => {
    const worker = human({ scheduleFatigue: 30, scheduleWorkedTicksToday: 8 * TICKS_PER_HOUR });
    const result = resolveDailyScheduleFatigue(worker, state);
    expect(result.fatigueAfter).toBe(26);
  });

  it('keeps productivity above the documented safety floor', () => {
    expect(getScheduleProductivityMultiplier({ scheduleFatigue: 0 })).toBe(1);
    expect(getScheduleProductivityMultiplier({ scheduleFatigue: 100 })).toBe(0.65);
  });
});
