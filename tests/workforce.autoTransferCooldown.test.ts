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
} from '../src/game/workforce';
import { building, human } from '../src/test/factories';

describe('two-month automatic job stability', () => {
  it('does not move recently assigned workers, but allows transfers again after 60 days', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1, 2] });
    const quarry = building(11, BuildingType.Quarry, { occupants: [] });
    const workers = [
      human(1, { homeBuildingId: 10, lastAutoJobTransferTick: 100 }),
      human(2, { homeBuildingId: 10, lastAutoJobTransferTick: 100 }),
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
    expect(eligible?.homeBuildingId).toBe(11);
    expect(eligible?.lastAutoJobTransferTick).toBe(eligibleTick);
    expect(pickWorkerToTransfer(workers, quarry, farm, eligibleTick + 1)).toBeUndefined();
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
    expect(adults[0].homeBuildingId).toBe(3);
    expect(adults[0].lastAutoJobTransferTick).toBe(2000);
  });
});
