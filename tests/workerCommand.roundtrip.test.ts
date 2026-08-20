/**
 * Worker command round trips — SIMULATION_AUTHORITY.md §5 worker invariants
 * + Objective 6.
 *
 * `applyWorkerCommand` is the SINGLE domain implementation used by both
 * transport paths: the Web Worker (gameWorker.ts command handler) and the
 * main-thread fallback (gameLoop.applyCommandLocal). Parity is by
 * construction — both call this exact function on the authoritative WorldState.
 *
 * These tests drive the command surface the objective names: manual
 * assignment, priest selection, reassignment (remove + assign), demolition,
 * repair, upgrade, and building-mode commands — asserting the authoritative
 * state transition and that the Objective 1 invariants stay clean.
 */
import { describe, expect, it } from 'vitest';
import {
  BuildingType,
  EntityType,
  JOB_LABELS,
  JobType,
  Season,
  WeatherType,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { applyWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';
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

function makeWorld(entities: Entity[], buildings: Building[]): WorldState {
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
    villageName: 'Roundtripville',
    villageReputation: 0,
    challenges: [],
    autoSave: false,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
    },
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
  } as unknown as WorldState;
}

const cmd = (op: string, rest: Record<string, unknown> = {}) => ({
  proto: WORKER_CMD_PROTO,
  op,
  ...rest,
});

describe('worker command round trips (shared worker + fallback implementation)', () => {
  it('assignWorker — manual priest selection into the Church', () => {
    const priest = human(1);
    const church = building(4, BuildingType.Church);
    const world = makeWorld([priest], [church]);

    const next = applyWorkerCommand(world, cmd('assignWorker', { buildingId: 4, humanId: 1 }));
    const assigned = next.entities.find((e) => e.id === 1)!;

    expect(next.buildings.find((b) => b.id === 4)!.occupants).toEqual([1]);
    expect(assigned.homeBuildingId).toBe(4);
    expect(assigned.job).toBe(JobType.Priest);
    expect(assigned.occupation).toBe(JOB_LABELS[JobType.Priest]);
    expect(collectSimulationInvariantErrors(next)).toEqual([]);
  });

  it('removeWorker — clears the assignment', () => {
    const priest = human(1, { homeBuildingId: 4, job: JobType.Priest });
    const church = building(4, BuildingType.Church, { occupants: [1] });
    const world = makeWorld([priest], [church]);

    const next = applyWorkerCommand(world, cmd('removeWorker', { buildingId: 4, humanId: 1 }));
    const removed = next.entities.find((e) => e.id === 1)!;

    expect(next.buildings.find((b) => b.id === 4)!.occupants).toEqual([]);
    expect(removed.homeBuildingId).toBeUndefined();
    expect(removed.occupation).toBe('settler');
    expect(removed.job).toBe(JobType.Settler);
  });

  it('reassignment transfers a worker from an overstaffed building via the command', () => {
    const workerA = human(1, { homeBuildingId: 2, job: JobType.Farmer });
    const workerB = human(2, { homeBuildingId: 2, job: JobType.Farmer });
    const farmA = building(2, BuildingType.Farm, { occupants: [1, 2] });
    const lumber = building(3, BuildingType.LumberMill);
    const world = makeWorld([workerA, workerB], [farmA, lumber]);

    const assigned = applyWorkerCommand(world, cmd('assignWorker', { buildingId: 3 }));

    const lumberWorkers = assigned.buildings.find((b) => b.id === 3)!.occupants;
    expect(lumberWorkers.length).toBe(1);
    const transferred = assigned.entities.find((e) => e.id === lumberWorkers[0])!;
    expect(transferred.homeBuildingId).toBe(3);
    expect(transferred.job).toBe(JobType.Lumberjack);
    expect(assigned.buildings.find((b) => b.id === 2)!.occupants.length).toBe(1);
    expect(collectSimulationInvariantErrors(assigned)).toEqual([]);
  });

  it('demolishBuilding removes the building once and cleans assignments', () => {
    const worker = human(1, { homeBuildingId: 2, job: JobType.Farmer });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const world = makeWorld([worker], [farm]);

    const next = applyWorkerCommand(world, cmd('demolishBuilding', { buildingId: 2 }));
    const survivor = next.entities.find((e) => e.id === 1)!;

    expect(next.buildings.some((b) => b.id === 2)).toBe(false);
    expect(survivor.homeBuildingId).toBeUndefined();
    expect(survivor.occupation).toBe('settler');
    expect(collectSimulationInvariantErrors(next)).toEqual([]);
  });

  it('demolishBuilding is safe when the building is already gone', () => {
    const world = makeWorld([human(1)], []);
    const next = applyWorkerCommand(world, cmd('demolishBuilding', { buildingId: 2 }));
    expect(next.buildings).toEqual([]);
  });

  it('repairBuilding restores health and deducts resources', () => {
    const farm = building(2, BuildingType.Farm, { health: 40 });
    const world = makeWorld([], [farm]);

    const next = applyWorkerCommand(world, cmd('repairBuilding', { buildingId: 2 }));

    expect(next.buildings.find((b) => b.id === 2)!.health).toBe(100);
    expect(next.resources.wood).toBe(490);
    expect(next.resources.stone).toBe(495);
  });

  it('upgradeBuilding raises the level and deducts resources', () => {
    const farm = building(2, BuildingType.Farm);
    const world = makeWorld([], [farm]);

    const next = applyWorkerCommand(world, cmd('upgradeBuilding', { buildingId: 2 }));

    expect(next.buildings.find((b) => b.id === 2)!.level).toBe(2);
    expect(next.resources.wood).toBe(450);
    expect(next.resources.stone).toBe(475);
    expect(next.resources.gold).toBe(450);
  });

  it('setMineMode switches the mine extract mode', () => {
    const mine = building(2, BuildingType.Mine, { mineMode: 'stone' });
    const world = makeWorld([], [mine]);

    const next = applyWorkerCommand(world, cmd('setMineMode', { buildingId: 2, mode: 'iron' }));

    expect(next.buildings.find((b) => b.id === 2)!.mineMode).toBe('iron');
  });

  it('setWorkshopRecipe switches the workshop recipe', () => {
    const workshop = building(2, BuildingType.Workshop, { workshopRecipeId: 'wooden_goods' });
    const world = makeWorld([], [workshop]);

    const next = applyWorkerCommand(world, cmd('setWorkshopRecipe', { buildingId: 2, recipeId: 'furniture' }));

    expect(next.buildings.find((b) => b.id === 2)!.workshopRecipeId).toBe('furniture');
  });
});
