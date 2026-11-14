/**
 * Two jail-reservation defects found by the independent review: releasing a settler must not
 * overfill a post a substitute already holds, and a jailed priest must not count as church staff.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { countStaffedWorkersAtType, restoreWorkerRosterAfterCustody, staffingCapFor } from '../src/game/workforce';

describe('custody release and staffing counts', () => {
  it('does not overfill a post a substitute already holds on release', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [3, 4] });
    const released = human(1, { workerBuildingId: farm.id });
    expect(released.prisonBuildingId).toBeUndefined();

    restoreWorkerRosterAfterCustody(released, [farm]);

    expect(farm.occupants).toEqual([3, 4]);
    // No open post: the returnee is idle, not a third and fourth farmer on a two-post farm.
    expect(released.workerBuildingId).toBeUndefined();
  });

  it('re-posts the returnee when the post is still open', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [3] });
    const released = human(1, { workerBuildingId: farm.id });

    restoreWorkerRosterAfterCustody(released, [farm]);

    expect(farm.occupants).toContain(1);
    expect(farm.occupants).toHaveLength(2);
    expect(released.workerBuildingId).toBe(farm.id);
  });

  it('counts only active holders, not reserved jailed holders, in the panel fill', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [3, 4] });
    const humans = [
      human(1, { workerBuildingId: farm.id, prisonBuildingId: 21 }),
      human(2, { workerBuildingId: farm.id, prisonBuildingId: 21 }),
      human(3, { workerBuildingId: farm.id }),
      human(4, { workerBuildingId: farm.id }),
    ];
    // Two jailed reservations plus two working substitutes: the post is full, not 4 of 2.
    expect(staffingCapFor(farm, humans)).toEqual({ cap: 2, staffed: 2 });
  });

  it('does not count a jailed priest as church staff', () => {
    const church = building(20, BuildingType.Church, { occupants: [7] });
    const jailed = human(7, { workerBuildingId: church.id, prisonBuildingId: 21 });
    expect(countStaffedWorkersAtType([church], [jailed], BuildingType.Church)).toBe(0);
  });
});
