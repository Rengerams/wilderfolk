import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import {
  AUTO_JOB_TRANSFER_COOLDOWN_TICKS,
  canAutoChangeWorkplace,
  findOverstaffedDonorBuilding,
  pickWorkerToTransfer,
  transferWorkerBetweenBuildings,
  assignMissingWorkers,
  rebalanceJobWorkers,
} from '../src/game/workforce';
import { building, human } from '../src/test/factories';

describe('two-month automatic job stability', () => {
  it('borrows only one worker for an empty post and retains stable assignments', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2, 3, 4] });
    const barracks = building(11, BuildingType.Barracks, { occupants: [] });
    const workers = [1, 2, 3, 4].map((id) => human(id, { workerBuildingId: 10 }));
    rebalanceJobWorkers(workers, [farm, barracks], undefined, 100);
    expect(farm.occupants).toHaveLength(3);
    expect(barracks.occupants).toHaveLength(1);
    expect(workers.filter((worker) => worker.workerBuildingId === 11)).toHaveLength(1);
    expect(workers.filter((worker) => worker.lastAutoJobTransferTick === 100)).toHaveLength(1);
    const assignments = workers.map((worker) => worker.workerBuildingId);
    rebalanceJobWorkers(workers, [farm, barracks], undefined, 101);
    expect(workers.map((worker) => worker.workerBuildingId)).toEqual(assignments);
  });

  it('keeps an already staffed barracks stable instead of topping it off by transfers', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2, 3] });
    const barracks = building(11, BuildingType.Barracks, { occupants: [4] });
    const workers = [1, 2, 3].map((id) => human(id, { workerBuildingId: 10 }));
    workers.push(human(4, { workerBuildingId: 11 }));
    const original = workers.map((worker) => worker.workerBuildingId);

    for (const tick of [100, 101, 100 + AUTO_JOB_TRANSFER_COOLDOWN_TICKS]) {
      rebalanceJobWorkers(workers, [farm, barracks], undefined, tick);
      expect(workers.map((worker) => worker.workerBuildingId)).toEqual(original);
    }
  });

  it('does not move recently assigned workers, but allows transfers again after 60 days', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const quarry = building(11, BuildingType.Quarry, { occupants: [] });
    const workers = [
      human(1, { workerBuildingId: 10, lastAutoJobTransferTick: 100 }),
      human(2, { workerBuildingId: 10, lastAutoJobTransferTick: 100 }),
    ];
    const jobs = [farm, quarry];

    expect(AUTO_JOB_TRANSFER_COOLDOWN_TICKS).toBe(60 * TICKS_PER_DAY);
    expect(canAutoChangeWorkplace(workers[0], 100 + AUTO_JOB_TRANSFER_COOLDOWN_TICKS - 1)).toBe(false);
    expect(findOverstaffedDonorBuilding(jobs, workers, 11, 101)).toBeUndefined();
    expect(pickWorkerToTransfer(workers, farm, quarry, 101)).toBeUndefined();

    const eligibleTick = 100 + AUTO_JOB_TRANSFER_COOLDOWN_TICKS;
    expect(canAutoChangeWorkplace(workers[0], eligibleTick)).toBe(true);
    expect(findOverstaffedDonorBuilding(jobs, workers, 11, eligibleTick)?.id).toBe(10);
    const eligible = pickWorkerToTransfer(workers, farm, quarry, eligibleTick);
    expect(eligible).toBeDefined();
    transferWorkerBetweenBuildings(eligible!, farm, quarry, eligibleTick);
    expect(eligible?.workerBuildingId).toBe(11);
    expect(eligible?.lastAutoJobTransferTick).toBe(eligibleTick);
    expect(pickWorkerToTransfer(workers, quarry, farm, eligibleTick + 1)).toBeUndefined();
  });

  it('chooses the smallest eligible donor, preserving source order for ties', () => {
    const jobs = [
      building(10, BuildingType.Farm, { occupants: [1, 2, 3] }),
      building(11, BuildingType.Quarry, { occupants: [4, 5] }),
      building(12, BuildingType.Mine, { occupants: [6, 7] }),
      building(13, BuildingType.Hotel, { staffingMode: 'manual', occupants: [8, 9] }),
    ];
    const workers = [
      ...[1, 2, 3].map((id) => human(id, { workerBuildingId: 10 })),
      ...[4, 5].map((id) => human(id, { workerBuildingId: 11 })),
      ...[6, 7].map((id) => human(id, { workerBuildingId: 12 })),
      ...[8, 9].map((id) => human(id, { workerBuildingId: 13 })),
    ];
    expect(findOverstaffedDonorBuilding(jobs, workers, 99)?.id).toBe(11);
    expect(findOverstaffedDonorBuilding(jobs, workers, 11)?.id).toBe(12);
    expect(findOverstaffedDonorBuilding(jobs, workers, 12)?.id).toBe(11);
    // An eligible worker at a donor is necessary, not merely two assigned employees.
    workers[3].lastAutoJobTransferTick = 99;
    workers[4].lastAutoJobTransferTick = 99;
    expect(findOverstaffedDonorBuilding(jobs, workers, 99, 100)?.id).toBe(12);
  });

  it('handles thousands of settlers without one population scan per donor building', () => {
    const jobs = Array.from({ length: 200 }, (_, i) =>
      building(1000 + i, BuildingType.Farm),
    );
    const workers = Array.from({ length: 8000 }, (_, i) =>
      human(10000 + i, { workerBuildingId: 1000 + Math.floor(i / 40) }),
    );
    expect(findOverstaffedDonorBuilding(jobs, workers, -1)?.id).toBe(1000);
    expect(findOverstaffedDonorBuilding(jobs, workers, 1000)?.id).toBe(1001);
  });

  it('allows older saves without timestamps and never blocks a first job', () => {
    const fresh = human(4);
    expect(canAutoChangeWorkplace(fresh, 2000)).toBe(true);

    const house = building(2, BuildingType.House, { occupants: [4] });
    const farm = building(3, BuildingType.Farm, { occupants: [] });
    const adults = [human(4, { residenceBuildingId: 2 })];
    assignMissingWorkers(adults, [house, farm], {
      tick: 2000,
      tavernSchedule: undefined,
      hotelSchedule: undefined,
      workforcePolicy: undefined,
    });
    expect(adults[0].workerBuildingId).toBe(3);
    expect(adults[0].lastAutoJobTransferTick).toBe(2000);
  });
});

