import { scenarioSettler, scenarioBuilding, scenarioWorld } from './helpers/humanScenario';
import { removeStaffWorkerFromBuilding } from '../src/game/buildingStaffingActions';
import { resetSimRng } from '../src/game/simRng';
import { isPlayerHuman } from '../src/game/playerHuman';
import { HUMAN_ADULT_MIN_AGE as HUMAN_CHILDHOOD_YEARS } from '../src/game/daycycleconstants';
/**
 * `workforce.ts` owns assignment: `workerBuildingId`, workplace `occupants`, `occupation` and `job`
 * must agree after every transition, no living human may hold two workplaces, and a leader keeps office.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BUILDING_CONFIGS,
  BuildingType,
  EntityType,
  JOB_LABELS,
  JobType,
  LEADER_OCCUPATION,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import {
  addToConstructionCrew,
  assignWorkerInPlace,
  assignMissingWorkers,
  countActiveWorkersAtBuilding,
  countWorkersAtBuilding,
  rebalanceJobWorkers,
  staffingCapFor,
  staffConstructionCrews,
  staffJobBuildings,
  assignWorkerTransition,
  getSmithBonus,
  prepareWorkforce,
  removeWorkerTransition,
  restoreWorkerRosterAfterCustody,
  syncJobBuildingOccupants,
  transferWorkerBetweenBuildings,
} from '../src/game/workforce';
import { buildConstructionCrewIndex, countWorkingAndIdleSettlers } from '../src/game/workforceSummary';
import { removeWorkerFromBuilding } from '../src/game/buildingActionRouting';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { setHumanBirthFromAge } from '../src/game/dayCycle';
import { recordScheduleWorkTick } from '../src/game/scheduleFatigue';
import { createBuilding, createEntity, initGame } from '../src/game/worldGen';
import { setBuildingStaffingMode } from '../src/game/buildingConfigurationActions';
import { isWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';
import { human as staffingHuman, building as staffingBuilding } from '../src/test/factories';

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
    year: 0,
    dayInYear: 0,
    notifications: [],
    floatingTexts: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

describe('workforce named transitions', () => {
  it('rejects assigning a settler to a second workplace (duplicate prevention)', () => {
    const settler = human(1, { workerBuildingId: 2 });
    const farmB = building(3, BuildingType.Farm);

    const ok = assignWorkerTransition(settler, farmB);

    expect(ok).toBe(false);
    expect(settler.workerBuildingId).toBe(2);
    expect(farmB.occupants).toEqual([]);
  });

  it('is idempotent when assigning to the same workplace', () => {
    const settler = human(1);
    const farm = building(2, BuildingType.Farm);

    expect(assignWorkerTransition(settler, farm)).toBe(true);
    expect(assignWorkerTransition(settler, farm)).toBe(true);

    expect(farm.occupants).toEqual([1]);
    expect(settler.workerBuildingId).toBe(2);
    expect(settler.occupation).toBe(JOB_LABELS[JobType.Farmer]);
    expect(settler.job).toBe(JobType.Farmer);
  });

  it('repairs a pre-existing roster entry with an unset worker pointer without adding a duplicate', () => {
    const settler = human(1);
    const mill = building(2, BuildingType.LumberMill, { occupants: [1] });
    const state = makeWorld([settler], [mill]);

    expect(assignWorkerTransition(settler, mill)).toBe(true);
    expect(mill.occupants).toEqual([1]);
    expect(settler.workerBuildingId).toBe(2);
    expect(settler.job).toBe(JobType.Lumberjack);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });

  it('repairs an established worker whose workplace roster entry disappeared', () => {
    const settler = human(1, { workerBuildingId: 2, job: JobType.Lumberjack });
    const mill = building(2, BuildingType.LumberMill);

    expect(assignWorkerTransition(settler, mill)).toBe(true);
    expect(mill.occupants).toEqual([1]);
    expect(settler.workerBuildingId).toBe(2);
  });

  it('restores a freed worker without leaving prison or construction crew membership', () => {
    const settler = human(4137, { workerBuildingId: 110, job: JobType.Lumberjack });
    const prison = building(9, BuildingType.Prison, { occupants: [settler.id] });
    const mill = building(110, BuildingType.LumberMill);
    const unfinished = building(156, BuildingType.Farm, { completed: false, occupants: [settler.id] });

    restoreWorkerRosterAfterCustody(settler, [prison, mill, unfinished]);

    expect(prison.occupants).toEqual([]);
    expect(unfinished.occupants).toEqual([]);
    expect(mill.occupants).toEqual([settler.id]);
    expect(settler.workerBuildingId).toBe(mill.id);
    expect(collectSimulationInvariantErrors(makeWorld([settler], [prison, mill, unfinished]))).toEqual([]);
  });

  it('reconciles stale prison and construction rosters even without a release event', () => {
    const returned = human(4137, { workerBuildingId: 110, job: JobType.Lumberjack });
    const prison = building(9, BuildingType.Prison, { occupants: [returned.id] });
    const mill = building(110, BuildingType.LumberMill);
    const unfinished = building(156, BuildingType.Farm, { completed: false, occupants: [returned.id] });
    const state = makeWorld([returned], [prison, mill, unfinished]);

    prepareWorkforce(state.entities, state.buildings);
    expect(prison.occupants).toEqual([]);
    expect(unfinished.occupants).toEqual([]);
    expect(mill.occupants).toEqual([returned.id]);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });

  it('reconciles orphan, incarcerated, duplicate and employed builders before assigning crews', () => {
    const unemployed = human(1);
    const employed = human(2, { workerBuildingId: 20, job: JobType.Farmer });
    const prisoner = human(3, { prisonBuildingId: 30 });
    const farm = building(20, BuildingType.Farm, { occupants: [2] });
    const prison = building(30, BuildingType.Prison, { occupants: [3] });
    const first = building(40, BuildingType.House, { completed: false, occupants: [1, 2, 3, 999] });
    const second = building(41, BuildingType.Farm, { completed: false, occupants: [1, 2] });
    const state = makeWorld([unemployed, employed, prisoner], [farm, prison, first, second]);

    prepareWorkforce(state.entities, state.buildings);
    expect(first.occupants).toEqual([1]);
    expect(second.occupants).toEqual([]);
    expect(farm.occupants).toEqual([2]);
    expect(prison.occupants).toEqual([3]);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });

  it('keeps construction assignments distinct in the shared crew-index staffing pass', () => {
    const firstWorker = human(1);
    const secondWorker = human(2);
    const jailed = human(3, { prisonBuildingId: 90 });
    const first = building(10, BuildingType.House, { completed: false });
    const second = building(11, BuildingType.House, { completed: false });

    staffConstructionCrews([firstWorker, secondWorker, jailed], [first, second]);

    expect(first.occupants).toEqual([1]);
    expect(second.occupants).toEqual([2]);
    expect(new Set([...first.occupants, ...second.occupants]).size).toBe(2);
  });

  it('reuses excess builders without taking another worker from a permanent job', () => {
    const builders = [human(1), human(2)];
    const employees = [human(3, { workerBuildingId: 20 }), human(4, { workerBuildingId: 20 })];
    const first = building(10, BuildingType.House, { completed: false, occupants: [1, 2] });
    const second = building(11, BuildingType.House, { completed: false });
    const farm = building(20, BuildingType.Farm, { occupants: [3, 4] });

    staffConstructionCrews([...builders, ...employees], [first, second, farm], undefined, 100);

    expect(first.occupants).toEqual([1]);
    expect(second.occupants).toEqual([2]);
    expect(farm.occupants).toEqual([3, 4]);
    expect(employees.map((person) => person.workerBuildingId)).toEqual([20, 20]);
  });

  it('borrows just one employee to start a site and does not top up using job transfers', () => {
    const employees = [1, 2, 3, 4].map((id) => human(id, { workerBuildingId: 20 }));
    const farm = building(20, BuildingType.Farm, { occupants: [1, 2, 3, 4] });
    const site = building(10, BuildingType.House, { completed: false });
    const buildings = [site, farm];

    staffConstructionCrews(employees, buildings, undefined, 100);
    const borrowed = site.occupants[0];
    expect(site.occupants).toHaveLength(1);
    expect(farm.occupants).toHaveLength(3);
    expect(employees.find((person) => person.id === borrowed)?.workerBuildingId).toBeUndefined();

    staffConstructionCrews(employees, buildings, undefined, 101);
    expect(site.occupants).toEqual([borrowed]);
    expect(farm.occupants).toHaveLength(3);
  });

  it('borrows construction crew from Quarry surplus, leaving Farm food posts protected', () => {
    const miners = [1, 2, 3].map((id) => human(id, { workerBuildingId: 20 }));
    const farmers = [4, 5].map((id) => human(id, { workerBuildingId: 21 }));
    const quarry = building(20, BuildingType.Quarry, { occupants: [1, 2, 3] });
    const farm = building(21, BuildingType.Farm, { occupants: [4, 5] });
    const site = building(10, BuildingType.House, { completed: false });

    staffConstructionCrews([...miners, ...farmers], [site, quarry, farm], undefined, 100);

    expect(quarry.occupants).toHaveLength(2);
    expect(farm.occupants).toEqual([4, 5]);
    expect(site.occupants).toHaveLength(1);
    expect([1, 2, 3]).toContain(site.occupants[0]);
    expect(miners.find((worker) => worker.id === site.occupants[0])?.lastAutoJobTransferTick).toBe(100);
    staffConstructionCrews([...miners, ...farmers], [site, quarry, farm], undefined, 101);
    expect(quarry.occupants).toHaveLength(2);
    expect(site.occupants).toHaveLength(1);
  });

  it('does not drain the only Quarry worker to start construction', () => {
    const miner = human(1, { workerBuildingId: 20 });
    const quarry = building(20, BuildingType.Quarry, { occupants: [1] });
    const site = building(10, BuildingType.House, { completed: false });

    staffConstructionCrews([miner], [site, quarry], undefined, 100);

    expect(quarry.occupants).toEqual([1]);
    expect(site.occupants).toEqual([]);
    expect(miner.workerBuildingId).toBe(quarry.id);
  });

  it('keeps builders out of job vacancies when sharing the crew index across hires', () => {
    const builder = human(1);
    const freeWorker = human(2);
    const site = building(10, BuildingType.House, { completed: false, occupants: [builder.id] });
    const farm = building(20, BuildingType.Farm);

    staffJobBuildings([builder, freeWorker], [site, farm]);

    expect(site.occupants).toEqual([builder.id]);
    expect(farm.occupants).toEqual([freeWorker.id]);
    expect(builder.workerBuildingId).toBeUndefined();
    expect(freeWorker.workerBuildingId).toBe(farm.id);
  });

  it('reconciles a completed lumber mill crew already listed in the roster', () => {
    const settler = human(6565);
    const lumberMill = building(154, BuildingType.LumberMill, { occupants: [settler.id] });

    expect(assignWorkerTransition(settler, lumberMill)).toBe(true);
    expect(lumberMill.occupants).toEqual([settler.id]);
    expect(settler.workerBuildingId).toBe(lumberMill.id);
    expect(settler.job).toBe(JobType.Lumberjack);
    expect(settler.occupation).toBe(JOB_LABELS[JobType.Lumberjack]);
    expect(assignWorkerTransition(settler, lumberMill)).toBe(true);
    expect(lumberMill.occupants).toEqual([settler.id]);
  });

  it('automatically assigns the leader without losing office or manor residency', () => {
    const leader = human(1, {
      occupation: LEADER_OCCUPATION,
      job: JobType.Settler,
      residenceBuildingId: 9,
    });
    const manor = building(9, BuildingType.LeaderHouse, { occupants: [1] });
    const farm = building(2, BuildingType.Farm);
    const world = makeWorld([leader], [manor, farm]);
    // A living leader-occupation settler requires the office: the invariant rejects the label alone.
    world.villageLeaderId = 1;

    assignMissingWorkers(world.entities, world.buildings, world);

    expect(leader.workerBuildingId).toBe(2);
    expect(leader.occupation).toBe(LEADER_OCCUPATION);
    expect(leader.job).toBe(JobType.Farmer);
    expect(farm.occupants).toEqual([1]);
    expect(leader.residenceBuildingId).toBe(9);
    expect(collectSimulationInvariantErrors(world)).toEqual([]);
  });

  it('relocates a jobless settler to a partly occupied nearby home before assigning an empty barracks post', () => {
    const remote = human(1, { x: 100_000, residenceBuildingId: 10 });
    const serving = human(2, { x: 20, residenceBuildingId: 11,
      workerBuildingId: 20, job: JobType.Soldier });
    const distantHouse = building(10, BuildingType.House,
      { x: 100_000, occupants: [1] });
    const localHouse = building(11, BuildingType.House,
      { x: 20, occupants: [2] });
    const barracks = building(20, BuildingType.Barracks,
      { x: 0, occupants: [2] });
    const world = makeWorld([remote, serving], [distantHouse, localHouse, barracks]);
    world.workforcePolicy = 'survival';

    assignMissingWorkers(world.entities, world.buildings, world);

    expect(remote.residenceBuildingId).toBe(localHouse.id);
    expect(remote.workerBuildingId).toBe(barracks.id);
    expect(remote.job).toBe(JobType.Soldier);
    expect(distantHouse.occupants).toEqual([]);
    expect(localHouse.occupants).toEqual([2, 1]);
    // Workforce reconciliation rebuilds the job roster in entity order.
    expect(barracks.occupants).toEqual([1, 2]);
    expect(collectSimulationInvariantErrors(world)).toEqual([]);
  });

  it('continues hiring into partially staffed barracks on the next unchanged staffing pulse', () => {
    const first = human(1, { x: 100_000, residenceBuildingId: 10 });
    const next = human(3, { x: 100_000, residenceBuildingId: 10 });
    const serving = human(2, { x: 20, residenceBuildingId: 11,
      workerBuildingId: 20, job: JobType.Soldier });
    const far = building(10, BuildingType.House,
      { x: 100_000, occupants: [1, 3] });
    const near = building(11, BuildingType.House,
      { x: 20, occupants: [2] });
    const barracks = building(20, BuildingType.Barracks,
      { occupants: [2] });
    const world = makeWorld([first, next, serving], [far, near, barracks]);
    world.workforcePolicy = 'survival';

    assignMissingWorkers(world.entities, world.buildings, world);
    expect([first, next].filter((worker) => worker.workerBuildingId === 20)).toHaveLength(1);
    expect(barracks.occupants).toHaveLength(2);

    // Nothing changed except the scheduled clock. A completed relocation must
    // not cache away the remaining vacancy for an entire week.
    world.tick += 72;
    assignMissingWorkers(world.entities, world.buildings, world);
    expect([first, next].filter((worker) => worker.workerBuildingId === 20)).toHaveLength(2);
    expect(barracks.occupants).toHaveLength(3);
    expect(near.occupants).toEqual([2, 1, 3]);
    expect(collectSimulationInvariantErrors(world)).toEqual([]);
  });

  it('never relocates a job seeker into a nearby home that has no spare beds', () => {
    const remote = human(1, { x: 100_000, residenceBuildingId: 10 });
    const children = Array.from({ length: 6 }, (_, index) =>
      human(30 + index, { x: 20, age: 10, isJuvenile: true, residenceBuildingId: 11 }));
    const far = building(10, BuildingType.House,
      { x: 100_000, occupants: [1] });
    const full = building(11, BuildingType.House,
      { x: 20, occupants: children.map((child) => child.id) });
    const barracks = building(20, BuildingType.Barracks);
    const world = makeWorld([remote, ...children], [far, full, barracks]);
    world.workforcePolicy = 'survival';

    assignMissingWorkers(world.entities, world.buildings, world);

    expect(remote.residenceBuildingId).toBe(far.id);
    expect(remote.workerBuildingId).toBeUndefined();
    expect(barracks.occupants).toEqual([]);
  });

  it('fills an empty barracks with the available idle leader before assigning builders', () => {
    const leader = human(1, { occupation: LEADER_OCCUPATION, job: JobType.Settler });
    const barracks = building(15, BuildingType.Barracks);
    const construction = building(16, BuildingType.House, { completed: false });
    const world = makeWorld([leader], [barracks, construction]);
    world.villageLeaderId = leader.id;
    world.workforcePolicy = 'survival';

    assignMissingWorkers(world.entities, world.buildings, world);

    expect(leader.workerBuildingId).toBe(barracks.id);
    expect(leader.job).toBe(JobType.Soldier);
    expect(leader.occupation).toBe(LEADER_OCCUPATION);
    expect(barracks.occupants).toEqual([leader.id]);
    expect(construction.occupants).toEqual([]);
    expect(collectSimulationInvariantErrors(world)).toEqual([]);
  });

  it('auto-staffs an idle leader like any other settler', () => {
    // The leader is a normal assignment candidate: auto-staff may assign an idle leader.
    const leader = human(1, { occupation: LEADER_OCCUPATION });
    const farm = building(2, BuildingType.Farm);

    const ok = assignWorkerInPlace(farm, [leader], [farm]);

    expect(ok).toBe(true);
    expect(farm.occupants).toEqual([1]);
    expect(leader.workerBuildingId).toBe(2);
    expect(leader.occupation).toBe(LEADER_OCCUPATION); // office survives auto-staff
    expect(leader.job).toBe(JobType.Farmer);
  });

  it('preserves a valid leader workplace through prepareWorkforce', () => {
    const leader = human(1, {
      occupation: LEADER_OCCUPATION,
      workerBuildingId: 2,
      job: JobType.Farmer,
    });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });

    const alive = prepareWorkforce([leader], [farm]);

    expect(alive.length).toBe(1);
    expect(leader.workerBuildingId).toBe(2);
    expect(leader.occupation).toBe(LEADER_OCCUPATION);
    expect(farm.occupants).toEqual([1]);
  });

  it('clears a stale leader workplace through prepareWorkforce', () => {
    const leader = human(1, {
      occupation: LEADER_OCCUPATION,
      workerBuildingId: 99,
      job: JobType.Farmer,
    });
    const farm = building(2, BuildingType.Farm);

    prepareWorkforce([leader], [farm]);

    expect(leader.workerBuildingId).toBeUndefined();
    expect(leader.job).toBe(JobType.Settler);
    expect(leader.occupation).toBe(LEADER_OCCUPATION);
  });

  it('reassigns a worker between workplaces consistently', () => {
    const worker = human(1, {
      workerBuildingId: 2,
      occupation: JOB_LABELS[JobType.Farmer],
      job: JobType.Farmer,
    });
    const farmA = building(2, BuildingType.Farm, { occupants: [1] });
    const lumber = building(3, BuildingType.LumberMill);

    transferWorkerBetweenBuildings(worker, farmA, lumber);

    expect(farmA.occupants).toEqual([]);
    expect(lumber.occupants).toEqual([1]);
    expect(worker.workerBuildingId).toBe(3);
    expect(worker.occupation).toBe(JOB_LABELS[JobType.Lumberjack]);
    expect(worker.job).toBe(JobType.Lumberjack);
  });

  it('removes a worker and resets assignment fields', () => {
    const worker = human(1, {
      workerBuildingId: 2,
      occupation: JOB_LABELS[JobType.Farmer],
      job: JobType.Farmer,
    });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });

    removeWorkerTransition(worker, [farm]);

    expect(farm.occupants).toEqual([]);
    expect(worker.workerBuildingId).toBeUndefined();
    expect(worker.occupation).toBe('settler');
    expect(worker.job).toBe(JobType.Settler);
  });

  it('keeps the leader office occupation on removal', () => {
    const leader = human(1, {
      occupation: LEADER_OCCUPATION,
      workerBuildingId: 2,
      job: JobType.Farmer,
    });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });

    removeWorkerTransition(leader, [farm]);

    expect(leader.occupation).toBe(LEADER_OCCUPATION);
    expect(leader.workerBuildingId).toBeUndefined();
    expect(leader.job).toBe(JobType.Settler);
  });

  it('adds a settler to a construction crew without a workplace', () => {
    const builder = human(1);
    const site = building(5, BuildingType.House, { completed: false });

    expect(addToConstructionCrew(builder, site)).toBe(true);

    expect(site.occupants).toEqual([1]);
    expect(builder.workerBuildingId).toBeUndefined();
  });
});

describe('workforce command surface', () => {
  it('rejects manual dismissal from an automatically managed Church', () => {
    const priest = human(1, {
      workerBuildingId: 4,
      occupation: JOB_LABELS[JobType.Priest],
      job: JobType.Priest,
    });
    const church = building(4, BuildingType.Church, { occupants: [1], staffingMode: 'manual' });
    const world = makeWorld([priest], [church]);

    const next = removeWorkerFromBuilding(world, 4, 1);
    expect(next).toBe(world);
    expect(next.buildings.find((b) => b.id === 4)!.staffingMode).toBe('manual');
    assignMissingWorkers(next.entities, next.buildings, next, true);
    const reassigned = next.entities.find((e) => e.id === 1)!;

    expect(reassigned.workerBuildingId).toBe(4);
    expect(reassigned.occupation).toBe(JOB_LABELS[JobType.Priest]);
    expect(next.buildings.find((b) => b.id === 4)!.occupants).toEqual([1]);
    expect(next.buildings.find((b) => b.id === 4)!.staffingMode).toBe('auto');
    expect(collectSimulationInvariantErrors(next)).toEqual([]);
  });
});

describe('idle-worker counts', () => {
  it('tracks working vs idle across assign and removal', () => {
    const settler = human(1);
    const farm = building(2, BuildingType.Farm);

    expect(countWorkingAndIdleSettlers([settler], [farm])).toEqual({ working: 0, idle: 1 });

    assignWorkerTransition(settler, farm);
    expect(countWorkingAndIdleSettlers([settler], [farm])).toEqual({ working: 1, idle: 0 });

    removeWorkerTransition(settler, [farm]);
    expect(countWorkingAndIdleSettlers([settler], [farm])).toEqual({ working: 0, idle: 1 });
  });

  it('only indexes unfinished construction crews, not completed job rosters', () => {
    const idle = human(1);
    const builder = human(2);
    const playerSite = building(11, BuildingType.House, { completed: false, occupants: [builder.id] });
    const completed = building(12, BuildingType.Farm, { occupants: [idle.id] });
    const sites = [completed, playerSite];

    expect([...buildConstructionCrewIndex(sites).keys()]).toEqual([builder.id]);
    expect(countWorkingAndIdleSettlers([idle, builder], sites)).toEqual({ working: 1, idle: 1 });
  });

  it('repairs demolished workplace pointers in the write owner before reporting idle labour', () => {
    const settler = human(1, { workerBuildingId: 999, job: JobType.Farmer });
    prepareWorkforce([settler], []);

    expect(settler.workerBuildingId).toBeUndefined();
    expect(settler.job).toBe(JobType.Settler);
    expect(countWorkingAndIdleSettlers([settler], [])).toEqual({ working: 0, idle: 1 });
  });

  it('uses the canonical crew index in vacancy swaps instead of a second roster scan', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/game/workforce.ts'), 'utf8');
    const swap = source.slice(
      source.indexOf('function swapReachableWorkersIntoVacancies('),
      source.indexOf('export function syncJobBuildingOccupants('),
    );

    expect(swap).toContain('buildConstructionCrewIndex(buildings)');
    expect(swap).not.toContain('for (const site of buildings)');
  });
});

/**
 * The childhood boundary *is* the adult floor, and `setHumanBirthFromAge` derives `isJuvenile` from it.
 * Below the boundary both work paths refuse: no work tick is credited and no workplace can be held.
 */
