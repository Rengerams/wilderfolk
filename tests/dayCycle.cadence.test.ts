/**
 * Cadence regressions after TICKS_PER_DAY=72 — pure clock helpers + production gate.
 * These fail if someone reintroduces "1 tick = 1 hour" or weekend-starved multi-day production.
 */
import { describe, expect, it } from 'vitest';
import {
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  PER_TICK_RATE_SCALE,
  ticksForDays,
  systemsPulsesFromLegacy,
  nextTickAtClockHour,
  getHourOfDay,
  getAbsoluteCalendarDay,
  isProductionTick,
  isWeekend,
  isNearResidence,
  NIGHT_END,
} from '../src/game/dayCycle';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { OFFSCREEN_HUMAN_THROTTLE } from '../src/game/simFocus';

describe('day resolution (no loose magic numbers)', () => {
  it('keeps 24 clock hours as TICKS_PER_HOUR sub-steps', () => {
    expect(TICKS_PER_DAY).toBe(24 * TICKS_PER_HOUR);
    expect(PER_TICK_RATE_SCALE).toBeCloseTo(1 / TICKS_PER_HOUR);
  });

  it('maps tick-of-day to clock hour', () => {
    // Mid-day hour 12 → first tick of that hour
    const noonTick = 12 * TICKS_PER_HOUR;
    expect(getHourOfDay(noonTick)).toBe(12);
    expect(getHourOfDay(noonTick + TICKS_PER_HOUR - 1)).toBe(12);
    expect(getHourOfDay(noonTick + TICKS_PER_HOUR)).toBe(13);
  });

  it('ticksForDays scales with day length', () => {
    expect(ticksForDays(1)).toBe(TICKS_PER_DAY);
    expect(ticksForDays(2)).toBe(TICKS_PER_DAY * 2);
  });

  it('systemsPulsesFromLegacy stretches legacy systems step counts with day resolution', () => {
    // Legacy "200 systems pulses" must not stay 200 when each day has 3× more systems calls
    expect(systemsPulsesFromLegacy(200)).toBe(200 * TICKS_PER_HOUR);
    expect(systemsPulsesFromLegacy(360)).toBe(360 * TICKS_PER_HOUR);
  });

  it('nextTickAtClockHour lands on next NIGHT_END morning after evening', () => {
    const evening = 20 * TICKS_PER_HOUR; // day 0, 20:00
    const checkout = nextTickAtClockHour(evening, NIGHT_END);
    expect(getHourOfDay(checkout)).toBe(NIGHT_END);
    // Must be next calendar day, not same evening + 24h of ticks from a wrong formula
    expect(getAbsoluteCalendarDay(checkout)).toBe(1);
    expect(checkout).toBe(TICKS_PER_DAY + NIGHT_END * TICKS_PER_HOUR);
  });
});

describe('isProductionTick (EJ-11)', () => {
  const dayBoundary = (day: number) => day * TICKS_PER_DAY;
  const daily = TICKS_PER_DAY; // farm-style
  const everyTwoDays = ticksForDays(2); // store/market-style

  it('daily work fires weekdays only at midnight boundary', () => {
    // tick 0 is excluded by isProductionTick (startup guard); use day 7 Mon onward
    // day 7 Mon, 12 Sat, 13 Sun, 14 Mon
    expect(isWeekend(dayBoundary(7))).toBe(false);
    expect(isProductionTick(dayBoundary(7), daily)).toBe(true);

    expect(isWeekend(dayBoundary(12))).toBe(true);
    expect(isProductionTick(dayBoundary(12), daily)).toBe(false);

    expect(isWeekend(dayBoundary(13))).toBe(true);
    expect(isProductionTick(dayBoundary(13), daily)).toBe(false);

    expect(isProductionTick(dayBoundary(14), daily)).toBe(true);
  });

  it('multi-day interval still fires when the calendar day is a weekend', () => {
    // day 6 Sunday is even → dayIndex % 2 === 0 — must not be starved by isWorkDay
    expect(isWeekend(dayBoundary(6))).toBe(true);
    expect(isProductionTick(dayBoundary(6), everyTwoDays)).toBe(true);
    // odd weekday does not match interval 2
    expect(isProductionTick(dayBoundary(7), everyTwoDays)).toBe(false);
    expect(isProductionTick(dayBoundary(8), everyTwoDays)).toBe(true);
  });

  it('never fires mid-day (only day boundary)', () => {
    expect(isProductionTick(dayBoundary(7) + 1, daily)).toBe(false);
    expect(isProductionTick(dayBoundary(8) + TICKS_PER_HOUR, everyTwoDays)).toBe(false);
  });
});

describe('day-length scaling (no 3× spam after 72 TPD)', () => {
  it('off-screen human throttle matches ~8 clock hours at current day resolution', () => {
    // Legacy: every 8 ticks when 1 tick = 1 hour. Now: 8 * TICKS_PER_HOUR.
    expect(OFFSCREEN_HUMAN_THROTTLE).toBe(8 * TICKS_PER_HOUR);
    expect(OFFSCREEN_HUMAN_THROTTLE).toBe(24);
  });

  it('isNearResidence accepts buildingById Map (O(1) path)', () => {
    const house = {
      id: 7,
      type: BuildingType.House,
      completed: true,
      x: 100,
      y: 100,
      width: 40,
      height: 40,
    } as Building;
    const human = {
      residenceBuildingId: 7,
      x: 110,
      y: 110,
    } as Entity;
    const map = new Map<number, Building>([[7, house]]);
    expect(isNearResidence(human, map)).toBe(true);
    expect(isNearResidence(human, [house])).toBe(true);
    human.x = 400;
    expect(isNearResidence(human, map)).toBe(false);
  });
});
