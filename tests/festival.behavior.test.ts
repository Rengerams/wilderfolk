/**
 * Festival behavior regression — BUG 2026-08-21-festival-participants-keep-working.
 *
 * A festival is not only an economic multiplier. During its daily gathering
 * window, the realtime human owner must redirect ordinary settlers from normal
 * weekday work to the communal venue. Worker assignments remain untouched and
 * resume automatically when the window ends.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, Season, WeatherType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { gameTick } from '../src/game/gameTick';

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
    faction: 'player',
    ...overrides,
  } as Entity;
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
    faction: 'player',
  } as Building;
}

function makeState(festivalActive: boolean): { state: WorldState; worker: Entity } {
  const worker = human(1, { job: JobType.Farmer, homeBuildingId: 10 });
  const official = human(2, { x: 330, y: 210, job: JobType.Official, homeBuildingId: 20 });
  const farm = building(10, BuildingType.Farm, 30, 40, [worker.id]);
  const hall = building(20, BuildingType.TownHall, 320, 190, [official.id]);
  const state: WorldState = {
    entities: [worker, official],
    buildings: [farm, hall],
    // gameTick increments before running realtime behavior: 44 -> 45 = 15:00.
    tick: 44,
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
  return { state, worker };
}

describe('festival participant behavior', () => {
  it('redirects an ordinary weekday worker from the farm toward the staffed Town Hall at 15:00', () => {
    const ordinary = makeState(false);
    const festival = makeState(true);

    const ordinaryAfter = gameTick(ordinary.state).entities.find((entity) => entity.id === ordinary.worker.id)!;
    const festivalAfter = gameTick(festival.state).entities.find((entity) => entity.id === festival.worker.id)!;

    // Without a festival, the farm is left/down from the worker. During a
    // festival, the staffed Town Hall is right/down and wins the movement choice.
    expect(ordinaryAfter.vx).toBeLessThan(0);
    expect(festivalAfter.vx).toBeGreaterThan(0);
    expect(festivalAfter.vy).toBeGreaterThan(0);
    expect(festivalAfter.homeBuildingId).toBe(10);
    expect(festival.state.buildings.find((entry) => entry.id === 10)?.occupants).toEqual([1]);
  });
});
