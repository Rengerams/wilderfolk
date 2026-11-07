/** Calendar-phase audit regressions: assertions reach each owner through real gameTick. */
import { describe, expect, it } from 'vitest';
import { gameTick, initGame } from '../src/game/gameEngine';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { JobType, MapSize, type VisitorGroup, type WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { SKILL_IDLE_DECAY_PER_DAY } from '../src/game/skills';

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

    gameTick(world);

    expect(world.year).toBe(2);
    expect(world.dayInYear).toBe(0);
    expect(world.electionCeremony?.reason).toBe('term');
    expect(world.eventLog.some((event) => event.message.includes('Leadership election ceremony began'))).toBe(true);
  });

  it('SIM-02: real gameTick decays an unused skill exactly once at midnight', () => {
    const world = worldBeforeDay(7);
    const settler = world.entities.find((entity) => entity.alive && !entity.isJuvenile && isPlayerHuman(entity));
    expect(settler).toBeDefined();
    if (!settler) return;
    settler.job = JobType.Settler;
    settler.skills = { [JobType.Miner]: 50 };

    gameTick(world);

    expect(settler.skills[JobType.Miner]).toBeCloseTo(50 - SKILL_IDLE_DECAY_PER_DAY, 8);
    expect(world.lastProcessedCalendarDay).toBe(7);
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
});
