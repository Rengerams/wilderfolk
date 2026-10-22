/**
 * Festival behavior — owner ruling: settlers keep working during a festival, and the gathering
 * window redirects the settlers who are free instead.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, Season, WeatherType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { DAILY_PHASE_HOURS } from '../src/game/dayCycleClock';
import { repairStaleFestivalOnLoad } from '../src/game/dailyWorldEvents';
import { isFestivalGatheringHour } from '../src/game/humanSchedule';

/**
 * These settlers are ticked by the real `gameTick`, so `maxAge` and `reproductionCooldown` are
 * load-bearing: absent, `tickWildlife`'s `entity.age >= entity.maxAge` old-age death is dead code
 * and `Math.max(0, entity.reproductionCooldown - step)` is `NaN` (every later comparison false).
 * The `faction: 'player'` marker is dropped rather than cast around: `Entity['faction']` does not
 * name it, and `isPlayerHuman` classifies an unnamed marker and no faction identically — both
 * player-owned — so absence is the same fixture.
 */
function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 150,
    y: 60,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    reproductionCooldown: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: JobType.Settler,
    ...overrides,
  };
}

function building(
  id: number,
  type: BuildingType,
  x: number,
  y: number,
  occupants: number[],
): Building {
  return {
    id,
    type,
    x,
    y,
    width: 48,
    height: 42,
    occupants,
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

function makeState(festivalActive: boolean): { state: WorldState; worker: Entity; idler: Entity } {
  const worker = human(1, { job: JobType.Farmer, workerBuildingId: 10 });
  const official = human(2, { x: 330, y: 210, job: JobType.Official, workerBuildingId: 20 });
  const idler = human(3);
  const farm = building(10, BuildingType.Farm, 30, 40, [worker.id]);
  const hall = building(20, BuildingType.TownHall, 320, 190, [official.id]);
  // Keep the festival participant deliberately unassigned during the 15:00 auto-fill pulse.
  // Automatic staffing is tested separately; this test isolates festival behavior.
  farm.staffingMode = 'manual';
  hall.staffingMode = 'manual';
  const state: WorldState = {
    entities: [worker, official, idler],
    buildings: [farm, hall],
    // gameTick increments before realtime behaviour, entering 15:00.
    tick: 15 * TICKS_PER_HOUR - 1,
    paused: false,
    speed: 1,
    width: 500,
    height: 320,
    resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 0 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
    season: Season.Spring,
    weather: WeatherType.Clear,
    year: 0,
    dayInYear: 0,
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextBuildingId: 100,
    nextEntityId: 100,
    eventLog: [],
    screenShakeImpulse: 0,
    totalBuildingsCompleted: 2,
    humanPopulation: 2,
    maxHumanPopulation: 10,
    workingSettlers: 1,
    idleSettlers: 1,
    villageName: 'Festival Vale',
    villageReputation: 50,
    challenges: [],
    autoSave: false,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
    },
    foodSpoilageRate: 0,
    biodiversityIndex: 100,
    pollutionLevel: 0,
    disasters: [],
    tradeRoutes: [],
    eventsThisYear: [],
    worldMap: null,
    yearlyStats: [],
    lifetimeStats: {},
    visitorGroups: [],
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    ecoHealthYearsAbove80: 0,
    firstWeekVisitorSpawned: false,
    villageLeaderId: null,
    leaderSinceYear: 0,
    lastElectionYear: -1,
    pendingElectionYear: null,
    electionBuildupNotifiedYear: null,
    electionCeremony: null,
    researchNodes: [],
    unlockedTechs: [],
    activeResearch: null,
    researchProgress: 0,
    festival: festivalActive ? { active: true, name: 'Test Festival', daysLeft: 3 } : null,
  } as unknown as WorldState;
  return { state, worker, idler };
}

describe('festival participant behavior', () => {
  it('keeps the assigned farmer on the farm at 15:00 and gathers the settler who is free', () => {
    const ordinary = makeState(false);
    const festival = makeState(true);

    const ordinaryAfter = gameTick(ordinary.state).entities.find((entity) => entity.id === ordinary.worker.id)!;
    const festivalAfter = gameTick(festival.state).entities.find((entity) => entity.id === festival.worker.id)!;
    const idlerAfter = festival.state.entities.find((entity) => entity.id === festival.idler.id)!;

    // The farm is left of the worker: the festival does not take him off his shift, and the
    // schedule owner credits the attendance.
    expect(ordinaryAfter.vx).toBeLessThan(0);
    expect(festivalAfter.vx).toBeLessThan(0);
    expect(festivalAfter.scheduleWorkedTicksToday ?? 0).toBeGreaterThan(0);
    expect(festivalAfter.workerBuildingId).toBe(10);
    expect(festival.state.buildings.find((entry) => entry.id === 10)?.occupants).toEqual([1]);

    // The festival still gathers the settler with no shift: the staffed Town Hall is right/down.
    expect(idlerAfter.vx).toBeGreaterThan(0);
    expect(idlerAfter.vy).toBeGreaterThan(0);
  });
});

describe('festival lifecycle regressions', () => {
  it('counts down at the daily world-event phase rather than midnight', () => {
    const { state } = makeState(true);
    state.year = 1;
    state.dayInYear = 20;
    state.tick = 20 * TICKS_PER_DAY + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR - 1;
    state.festival = { active: true, name: 'Test Festival', daysLeft: 2 };
    gameTick(state);
    expect(state.festival?.daysLeft).toBe(1);
    // Advance every intervening tick: gameTick increments the clock itself.
    // Jumping by a full day and calling gameTick once skips the 18:00 phase.
    for (let tick = 0; tick < TICKS_PER_DAY; tick++) gameTick(state);
    expect(state.festival).toBeNull();
  });

  it('repairs a stale saved festival when its event log proves it is older than 40 days', () => {
    const { state } = makeState(true);
    state.tick = 100 * TICKS_PER_DAY;
    state.eventLog = [{ id: 1, type: 'season', tick: 20 * TICKS_PER_DAY, year: 0, day: 20, message: 'Test Festival began in the village' }];
    repairStaleFestivalOnLoad(state);
    expect(state.festival).toBeNull();
  });

  it('keeps a recent festival on load', () => {
    const { state } = makeState(true);
    state.tick = 22 * TICKS_PER_DAY;
    state.eventLog = [{ id: 1, type: 'season', tick: 20 * TICKS_PER_DAY, year: 0, day: 20, message: 'Test Festival began in the village' }];
    repairStaleFestivalOnLoad(state);
    expect(state.festival?.daysLeft).toBe(3);
  });

  it('allows gathering at 22:00 but not from 23:00', () => {
    expect(isFestivalGatheringHour(22, true)).toBe(true);
    expect(isFestivalGatheringHour(23, true)).toBe(false);
  });
});
