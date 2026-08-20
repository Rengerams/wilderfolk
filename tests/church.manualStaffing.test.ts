/**
 * Church manual staffing — SIMULATION_AUTHORITY.md §5 + Objective 5.
 *
 * The Church has capacity for four but requires only the player-selected
 * priest; manual buildings are never filled by generic auto-staffing or
 * rebalancing. A one-time save migration clears legacy Churches that were
 * auto-filled before manual priest selection existed.
 *
 * Covers: new-save (never auto-filled), manual assignment, daily
 * reconciliation (keeps the assigned priest, adds none), legacy-save
 * migration (idempotent, player Churches only), and invariant cleanliness.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JOB_LABELS, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { assignMissingWorkers, rebalanceJobWorkers } from '../src/game/workforce';
import { assignIdleWorkerToBuilding } from '../src/game/buildingActions';
import { clearAutoFilledChurches } from '../src/game/saveLoad';
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
    notifications: [],
    floatingTexts: [],
    nextFloatingTextId: 1,
  } as unknown as WorldState;
}

describe('Church manual staffing', () => {
  it('never auto-fills an empty Church on the daily staffing pass', () => {
    const idle = [human(1), human(2), human(3)];
    const church = building(4, BuildingType.Church);

    assignMissingWorkers(idle, [church]);

    expect(church.occupants).toEqual([]);
  });

  it('never moves workers into an empty Church via rebalance', () => {
    const farmWorker = human(1, { homeBuildingId: 2 });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const church = building(4, BuildingType.Church);

    rebalanceJobWorkers([farmWorker], [farm, church]);

    expect(church.occupants).toEqual([]);
    expect(farm.occupants).toEqual([1]);
  });

  it('assigns exactly the chosen priest manually', () => {
    const priest = human(1);
    const other = human(2);
    const church = building(4, BuildingType.Church);
    const world = makeWorld([priest, other], [church]);

    const next = assignIdleWorkerToBuilding(world, 4, 1);
    const assigned = next.entities.find((e) => e.id === 1)!;

    expect(next.buildings.find((b) => b.id === 4)!.occupants).toEqual([1]);
    expect(assigned.homeBuildingId).toBe(4);
    expect(assigned.job).toBe(JobType.Priest);
    expect(assigned.occupation).toBe(JOB_LABELS[JobType.Priest]);
    expect(collectSimulationInvariantErrors(next)).toEqual([]);
  });

  it('daily reconciliation keeps the assigned priest and adds no extras', () => {
    const priest = human(1, { homeBuildingId: 4, job: JobType.Priest });
    const idle = [human(2), human(3), human(4)];
    const church = building(4, BuildingType.Church, { occupants: [1] });

    assignMissingWorkers([priest, ...idle], [church]);

    expect(church.occupants).toEqual([1]);
    expect(priest.homeBuildingId).toBe(4);
  });
});

describe('Church legacy-save migration', () => {
  it('clears auto-filled Church seats and resets the workers', () => {
    const priestA = human(1, {
      homeBuildingId: 4,
      occupation: JOB_LABELS[JobType.Priest],
      job: JobType.Priest,
    });
    const priestB = human(2, {
      homeBuildingId: 4,
      occupation: JOB_LABELS[JobType.Priest],
      job: JobType.Priest,
    });
    const church = building(4, BuildingType.Church, { occupants: [1, 2] });
    const world = makeWorld([priestA, priestB], [church]);

    const cleared = clearAutoFilledChurches(world);

    expect(cleared).toBe(2);
    expect(church.occupants).toEqual([]);
    expect(priestA.homeBuildingId).toBeUndefined();
    expect(priestA.occupation).toBe('settler');
    expect(priestA.job).toBe(JobType.Settler);
    expect(priestB.homeBuildingId).toBeUndefined();
    expect(collectSimulationInvariantErrors(world)).toEqual([]);
  });

  it('is idempotent — a second run clears nothing', () => {
    const priest = human(1, { homeBuildingId: 4 });
    const church = building(4, BuildingType.Church, { occupants: [1] });
    const world = makeWorld([priest], [church]);

    expect(clearAutoFilledChurches(world)).toBe(1);
    expect(clearAutoFilledChurches(world)).toBe(0);
    expect(church.occupants).toEqual([]);
  });

  it('never touches a rival settlement Church', () => {
    const rivalPriest = human(1, {
      homeBuildingId: 7,
      occupation: JOB_LABELS[JobType.Priest],
      job: JobType.Priest,
      faction: 'rival',
    });
    const rivalChurch = building(7, BuildingType.Church, {
      occupants: [1],
      faction: 'rival',
    });
    const world = makeWorld([rivalPriest], [rivalChurch]);

    expect(clearAutoFilledChurches(world)).toBe(0);
    expect(rivalChurch.occupants).toEqual([1]);
    expect(rivalPriest.homeBuildingId).toBe(7);
  });
});
