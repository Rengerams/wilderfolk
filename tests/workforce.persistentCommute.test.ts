/** Static regression contract for persistent automatic jobs and commute eligibility.
 * These cases are intentionally not executed by the documentation/editing agent.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { assignMissingWorkers, assignWorkerInPlace, pickWorkerToTransfer } from '../src/game/workforce';
import { building, human } from '../src/test/factories';

describe('persistent automatic employment and commute eligibility', () => {
  it('refuses an unreachable new workplace instead of treating reachability as a preference', () => {
    const distant = building(10, BuildingType.Farm, { x: 100_000, y: 100_000 });
    const applicant = human(1, { x: 0, y: 0 });
    const assigned = assignWorkerInPlace(distant, [applicant], [distant]);
    expect(assigned).toBe(false);
    expect(applicant.workerBuildingId).toBeUndefined();
    expect(distant.occupants).toEqual([]);
  });

  it('does not transfer an incumbent to an unreachable workplace', () => {
    const source = building(10, BuildingType.Farm, { x: 0, y: 0, occupants: [1, 2] });
    const distant = building(11, BuildingType.Quarry, { x: 100_000, y: 100_000 });
    const workers = [
      human(1, { x: 0, y: 0, workerBuildingId: 10, job: JobType.Farmer }),
      human(2, { x: 0, y: 0, workerBuildingId: 10, job: JobType.Farmer }),
    ];
    expect(pickWorkerToTransfer(workers, source, distant, 100, [source, distant])).toBeUndefined();
    expect(workers.map((worker) => worker.workerBuildingId)).toEqual([10, 10]);
  });

  it('retains existing jobs across unchanged pulses while reacting to a new eligible worker', () => {
    const farm = building(20, BuildingType.Farm, { x: 0, y: 0, occupants: [1] });
    const incumbent = human(1, { x: 0, y: 0, workerBuildingId: 20, job: JobType.Farmer });
    const world = {
      entities: [incumbent], buildings: [farm], tick: 0,
      resources: { wood: 100, stone: 100, food: 100, gold: 100, iron: 100 },
      workforcePolicy: 'survival',
    } as unknown as WorldState;

    assignMissingWorkers(world.entities, world.buildings, world);
    world.tick = 3 * TICKS_PER_DAY;
    assignMissingWorkers(world.entities, world.buildings, world);
    expect(incumbent.workerBuildingId).toBe(20);
    expect(farm.occupants).toContain(1);

    const newcomer = human(2, { x: 0, y: 0 });
    world.entities.push(newcomer);
    assignMissingWorkers(world.entities, world.buildings, world);
    expect(incumbent.workerBuildingId).toBe(20);
    expect(newcomer.workerBuildingId).toBe(20);
  });
});