describe('the childhood boundary bars work until the adult floor', () => {
  it('credits no work tick and no workplace to a 12–17 year old, and both at 18', () => {
    const youth = human(1);
    setHumanBirthFromAge(youth, HUMAN_CHILDHOOD_YEARS - 1, 0);
    const adult = human(2);
    setHumanBirthFromAge(adult, HUMAN_CHILDHOOD_YEARS, 0);

    expect(youth.isJuvenile).toBe(true);
    expect(adult.isJuvenile).toBe(false);

    recordScheduleWorkTick(youth);
    recordScheduleWorkTick(adult);
    expect(youth.scheduleWorkedTicksToday ?? 0).toBe(0);
    expect(adult.scheduleWorkedTicksToday).toBe(1);

    const youthFarm = building(2, BuildingType.Farm);
    expect(assignWorkerTransition(youth, youthFarm)).toBe(false);
    expect(youthFarm.occupants).toEqual([]);
    expect(youth.workerBuildingId).toBeUndefined();
    expect(youth.job).toBe(JobType.Settler);

    const adultFarm = building(3, BuildingType.Farm);
    expect(assignWorkerTransition(adult, adultFarm)).toBe(true);
    expect(adultFarm.occupants).toEqual([2]);
    expect(adult.workerBuildingId).toBe(3);
    expect(adult.job).toBe(JobType.Farmer);
  });
});