describe('a prisoner keeps the reserved post', () => {
  it('is never the worker a rebalance moves, though the post still counts as crew', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const quarry = building(11, BuildingType.Quarry, { occupants: [] });
    const free = human(1, { workerBuildingId: 10 });
    const jailed = human(2, { workerBuildingId: 10, prisonBuildingId: 90, prisonerUntilTick: 10_000 });
    const workers = [free, jailed];
    const tick = 100 + AUTO_JOB_TRANSFER_COOLDOWN_TICKS * 2;

    expect(canAutoChangeWorkplace(jailed, tick)).toBe(false);
    // Two assigned settlers make the farm a donor; only the settler who can attend may leave it.
    expect(findOverstaffedDonorBuilding([farm, quarry], workers, 11, tick)?.id).toBe(10);
    expect(pickWorkerToTransfer(workers, farm, quarry, tick)).toBe(free);

    rebalanceJobWorkers(workers, [farm, quarry], undefined, tick);
    expect(quarry.occupants).toEqual([1]);
    expect(jailed.workerBuildingId).toBe(10);
  });

  it('leaves a crew of prisoners with no one to donate', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const quarry = building(11, BuildingType.Quarry, { occupants: [] });
    const prisoners = [1, 2].map((id) =>
      human(id, { workerBuildingId: 10, prisonBuildingId: 90, prisonerUntilTick: 10_000 }),
    );

    expect(findOverstaffedDonorBuilding([farm, quarry], prisoners, 11, 100)).toBeUndefined();
    rebalanceJobWorkers(prisoners, [farm, quarry], undefined, 100);
    expect(quarry.occupants).toEqual([]);
  });
});
