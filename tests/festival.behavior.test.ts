import { initGame } from '../src/game/worldGen';
/**
 * Festival behavior — owner ruling: settlers keep working during a festival, and the gathering
 * window redirects the settlers who are free instead.
 */
import { describe, expect, it, vi } from 'vitest';
import { BuildingType, EntityType, JobType, MapSize, Season, WeatherType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY, TICKS_PER_HOUR, FESTIVAL_CHECK_TICKS } from '../src/game/dayCycle';
import { DAILY_PHASE_HOURS, tickAtDailyPhase } from '../src/game/dayCycleClock';
import { repairStaleFestivalOnLoad, tickFestivals } from '../src/game/dailyWorldEvents';
import { isFestivalGatheringHour } from '../src/game/humanSchedule';
import * as simRng from '../src/game/simRng';
import type { PopulationCounts } from '../src/game/entityCounts';
import { TOWN_HALL_FESTIVAL_DAYS, getTownHallFestivalCooldownTicks, canHostTownFestival } from '../src/game/townHall';

/**
 * Ticked by the real `gameTick`: `maxAge` and `reproductionCooldown` must be present or old-age
 * death and the cooldown decrement break; `isPlayerHuman` treats a missing faction as player-owned.
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
  // A child is ineligible for automatic employment; with no shift, the festival may gather it.
  const idler = human(3, { age: 12, isJuvenile: true });
  const farm = building(10, BuildingType.Farm, 30, 40, [worker.id]);
  const hall = building(20, BuildingType.TownHall, 320, 190, [official.id]);
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
  it('keeps the assigned farmer working at 15:00 and gathers the free settler after 17:00', () => {
    const ordinary = makeState(false);
    const festival = makeState(true);

    const ordinaryAfter = gameTick(ordinary.state).entities.find((entity) => entity.id === ordinary.worker.id)!;
    const festivalAfter = gameTick(festival.state).entities.find((entity) => entity.id === festival.worker.id)!;
    // The farm is left of the worker: the festival does not take him off his shift, and the
    // schedule owner credits the attendance.
    expect(ordinaryAfter.vx).toBeLessThan(0);
    expect(festivalAfter.vx).toBeLessThan(0);
    expect(festivalAfter.scheduleWorkedTicksToday ?? 0).toBeGreaterThan(0);
    expect(festivalAfter.workerBuildingId).toBe(10);
    expect(festival.state.buildings.find((entry) => entry.id === 10)?.occupants).toContain(1);
    expect(festival.idler.workerBuildingId).toBeUndefined();

    // Festivities begin at 17:00, after the afternoon work shift.
    expect(isFestivalGatheringHour(15, true)).toBe(false);
    festival.state.tick = 17 * TICKS_PER_HOUR - 1;
    gameTick(festival.state);
    const idlerAfter = festival.state.entities.find((entity) => entity.id === festival.idler.id)!;
    // The staffed Town Hall is right/down from the free settler.
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

  it('gathers only from 17:00 through 20:59', () => {
    expect(isFestivalGatheringHour(16, true)).toBe(false);
    expect(isFestivalGatheringHour(17, true)).toBe(true);
    expect(isFestivalGatheringHour(20, true)).toBe(true);
    expect(isFestivalGatheringHour(21, true)).toBe(false);
  });

  it('starts a two-day seasonal festival in the normal daily world-events pulse', () => {
    const { state } = makeState(false);
    state.tick = 3 * TICKS_PER_DAY + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR - 1;
    gameTick(state);
    expect(state.festival?.name).toBe('Spring Revel');
    expect(state.festival?.daysLeft).toBe(2);
  });

  it('uses ninety-day random checks and Town Hall cooldown, and three-day hosted events', () => {
    expect(FESTIVAL_CHECK_TICKS).toBe(90 * TICKS_PER_DAY);
    expect(getTownHallFestivalCooldownTicks()).toBe(90 * TICKS_PER_DAY);
    expect(TOWN_HALL_FESTIVAL_DAYS).toBe(3);
  });

  it('preserves hosted eligibility across seasonal endings and the year boundary', () => {
    const { state } = makeState(false);
    const counts = { humans: 6 } as PopulationCounts;
    const rng = vi.spyOn(simRng, 'getSimRng').mockReturnValue(() => 0.99);
    const deadline = 90 * TICKS_PER_DAY;
    state.townHallFestivalCooldownUntilTick = deadline;
    try {
      for (let day = 0; day <= 365; day++) {
        if (day === 360) state.eventsThisYear = [];
        state.tick = day * TICKS_PER_DAY + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR;
        tickFestivals(state, counts);
        expect(state.townHallFestivalCooldownUntilTick).toBe(deadline);
        if ([5, 95, 185, 275, 365].includes(day)) {
          expect(state.festival).toBeNull();
          if (day >= 95) expect(canHostTownFestival(state, state.buildings[1]).ok).toBe(true);
        }
      }
    } finally {
      rng.mockRestore();
    }
  });

  it('allows random festivals at eligible checkpoints without renewing their cooldown on expiry', () => {
    const { state } = makeState(false);
    const counts = { humans: 6 } as PopulationCounts;
    const rng = vi.spyOn(simRng, 'getSimRng').mockReturnValue(() => 0);
    try {
      state.tick = 90 * TICKS_PER_DAY + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR;
      tickFestivals(state, counts);
      expect(state.festival?.daysLeft).toBe(2);
      const deadline = state.tick + getTownHallFestivalCooldownTicks();
      expect(state.townHallFestivalCooldownUntilTick).toBe(deadline);
      for (let day = 91; day <= 92; day++) {
        state.tick = day * TICKS_PER_DAY + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR;
        tickFestivals(state, counts);
      }
      expect(state.festival).toBeNull();
      expect(state.townHallFestivalCooldownUntilTick).toBe(deadline);
    } finally {
      rng.mockRestore();
    }
  });

  it('caps ongoing long festivals from old saves to four days at the next daily pulse', () => {
    const { state } = makeState(true);
    state.festival = { active: true, name: 'Old Festival', daysLeft: 30 };
    state.tick = 20 * TICKS_PER_DAY + DAILY_PHASE_HOURS.worldEvents * TICKS_PER_HOUR - 1;
    gameTick(state);
    expect(state.festival?.daysLeft).toBe(3);
  });

});

describe('seasonal festival deferral', () => {
  it('L13/L14 — a random festival no longer cancels the seasonal festival for a whole season', () => {
    const world = initGame({ seed: 4242, size: MapSize.Medium });
    // Day 5 of Spring (the seasonal window starts at day 3) with a random festival still
    // running: the seasonal festival must defer, not be lost.
    world.tick = tickAtDailyPhase(5, 'worldEvents') - 1;
    world.festival = { active: true, name: 'Harvest Festival', daysLeft: 30 };
    const blocked = gameTick(world);
    expect(blocked.festival?.name).toBe('Harvest Festival');

    // The random festival ends; the seasonal festival still starts later in the season.
    blocked.festival = null;
    blocked.tick = tickAtDailyPhase(6, 'worldEvents') - 1;
    const later = gameTick(blocked);
    expect(later.festival?.name).toBe('Spring Revel');
  });
});