describe('invariant consistency across a full assignment cycle', () => {
  it('leaves all workforce invariants satisfied after assign → reassign → remove', () => {
    const settler = human(1, { residenceBuildingId: 10 });
    const house = building(10, BuildingType.House, { occupants: [1] });
    const farmA = building(2, BuildingType.Farm);
    const farmB = building(3, BuildingType.Farm);
    const world = makeWorld([settler], [house, farmA, farmB]);

    assignWorkerTransition(settler, farmA);
    expect(collectSimulationInvariantErrors(world)).toEqual([]);

    transferWorkerBetweenBuildings(settler, farmA, farmB);
    expect(collectSimulationInvariantErrors(world)).toEqual([]);

    removeWorkerTransition(settler, [farmB]);
    expect(collectSimulationInvariantErrors(world)).toEqual([]);
  });
});

describe('prison occupant reconciliation (BUG 2026-08-20-prisoner-occupants-wiped)', () => {
  it('keeps prisoners in prison occupants across syncJobBuildingOccupants', () => {
    const guard = human(1, { workerBuildingId: 8, job: JobType.PrisonGuard });
    const prisoner = human(2, { prisonBuildingId: 8 });
    const prison = building(8, BuildingType.Prison, { occupants: [1, 2] });

    syncJobBuildingOccupants([guard, prisoner], [prison]);

    expect(prison.occupants.sort()).toEqual([1, 2]);
    expect(collectSimulationInvariantErrors(makeWorld([guard, prisoner], [prison]))).toEqual([]);
  });

  it('drops a released prisoner from prison occupants', () => {
    const prisoner = human(2, { prisonBuildingId: 8 });
    const prison = building(8, BuildingType.Prison, { occupants: [2] });

    prisoner.prisonBuildingId = undefined; // released
    syncJobBuildingOccupants([prisoner], [prison]);

    expect(prison.occupants).toEqual([]);
  });
});


