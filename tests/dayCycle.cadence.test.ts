import { recordElectionPromises } from '../src/game/electionPromises';
import { SKILL_IDLE_DECAY_PER_DAY } from '../src/game/skills';
import { isPlayerHuman } from '../src/game/playerHuman';
import { assertSimInvariants } from '../src/game/simulation/simInvariants';
import { tickAtDailyPhase } from '../src/game/dayCycleClock';
import { gameTick, initGame } from '../src/game/gameEngine';
/**
 * Cadence regressions for the canonical 288-tick day — pure clock helpers + production gate.
 * These fail if someone reintroduces "1 tick = 1 hour" or weekend-starved multi-day production.
 */
import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_YEAR,
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
  NIGHT_END,
} from '../src/game/dayCycle';
import { isNearResidence } from '../src/game/housingModel';
import { BuildingType, EntityType, JobType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
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

describe('day-length scaling (no legacy-rate overscheduling)', () => {
  it('off-screen human throttle runs every 2 clock hours at the higher resolution', () => {
    // Twenty-four ticks now span two in-game hours; offscreen travel needs regular AI.
    expect(OFFSCREEN_HUMAN_THROTTLE).toBe(2 * TICKS_PER_HOUR);
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

describe('real gameTick calendar integration', () => {
  const SEED = 20261107;

  function worldBeforeDay(day: number): WorldState {
    const world = initGame({ size: MapSize.Medium, seed: SEED });
    world.tick = day * TICKS_PER_DAY - 1;
    world.year = Math.floor((day - 1) / DAYS_PER_YEAR);
    world.dayInYear = (day - 1) % DAYS_PER_YEAR;
    world.lastProcessedCalendarDay = day - 1;
    world.paused = false;
    return world;
  }

  describe('day and year boundary behavior', () => {
    it('SIM-01: real gameTick starts the term election on year 2 at 00:00', () => {
      const world = worldBeforeDay(2 * DAYS_PER_YEAR);
      world.lastElectionYear = 0;
      world.pendingElectionYear = null;
      world.electionCeremony = null;

      // One real tick before the boundary MUST NOT elect. The next real tick MUST elect.
      world.tick -= 1;
      const before = gameTick(world);
      expect(before.year).toBe(1);
      expect(before.electionCeremony).toBeNull();

      const after = gameTick(before);
      expect(after.year).toBe(2);
      expect(after.dayInYear).toBe(0);
      expect(after.electionCeremony?.reason).toBe('term');
      expect(after.eventLog.filter((event) => event.message.includes('Leadership election ceremony began'))).toHaveLength(1);
      expect(assertSimInvariants(after)).toEqual([]);

      // Only the midnight scheduler may start the term ceremony. Jump to the
      // next 06:00 and 18:00 gates, still using real gameTick (not owner calls).
      for (const phase of ['relationships', 'worldEvents'] as const) {
        after.tick = tickAtDailyPhase(2 * DAYS_PER_YEAR, phase) - 1;
        gameTick(after);
        expect(after.eventLog.filter((event) => event.message.includes('Leadership election ceremony began'))).toHaveLength(1);
        expect(assertSimInvariants(after)).toEqual([]);
      }
    });

    it('SIM-02: real gameTick decays an unused skill exactly once at midnight', () => {
      const world = worldBeforeDay(7);
      const settler = world.entities.find((entity) => entity.alive && !entity.isJuvenile && isPlayerHuman(entity));
      expect(settler).toBeDefined();
      if (!settler) return;
      settler.job = JobType.Settler;
      settler.skills = { [JobType.Miner]: 50 };

      gameTick(world);

      const afterMidnight = 50 - SKILL_IDLE_DECAY_PER_DAY;
      expect(settler.skills[JobType.Miner]).toBeCloseTo(afterMidnight, 8);
      expect(world.lastProcessedCalendarDay).toBe(7);

      // Social (06:00) and economy/world-events (18:00) must not apply a second decay.
      for (const phase of ['relationships', 'worldEvents'] as const) {
        world.tick = tickAtDailyPhase(7, phase) - 1;
        gameTick(world);
        expect(settler.skills[JobType.Miner]).toBeCloseTo(afterMidnight, 8);
      }
    });

    it('TEST-16: daily calendar passes never create on-map visitor camps', () => {
      // All retired entry paths: week-one invitation, year-one midyear visit, yearly roll.
      for (const day of [8, DAYS_PER_YEAR + 180, DAYS_PER_YEAR * 2]) {
        const world = worldBeforeDay(day);
        gameTick(world);
        world.tick = tickAtDailyPhase(day, 'worldEvents') - 1;
        gameTick(world);
        expect(world.visitorGroups, `day ${day}`).toHaveLength(0);
        expect(world.entities.some((entity) => entity.faction === 'visitor'), `day ${day}`).toBe(false);
      }
    });
    it('SIM-06/07: promises are judged at the 18:00 world-events boundary only once', () => {
      const world = worldBeforeDay(7);
      gameTick(world); // Enter day 7 at midnight through the real scheduler.
      recordElectionPromises(world, world.year);
      const record = world.electionPromiseRecords?.at(-1);
      expect(record).toBeDefined();
      if (!record) return;
      record.dueDay = 7;

      world.tick = tickAtDailyPhase(7, 'worldEvents') - 2;
      gameTick(world); // Not yet 18:00.
      expect(record.evaluated).toBe(false);

      gameTick(world); // Actual 18:00 pass.
      expect(record.evaluated).toBe(true);
      const verdicts = () => world.eventLog.filter((event) =>
        event.message.includes(`Election #${record.electionId}:`) && event.message.includes('promises.'));
      expect(verdicts()).toHaveLength(1);

      world.tick = tickAtDailyPhase(8, 'worldEvents') - 1;
      gameTick(world); // Following evening must not re-judge.
      expect(verdicts()).toHaveLength(1);
    });

    it('A1: day 7, day 30 and day 360 preserve calendar, food, skills and population', () => {
      for (const day of [7, 30, DAYS_PER_YEAR]) {
        const world = worldBeforeDay(day);
        const settler = world.entities.find((entity) => entity.alive && !entity.isJuvenile && isPlayerHuman(entity));
        expect(settler).toBeDefined();
        if (!settler) continue;
        settler.job = JobType.Settler;
        settler.skills = { [JobType.Miner]: 50 };
        const storedFood = world.resources.food;

        gameTick(world);

        expect(world.tick).toBe(day * TICKS_PER_DAY);
        expect(world.dayInYear).toBe(day % DAYS_PER_YEAR);
        expect(world.year).toBe(Math.floor(day / DAYS_PER_YEAR));
        expect(settler.skills[JobType.Miner]).toBeCloseTo(50 - SKILL_IDLE_DECAY_PER_DAY, 8);
        expect(Number.isFinite(storedFood)).toBe(true);
        expect(Number.isFinite(world.resources.food)).toBe(true);
        expect(world.resources.food).toBeGreaterThanOrEqual(0);
        expect(world.humanPopulation).toBeGreaterThan(0);
        expect(assertSimInvariants(world)).toEqual([]);
      }
    });

    it('A1: wildlife reaches old age at midnight, not 18:00', () => {
      const world = worldBeforeDay(7);
      const wildlifeTypes: ReadonlySet<EntityType> = new Set([
        EntityType.Rabbit, EntityType.Deer, EntityType.Wolf, EntityType.Fox,
      ]);
      const wildlife = world.entities.find((entity) =>
        entity.alive && Number.isFinite(entity.maxAge) && entity.maxAge > 1
          && wildlifeTypes.has(entity.type));
      expect(wildlife).toBeDefined();
      if (!wildlife) return;
      const maxAge = wildlife.maxAge;
      wildlife.age = maxAge - 1;

      gameTick(world);
      expect(wildlife.age).toBe(maxAge);
      expect(wildlife.alive).toBe(false);

      world.tick = tickAtDailyPhase(7, 'worldEvents') - 1;
      gameTick(world);
      expect(wildlife.age).toBe(maxAge);
      expect(wildlife.alive).toBe(false);
    });

    it('GAME-01: a term ceremony finishes after 24 game hours plus one reveal tick', () => {
      const world = worldBeforeDay(2 * DAYS_PER_YEAR);
      world.lastElectionYear = 0;
      world.pendingElectionYear = null;
      expect(world.electionCeremony).toBeNull();
      gameTick(world);
      expect(world.electionCeremony?.reason).toBe('term');
      expect(world.electionCeremony?.phase).toBe('gathering');

      for (let tick = 0; tick < TICKS_PER_DAY; tick++) gameTick(world);
      expect(world.electionCeremony?.phase).toBe('reveal');
      const electionTick = world.tick;
      gameTick(world);
      expect(world.tick).toBe(electionTick + 1);
      expect(world.electionCeremony).toBeNull();
      expect(world.lastElectionYear).toBe(2);
      expect(world.eventLog.some((event) => event.message.includes('Election revelry began'))).toBe(true);
      expect(assertSimInvariants(world)).toEqual([]);
    });

  });
});
