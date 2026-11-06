/**
 * Church staffing: automatic vacancy filling and job continuity, plus the legacy
 * church-save cleanup contract. No individual worker assignment is available.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, JOB_LABELS, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { assignMissingWorkers, rebalanceJobWorkers } from '../src/game/workforce';
import { assignIdleWorkerToBuilding } from '../src/game/buildingActionRouting';
import { clearAutoFilledChurches } from '../src/game/saveLoad';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { building, human } from '../src/test/factories';

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

describe('Church automatic staffing and continuity', () => {
  it('auto-fills an empty Church', () => {
    const idle = [human(1), human(2), human(3)];
    const church = building(4, BuildingType.Church);
    assignMissingWorkers(idle, [church]);
    expect(church.occupants.length).toBeGreaterThan(0);
  });

  it('normalizes a legacy manual flag while filling an empty Church', () => {
    const idle = [human(1), human(2), human(3)];
    const church = building(4, BuildingType.Church, { staffingMode: 'manual' });
    assignMissingWorkers(idle, [church]);
    expect(church.staffingMode).toBe('auto');
    expect(church.occupants.length).toBeGreaterThan(0);
  });

  it('preserves an assigned priest across repeated workforce pulses', () => {
    const priest = human(1, { workerBuildingId: 4, job: JobType.Priest });
    const church = building(4, BuildingType.Church, { occupants: [1], staffingMode: 'manual' });
    assignMissingWorkers([priest], [church]);
    assignMissingWorkers([priest], [church]);
    expect(church.staffingMode).toBe('auto');
    expect(priest.workerBuildingId).toBe(4);
    expect(church.occupants).toContain(1);
  });

  it('does not allow the former individual job-assignment command', () => {
    const priest = human(1);
    const church = building(4, BuildingType.Church);
    const world = makeWorld([priest], [church]);
    const next = assignIdleWorkerToBuilding(world, 4, 1);
    expect(next).toBe(world);
    expect(priest.workerBuildingId).toBeUndefined();
    expect(church.occupants).toEqual([]);
  });

  it('does not strip the sole Farm worker to fill an empty Church', () => {
    const farmWorker = human(1, { workerBuildingId: 2 });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const church = building(4, BuildingType.Church, { staffingMode: 'manual' });
    rebalanceJobWorkers([farmWorker], [farm, church]);
    expect(farmWorker.workerBuildingId).toBe(2);
    expect(church.occupants).toEqual([]);
  });
});

describe('Church legacy-save migration', () => {
  it('clears auto-filled Church seats and resets the workers', () => {
    const priestA = human(1, {
      workerBuildingId: 4,
      occupation: JOB_LABELS[JobType.Priest],
      job: JobType.Priest,
    });
    const priestB = human(2, {
      workerBuildingId: 4,
      occupation: JOB_LABELS[JobType.Priest],
      job: JobType.Priest,
    });
    const church = building(4, BuildingType.Church, { occupants: [1, 2] });
    const world = makeWorld([priestA, priestB], [church]);

    const cleared = clearAutoFilledChurches(world);

    expect(cleared).toBe(2);
    expect(church.occupants).toEqual([]);
    expect(priestA.workerBuildingId).toBeUndefined();
    expect(priestA.occupation).toBe('settler');
    expect(priestA.job).toBe(JobType.Settler);
    expect(priestB.workerBuildingId).toBeUndefined();
    expect(collectSimulationInvariantErrors(world)).toEqual([]);
  });

  it('is idempotent — a second run clears nothing', () => {
    const priest = human(1, { workerBuildingId: 4 });
    const church = building(4, BuildingType.Church, { occupants: [1] });
    const world = makeWorld([priest], [church]);

    expect(clearAutoFilledChurches(world)).toBe(1);
    expect(clearAutoFilledChurches(world)).toBe(0);
    expect(church.occupants).toEqual([]);
  });

  it('never touches a rival settlement Church', () => {
    const rivalPriest = human(1, {
      workerBuildingId: 7,
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
    expect(rivalPriest.workerBuildingId).toBe(7);
  });
});