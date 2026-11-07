/** Calendar-phase audit regressions: assertions reach each owner through real gameTick. */
import { describe, expect, it } from 'vitest';
import { gameTick, initGame } from '../src/game/gameEngine';
import { DAYS_PER_YEAR, TICKS_PER_DAY, tickAtDailyPhase } from '../src/game/dayCycleClock';
import { assertSimInvariants } from '../src/game/simulation/simInvariants';
import { EntityType, JobType, MapSize, type VisitorGroup, type WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { SKILL_IDLE_DECAY_PER_DAY } from '../src/game/skills';
import { recordElectionPromises } from '../src/game/electionPromises';

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

describe('audit calendar phase integration', () => {
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

  it('TEST-16: a visitor camp gifts, loses days and eventually departs via gameTick', () => {
    const world = worldBeforeDay(7);
    const startReputation = world.villageReputation ?? 0;
    const camp = {
      id: 'audit-calendar-camp',
      name: 'Audit Pilgrims',
      kind: 'pilgrims',
      campX: 100,
      campY: 100,
      daysLeft: 3,
      spawnedAtCalendarDay: 5,
      entityIds: [],
      giftsGiven: 0,
      tradesCompleted: 0,
      gold: 0,
      refugeeResolved: true,
      leaderTalked: false,
    } satisfies VisitorGroup;
    world.visitorGroups.push(camp);

    gameTick(world);
    expect(camp.daysLeft).toBe(2);
    expect(camp.giftsGiven).toBe(1);
    expect(world.villageReputation).toBe(startReputation + 2);

    world.tick = 8 * TICKS_PER_DAY - 1;
    gameTick(world);
    expect(camp.daysLeft).toBe(1);
    expect(camp.giftsGiven).toBe(2);

    world.tick = 9 * TICKS_PER_DAY - 1;
    gameTick(world);
    expect(world.visitorGroups).not.toContain(camp);
    expect(world.eventLog.some((event) => event.message.includes('Audit Pilgrims departed'))).toBe(true);
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
    const wildlife = world.entities.find((entity) =>
      entity.alive && Number.isFinite(entity.maxAge) && entity.maxAge > 1
        && [EntityType.Rabbit, EntityType.Deer, EntityType.Wolf, EntityType.Fox].includes(entity.type));
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

});