describe('blacksmith operational bonus during imprisonment', () => {
  it('reserves the post without granting a bonus until the smith is released', () => {
    const smith = human(31, { workerBuildingId: 32, job: JobType.Blacksmith });
    const forge = building(32, BuildingType.Blacksmith, { occupants: [smith.id] });
    expect(getSmithBonus([forge], [smith])).toBe(1.25);

    smith.prisonBuildingId = 33;
    expect(getSmithBonus([forge], [smith])).toBe(1);
    expect(smith.workerBuildingId).toBe(forge.id);

    smith.prisonBuildingId = undefined;
    expect(getSmithBonus([forge], [smith])).toBe(1.25);
  });
});

function legacyStaffingWorld(): WorldState {
  return {
    entities: [staffingHuman(1)],
    buildings: [staffingBuilding(7, BuildingType.Church, { staffingMode: 'manual' })],
    tick: 0,
    resources: { wood: 100, stone: 100, food: 100, gold: 100, iron: 0 },
    floatingTexts: [],
    notifications: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

describe('automatic workplace staffing', () => {
  it('starts all job-capable buildings in auto, and does not set modes on non-jobs', () => {
    for (const type of [
      BuildingType.Church, BuildingType.Barracks, BuildingType.Prison,
      BuildingType.School, BuildingType.Farm, BuildingType.Tavern,
    ]) {
      const built = createBuilding(type, 20, 20, 1);
      expect(built.staffingMode).toBe('auto');
    }
    expect(createBuilding(BuildingType.House, 20, 20, 2).staffingMode).toBeUndefined();
  });

  it('normalizes legacy manual flags and assigns available workers', () => {
    const world = legacyStaffingWorld();
    assignMissingWorkers(world.entities, world.buildings, world);
    expect(world.buildings[0].occupants).toEqual([1]);
    expect(world.buildings[0].staffingMode).toBe('auto');
    expect(world.entities[0].workerBuildingId).toBe(7);
    // Automatic staffing is the simulation's scheduled responsibility, not a button or notification.
    expect(world.notifications).toHaveLength(0);
  });

  it('rejects attempts to restore manual staffing after auto assignment', () => {
    const world = legacyStaffingWorld();
    assignMissingWorkers(world.entities, world.buildings, world);
    const switched = setBuildingStaffingMode(world, 7, 'manual');
    expect(switched).toBe(world);
    expect(switched.buildings[0].staffingMode).toBe('auto');
    expect(isWorkerCommand({ proto: WORKER_CMD_PROTO, op: 'setBuildingStaffingMode', buildingId: 7, mode: 'manual' })).toBe(false);
  });
});

describe('M37 removeWorkerTransition residence occupancy', () => {
  it('clears workplaces and crews but leaves the residence occupants list intact', () => {
    const settler = human(1, {
      workerBuildingId: 2,
      residenceBuildingId: 10,
      job: JobType.Farmer,
    });
    const builder = human(2);
    const house = building(10, BuildingType.House, { occupants: [1] });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const site = building(3, BuildingType.House, { completed: false, occupants: [2] });
    const state = makeWorld([settler, builder], [house, farm, site]);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);

    removeWorkerTransition(settler, state.buildings);
    removeWorkerTransition(builder, state.buildings);

    expect(house.occupants).toEqual([1]);
    expect(farm.occupants).toEqual([]);
    expect(site.occupants).toEqual([]);
    expect(settler.workerBuildingId).toBeUndefined();
    expect(builder.workerBuildingId).toBeUndefined();
    expect(settler.residenceBuildingId).toBe(10);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });
});

describe('automatic staffing allocation and bounded vacancies', () => {
  const SEED = 20_261_112;

  function completed(
    type: BuildingType,
    x: number,
    y: number,
    id: number,
    overrides: Partial<Building> = {},
  ): Building {
    const building = createBuilding(type, x, y, id);
    building.completed = true;
    building.constructionProgress = 100;
    Object.assign(building, overrides);
    return building;
  }

  function settler(id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
    const entity = createEntity(
      EntityType.Human, x, y, id, 400, false,
      { gender: 'male', name: `Settler${id}`, surname: 'Test', ageYears: 30, colonyDay: 0 },
    );
    Object.assign(entity, overrides);
    return entity;
  }

  function freshWorld(): WorldState {
    return initGame({ skipTerrain: true, villageName: 'Audit', size: 'medium', seed: SEED });
  }

  describe('a jailed holder\'s post is backfilled', () => {
    it('hires reachable idle settlers into posts the sentence reserved', () => {
      const state = freshWorld();
      const farm = completed(BuildingType.Farm, 100, 100, 40);
      const jailed = [1, 2].map((id) => settler(id, 100 + id, 100, {
        workerBuildingId: farm.id,
        prisonBuildingId: 90,
        prisonerUntilTick: 100_000,
      }));
      const idle = [3, 4].map((id) => settler(id, 105 + id, 100));
      state.entities = [...jailed, ...idle];
      state.buildings = [farm];

      assignMissingWorkers(state.entities, state.buildings, state);

      expect(countActiveWorkersAtBuilding(state.entities, farm.id)).toBe(
        BUILDING_CONFIGS[BuildingType.Farm].maxOccupants,
      );
      expect(countWorkersAtBuilding(state.entities, farm.id)).toBe(
        BUILDING_CONFIGS[BuildingType.Farm].maxOccupants + jailed.length,
      );
      for (const prisoner of jailed) expect(prisoner.workerBuildingId).toBe(farm.id);
    });
  });

  describe('a completed Taming Post exposes no post a mechanism cannot fill', () => {
    it('reports no staffing posts while keeping its construction slots', () => {
      const post = completed(BuildingType.TamingPost, 100, 100, 50);
      const idle = settler(1, 100, 100);

      expect(staffingCapFor(post, [idle])).toEqual({ cap: 0, staffed: 0 });
      // Construction still uses the two configured slots (`BUILDING_JOB_TYPES` has no Taming Post job).
      expect(BUILDING_CONFIGS[BuildingType.TamingPost].maxOccupants).toBe(2);
    });
  });

  describe('construction leaves hands for the preset\'s jobs', () => {
    it('seeds the growth preset\'s job building before the builders take the idle pool', () => {
      const state = freshWorld();
      state.workforcePolicy = 'growth';
      const mill = completed(BuildingType.LumberMill, 200, 200, 60);
      const house = createBuilding(BuildingType.House, 100, 100, 61);
      const settlers = Array.from({ length: 6 }, (_, i) => settler(10 + i, 100 + i, 100));
      state.entities = settlers;
      state.buildings = [house, mill];

      assignMissingWorkers(settlers, state.buildings, state);

      expect(countActiveWorkersAtBuilding(settlers, mill.id), 'the Lumber Mill is not left empty').toBeGreaterThan(0);
      expect(house.occupants.length, 'the construction site still has a crew').toBeGreaterThan(0);
    });
  });

  describe('a bounded swap resolves a vacancy no idle settler can reach', () => {
    it('moves the reachable worker and backfills the post behind them', () => {
      const mill = completed(BuildingType.LumberMill, 600, 0, 70);
      const quarry = completed(BuildingType.Quarry, 1_200, 0, 71);
      // The mill worker reaches both sites; the idle settler reaches only the mill.
      const atMill = settler(1, 850, 0, { workerBuildingId: mill.id });
      const idle = settler(2, 100, 0);
      mill.occupants = [atMill.id];

      rebalanceJobWorkers([atMill, idle], [mill, quarry], 'growth', 100);

      expect(atMill.workerBuildingId, 'the reachable worker takes the far vacancy').toBe(quarry.id);
      expect(idle.workerBuildingId, 'the post behind them is backfilled').toBe(mill.id);
      expect(quarry.occupants).toContain(atMill.id);
      expect(mill.occupants).toContain(idle.id);
    });

    it('reserves an idle builder on an unfinished site while evaluating vacancy swaps', () => {
      const mill = completed(BuildingType.LumberMill, 600, 0, 70);
      const quarry = completed(BuildingType.Quarry, 1_200, 0, 71);
      const atMill = settler(1, 850, 0, { workerBuildingId: mill.id });
      const builder = settler(2, 100, 0);
      mill.occupants = [atMill.id];
      const houseSite = createBuilding(BuildingType.House, 2_000, 200, 72);
      houseSite.occupants = [builder.id];

      rebalanceJobWorkers([atMill, builder], [mill, quarry, houseSite], 'growth', 100);

      expect(atMill.workerBuildingId).toBe(mill.id);
      expect(builder.workerBuildingId).toBeUndefined();
      expect(quarry.occupants).toEqual([]);
      expect(mill.occupants).toEqual([atMill.id]);
    });
  });
});

describe('workplace roster index equivalence', () => {
  /** Reference `syncJobBuildingOccupants`: re-filters the whole settler list per building. */
  function referenceSyncJobBuildingOccupants(humans: Entity[], buildings: Building[]): void {
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i];
      if (!building.completed || !BUILDING_JOB_TYPES_REF[building.type]) {
        continue;
      }
      if (building.type === BuildingType.Prison) {
        building.occupants = humans
          .filter(
            (h) =>
              h.alive &&
              isPlayerHuman(h) &&
              (h.workerBuildingId === building.id || h.prisonBuildingId === building.id),
          )
          .map((h) => h.id);
        continue;
      }
      building.occupants = humans
        .filter(
          (h) =>
            h.alive &&
            isPlayerHuman(h) &&
            h.workerBuildingId === building.id &&
            h.prisonBuildingId == null,
        )
        .map((h) => h.id);
    }
  }

  /**
   * Local copy of the production `BUILDING_JOB_TYPES` membership test; it only has to cover the
   * fixture's building types.
   */
  const BUILDING_JOB_TYPES_REF: Partial<Record<BuildingType, unknown>> = {
    [BuildingType.Farm]: true,
    [BuildingType.Prison]: true,
    [BuildingType.Barracks]: true,
    [BuildingType.Market]: true,
    [BuildingType.Tavern]: true,
    [BuildingType.LumberMill]: true,
    [BuildingType.Quarry]: true,
    [BuildingType.Mine]: true,
    [BuildingType.Blacksmith]: true,
    [BuildingType.Workshop]: true,
    [BuildingType.TownHall]: true,
    [BuildingType.Hospital]: true,
    [BuildingType.Church]: true,
    [BuildingType.Store]: true,
    [BuildingType.Silo]: true,
    [BuildingType.Hotel]: true,
  };

  describe('syncJobBuildingOccupants buckets like its pre-fix per-building filter', () => {
    it('keeps the prison union and the narrower job predicate identical, including home === prison', () => {
      const prison = staffingBuilding(1, BuildingType.Prison, { completed: true });
      const farm = staffingBuilding(2, BuildingType.Farm, { completed: true });
      const barracks = staffingBuilding(3, BuildingType.Barracks, { completed: true });
      const secondFarm = staffingBuilding(4, BuildingType.Farm, { completed: true });
      const site = createBuilding(BuildingType.Farm, 900, 900, 5);
      const deadWorker = staffingHuman(1000, { alive: false });

      const humans: Entity[] = [
        // home === prison for both ids: the union must not emit this id twice.
        staffingHuman(1001, { workerBuildingId: prison.id, prisonBuildingId: prison.id }),
        // homes the farm, no prison.
        staffingHuman(1002, { workerBuildingId: farm.id }),
        // homes the farm but is imprisoned elsewhere: excluded from the farm, present in the prison list.
        staffingHuman(1003, { workerBuildingId: farm.id, prisonBuildingId: prison.id }),
        // homeless prisoner.
        staffingHuman(1004, { prisonBuildingId: prison.id }),
        staffingHuman(1005, { workerBuildingId: barracks.id }),
        staffingHuman(1006, { workerBuildingId: secondFarm.id }),
        staffingHuman(1007, { workerBuildingId: site.id }),
        staffingHuman(1008, { workerBuildingId: farm.id, faction: 'rival' }),
        deadWorker,
      ];
      deadWorker.workerBuildingId = farm.id;

      const realWorld = makeWorld(structuredClone(humans), structuredClone([prison, farm, barracks, secondFarm, site]));
      const referenceWorld = makeWorld(structuredClone(humans), structuredClone([prison, farm, barracks, secondFarm, site]));

      syncJobBuildingOccupants(realWorld.entities, realWorld.buildings);
      referenceSyncJobBuildingOccupants(referenceWorld.entities, referenceWorld.buildings);

      expect(realWorld.buildings.map(b => [b.id, [...b.occupants]]), 'every building occupant list').toEqual(
        referenceWorld.buildings.map(b => [b.id, [...b.occupants]]),
      );

      const byId = new Map(realWorld.buildings.map((b) => [b.id, b.occupants]));
      // prison = home-or-prison union, deduped, in humans order.
      expect(byId.get(prison.id)).toEqual([humans[0]!.id, humans[2]!.id, humans[3]!.id]);
      // farm = home-only, so the imprisoned home-worker and the dead one are out.
      expect(byId.get(farm.id)).toEqual([humans[1]!.id]);
      expect(byId.get(barracks.id)).toEqual([humans[4]!.id]);
      // A second completed Farm accepts its own roster; an unfinished site remains untouched.
      expect(byId.get(secondFarm.id)).toEqual([humans[5]!.id]);
      expect(byId.get(site.id)).toEqual([]);
    });
  });
});

