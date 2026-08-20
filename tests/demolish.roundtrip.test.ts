/**
 * Demolition round trip — SIMULATION_AUTHORITY.md §5 ("Demolishing a building
 * removes it from authoritative state, cleans its assignments, and clears
 * stale selection") + Objective 7.
 *
 * Traces the Demolish command through the shared `applyWorkerCommand` domain
 * implementation (used by both the worker and the main-thread fallback):
 * authoritative building removal, occupant/assignment cleanup, delta-merge
 * survivability (proven by running real sim ticks afterwards — the building
 * must not reappear), and the completed-building counter staying consistent
 * with the load-time recompute.
 */
import { describe, expect, it } from 'vitest';
import {
  BuildingType,
  EntityType,
  JobType,
  Season,
  WeatherType,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { applyWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';
import { gameTick } from '../src/game/gameTick';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
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
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as Building;
}

/** Full-enough WorldState to survive real gameTick runs (no reappearance proof). */
function makeWorld(entities: Entity[], buildings: Building[], extra: Partial<WorldState> = {}): WorldState {
  return {
    entities,
    buildings,
    tick: 0,
    paused: false,
    speed: 1,
    width: 400,
    height: 300,
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
    totalBuildingsCompleted: 0,
    humanPopulation: 0,
    maxHumanPopulation: 0,
    workingSettlers: 0,
    idleSettlers: 0,
    villageName: 'Demolishville',
    villageReputation: 0,
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
    ...extra,
  } as unknown as WorldState;
}

const demolish = (buildingId: number) => ({
  proto: WORKER_CMD_PROTO,
  op: 'demolishBuilding',
  buildingId,
});

describe('demolition round trip', () => {
  it('removes the building exactly once and cleans the worker assignment', () => {
    const worker = human(1, { homeBuildingId: 2, job: JobType.Farmer });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const world = makeWorld([worker], [farm], { totalBuildingsCompleted: 3 });

    const next = applyWorkerCommand(world, demolish(2));
    const survivor = next.entities.find((e) => e.id === 1)!;

    expect(next.buildings.some((b) => b.id === 2)).toBe(false);
    expect(survivor.homeBuildingId).toBeUndefined();
    expect(survivor.occupation).toBe('settler');
    expect(survivor.job).toBe(JobType.Settler);
    expect(next.totalBuildingsCompleted).toBe(2); // decremented
    expect(collectSimulationInvariantErrors(next)).toEqual([]);
  });

  it('cleans a resident and a prisoner of the demolished building', () => {
    const resident = human(1, { residenceBuildingId: 3 });
    const prisoner = human(2, { prisonBuildingId: 4, prisonerUntilTick: 999, prisonSentenceCrime: 'scandal' });
    const house = building(3, BuildingType.House, { occupants: [1] });
    const prison = building(4, BuildingType.Prison, { occupants: [2] });
    const world = makeWorld([resident, prisoner], [house, prison], { totalBuildingsCompleted: 2 });

    const next = applyWorkerCommand(world, demolish(3));
    const survivor = next.entities.find((e) => e.id === 1)!;

    expect(next.buildings.some((b) => b.id === 3)).toBe(false);
    expect(survivor.residenceBuildingId).toBeUndefined();
    expect(next.buildings.some((b) => b.id === 4)).toBe(true); // prison untouched
    expect(next.totalBuildingsCompleted).toBe(1);
    expect(collectSimulationInvariantErrors(next)).toEqual([]);
  });

  it('does not reappear after subsequent sim ticks (no stale state)', () => {
    const worker = human(1, { homeBuildingId: 2, job: JobType.Farmer, residenceBuildingId: 10 });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const house = building(10, BuildingType.House, { occupants: [1] });
    const world = makeWorld([worker], [farm, house], { totalBuildingsCompleted: 1 });

    const demolished = applyWorkerCommand(world, demolish(2));
    expect(demolished.buildings.some((b) => b.id === 2)).toBe(false);

    let ticked = demolished;
    for (let i = 0; i < 3 * 72; i++) ticked = gameTick(ticked);

    expect(ticked.buildings.some((b) => b.id === 2)).toBe(false);
    expect(ticked.entities.some((e) => e.id === 1 && e.homeBuildingId === 2)).toBe(false);
    expect(collectSimulationInvariantErrors(ticked)).toEqual([]);
  });

  it('is safe when the building was already removed', () => {
    const world = makeWorld([human(1)], [], { totalBuildingsCompleted: 1 });

    const next = applyWorkerCommand(world, demolish(2));

    expect(next.buildings).toEqual([]);
    expect(next.totalBuildingsCompleted).toBe(1); // nothing to decrement
    expect(collectSimulationInvariantErrors(next)).toEqual([]);
  });

  it('does not decrement the counter for an incomplete building', () => {
    const site = building(2, BuildingType.Farm, { completed: false, constructionProgress: 50 });
    const world = makeWorld([], [site], { totalBuildingsCompleted: 0 });

    const next = applyWorkerCommand(world, demolish(2));

    expect(next.buildings.some((b) => b.id === 2)).toBe(false);
    expect(next.totalBuildingsCompleted).toBe(0);
  });
});
