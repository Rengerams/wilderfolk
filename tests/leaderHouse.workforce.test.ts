import { describe, expect, it } from 'vitest';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { LEADER_OCCUPATION, applyLeaderOccupation, syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { isManualStaffBuilding } from '../src/game/workforce';
import { building, human } from '../src/test/factories';

describe("Leader's House", () => {
  it('moves the leader household into the completed manor and evicts outsiders', () => {
    const leader = human(1, { partnerId: 2, childrenIds: [3] });
    const spouse = human(2, { partnerId: 1 });
    const child = human(3, { motherId: 1, isJuvenile: true });
    const outsider = human(4, { residenceBuildingId: 10 });
    const manor = building(10, BuildingType.LeaderHouse);
    const normalHouse = building(11, BuildingType.House);
    const state = {
      entities: [leader, spouse, child, outsider],
      buildings: [manor, normalHouse],
      villageLeaderId: 1,
      eventLog: [],
    } as unknown as WorldState;

    syncLeaderHouseResidency(state);

    expect(leader.residenceBuildingId).toBe(10);
    expect(spouse.residenceBuildingId).toBe(10);
    expect(child.residenceBuildingId).toBe(10);
    expect(outsider.residenceBuildingId).toBe(11);
  });

  it('releases the former leader and PRESERVES the incoming leader\'s valid workplace', () => {
    // Authority §5 (2026-08-20): the leader participates in normal workforce
    // assignment — office-taking preserves a valid workplace; only STALE
    // assignments (missing/demolished/invalid) are repaired.
    const incoming = human(1, { homeBuildingId: 20, occupation: 'settler', job: JobType.Farmer });
    const former = human(2, { occupation: LEADER_OCCUPATION, job: JobType.Settler });
    const farm = building(20, BuildingType.Farm, { occupants: [1] });
    const construction = building(21, BuildingType.House, { occupants: [1] });
    const state = {
      entities: [incoming, former],
      buildings: [farm, construction],
      villageLeaderId: 1,
    } as unknown as WorldState;

    applyLeaderOccupation(state, 2);

    expect(incoming.occupation).toBe(LEADER_OCCUPATION);
    expect(incoming.job).toBe(JobType.Farmer); // valid workplace kept
    expect(incoming.homeBuildingId).toBe(20);
    expect(farm.occupants).toContain(1);
    expect(construction.occupants).toContain(1); // crews preserved too
    expect(former.occupation).toBe('settler');
    expect(former.job).toBe(JobType.Settler);
  });

  it('repairs a STALE leader workplace (missing building) at office-taking', () => {
    const incoming = human(1, { homeBuildingId: 99, occupation: 'settler', job: JobType.Farmer });
    const state = {
      entities: [incoming],
      buildings: [],
      villageLeaderId: 1,
    } as unknown as WorldState;

    applyLeaderOccupation(state, null);

    expect(incoming.occupation).toBe(LEADER_OCCUPATION);
    expect(incoming.homeBuildingId).toBeUndefined();
    expect(incoming.job).toBe(JobType.Settler);
  });

  it('save-load reconcile (applyLeaderOccupation on load) PRESERVES a valid leader assignment', () => {
    // validateVillageLeaderOnLoad calls applyLeaderOccupation(state, null) on
    // every load — it must keep a manually assigned workplace (BUG
    // 2026-08-20-leader-cannot-hold-workplace.md).
    const leader = human(1, {
      homeBuildingId: 2,
      occupation: LEADER_OCCUPATION,
      job: JobType.Farmer,
    });
    const farm = building(2, BuildingType.Farm, { occupants: [1] });
    const state = {
      entities: [leader],
      buildings: [farm],
      villageLeaderId: 1,
    } as unknown as WorldState;

    applyLeaderOccupation(state, null); // load-time reconcile

    expect(leader.occupation).toBe(LEADER_OCCUPATION);
    expect(leader.homeBuildingId).toBe(2);
    expect(leader.job).toBe(JobType.Farmer);
    expect(farm.occupants).toEqual([1]);
  });
});

describe('manual staffing policy', () => {
  it('keeps civic and security buildings manual while ordinary production remains auto-staffable', () => {
    for (const type of [
      BuildingType.TownHall,
      BuildingType.Church,
      BuildingType.Prison,
      BuildingType.Barracks,
    ]) {
      expect(isManualStaffBuilding(type)).toBe(true);
    }
    expect(isManualStaffBuilding(BuildingType.Farm)).toBe(false);
  });
});