describe('Staffing command and custody regressions', () => {
  afterEach(resetSimRng);

  describe('L8 — removal targets the settler\'s own building', () => {
    it('leaves a settler who works elsewhere assigned to their real workplace', () => {
      const state = scenarioWorld();
      const church = scenarioBuilding(1, BuildingType.Church);
      const school = scenarioBuilding(2, BuildingType.School);
      state.buildings = [church, school];
      const worker = scenarioSettler(10, { workerBuildingId: church.id, job: JobType.Priest, occupation: 'priest' });
      church.occupants = [worker.id];
      state.entities = [worker];

      const next = removeStaffWorkerFromBuilding(state, school.id, worker.id);

      // The command names the school, so the priest's church job and occupant slot must survive.
      const nextWorker = next.entities.find((e) => e.id === worker.id)!;
      expect(nextWorker.workerBuildingId).toBe(church.id);
      expect(next.buildings.find((b) => b.id === church.id)!.occupants).toContain(worker.id);
    });

    it('refuses to remove an existing job and leaves normalization to the workforce owner', () => {
      const state = scenarioWorld();
      const church = scenarioBuilding(1, BuildingType.Church, { staffingMode: 'manual' });
      state.buildings = [church];
      const worker = scenarioSettler(10, { workerBuildingId: church.id, job: JobType.Priest, occupation: 'priest' });
      church.occupants = [worker.id];
      state.entities = [worker];

      const next = removeStaffWorkerFromBuilding(state, church.id, worker.id);
      expect(next).toBe(state);
      expect(church.staffingMode).toBe('manual');
      assignMissingWorkers(next.entities, next.buildings, next, true);

      const nextWorker = next.entities.find((e) => e.id === worker.id)!;
      expect(nextWorker.workerBuildingId).toBe(church.id);
      expect(next.buildings.find((b) => b.id === church.id)!.occupants).toContain(worker.id);
      expect(next.buildings.find((b) => b.id === church.id)!.staffingMode).toBe('auto');
    });
  });

  describe('L78 — imprisoned settlers leave construction crews', () => {
    it('detaches a prisoner from the crew it was working', () => {
      const state = scenarioWorld();
      const site = scenarioBuilding(1, BuildingType.House, { completed: false, occupants: [10] });
      const prison = scenarioBuilding(9, BuildingType.Prison, { x: 300, y: 300 });
      const prisoner = scenarioSettler(10, { prisonBuildingId: prison.id, workerBuildingId: undefined });
      prison.occupants = [prisoner.id];
      state.buildings = [site, prison];
      state.entities = [prisoner];

      prepareWorkforce([prisoner], state.buildings);

      // A prisoner leaves the construction crew's occupant list, not just the job link.
      expect(site.occupants).not.toContain(prisoner.id);
      expect(prisoner.prisonBuildingId).toBe(prison.id);
      expect(prison.occupants).toContain(prisoner.id);
    });
  });
});
