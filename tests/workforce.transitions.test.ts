import { HUMAN_ADULT_MIN_AGE as HUMAN_CHILDHOOD_YEARS } from '../src/game/daycycleconstants';
/**
 * Workforce authority — SIMULATION_AUTHORITY.md §3 workforce row + Objective 4.
 *
 * workforce.ts owns assignment: `workerBuildingId`, workplace `occupants`,
 * `occupation`, and `job` must agree after every assignment, no living human
 * may occupy two workplaces, and the leader may work without losing office
 * status or manor residency.
 *
 * These tests exercise the named transitions (assignWorkerTransition /
 * removeWorkerTransition / transferWorkerBetweenBuildings / addToConstructionCrew)
 * and the manual command surface (assignIdleWorkerToBuilding /
 * removeWorkerFromBuilding), verifying duplicate prevention, leader
 * assignment, reassignment, removal, idle-worker counts, and that the
 * Objective 1 invariants hold after every transition.
 */
import { describe, expect, it } from 'vitest';
import {
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
  assignWorkerTransition,
  countWorkingAndIdleSettlers,
  getSmithBonus,
  prepareWorkforce,
  removeWorkerTransition,
  syncJobBuildingOccupants,
  transferWorkerBetweenBuildings,
} from '../src/game/workforce';
import { assignIdleWorkerToBuilding, removeWorkerFromBuilding } from '../src/game/buildingActionRouting';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { setHumanBirthFromAge } from '../src/game/dayCycle';
import { recordScheduleWorkTick } from '../src/game/scheduleFatigue';

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

  it('assigns the leader via the manual command without losing office or manor residency', () => {
    const leader = human(1, {
      occupation: LEADER_OCCUPATION,
      job: JobType.Settler,
      residenceBuildingId: 9,
    });
    const manor = building(9, BuildingType.LeaderHouse, { occupants: [1] });
    const farm = building(2, BuildingType.Farm);
    const world = makeWorld([leader], [manor, farm]);

    const next = assignIdleWorkerToBuilding(world, 2, 1);
    const assigned = next.entities.find((e) => e.id === 1)!;

    expect(assigned.workerBuildingId).toBe(2);
    expect(assigned.occupation).toBe(LEADER_OCCUPATION); // office survives
    expect(assigned.job).toBe(JobType.Farmer);
    expect(next.buildings.find((b) => b.id === 2)!.occupants).toEqual([1]);
    expect(assigned.residenceBuildingId).toBe(9); // manor residency intact
    expect(collectSimulationInvariantErrors(next)).toEqual([]);
  });

  it('auto-staffs an idle leader like any other settler', () => {
    // Authority §5 (2026-08-20): the leader participates in normal workforce
    // assignment — auto-staff may assign an idle leader.
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
  it('removeWorkerFromBuilding clears a manual-staff building (Church) without refill', () => {
    const priest = human(1, {
      workerBuildingId: 4,
      occupation: JOB_LABELS[JobType.Priest],
      job: JobType.Priest,
    });
    const church = building(4, BuildingType.Church, { occupants: [1], staffingMode: 'manual' });
    const world = makeWorld([priest], [church]);

    const next = removeWorkerFromBuilding(world, 4, 1);
    const removed = next.entities.find((e) => e.id === 1)!;

    expect(removed.workerBuildingId).toBeUndefined();
    expect(removed.occupation).toBe('settler');
    expect(next.buildings.find((b) => b.id === 4)!.occupants).toEqual([]);
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
