import { describe, expect, it } from 'vitest';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { LEADER_OCCUPATION, applyLeaderOccupation, syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { isManualStaffingBuilding } from '../src/game/workforce';
import { housingUnitNeedsReassignment } from '../src/game/residencySelection';
import { assignMissingResidences } from '../src/game/residencyReconciliation';
import { getResidenceCapacity } from '../src/game/residencyOccupancy';
import { building, human } from '../src/test/factories';
import { killHuman } from '../src/game/humanLifecycleCleanup';

describe("Leader's House", () => {
  it('keeps an oversized leader household in manor zero during general housing convergence', () => {
    const manor = building(0, BuildingType.LeaderHouse);
    const ordinary = building(10, BuildingType.Mansion);
    const leader = human(1, { residenceBuildingId: 0 });
    const children = Array.from({ length: getResidenceCapacity(manor) }, (_, index) => human(index + 2, {
      residenceBuildingId: 0, motherId: 1, isJuvenile: true, age: 8,
    }));
    const household = [leader, ...children];
    expect(housingUnitNeedsReassignment(household, household, [manor, ordinary])).toBe(false);
    assignMissingResidences(household, [manor, ordinary], household);
    assignMissingResidences(household, [manor, ordinary], household);
    expect(household.every((member) => member.residenceBuildingId === 0)).toBe(true);
    expect(ordinary.occupants).toEqual([]);
    expect(manor.occupants).toHaveLength(household.length);
  });

  it('leaves a manor family under the leader owner and removes old occupancy after reunification', () => {
    const leader = human(1, { partnerId: 2, residenceBuildingId: 0 });
    const spouse = human(2, { partnerId: 1, residenceBuildingId: 10 });
    const child = human(3, { motherId: 1, fatherId: 2, residenceBuildingId: 0, isJuvenile: true, age: 8 });
    const manor = building(0, BuildingType.LeaderHouse, { occupants: [1, 3] });
    const normal = building(10, BuildingType.House, { occupants: [2] });
    const state = { entities: [leader, spouse, child], buildings: [manor, normal], villageLeaderId: 1, eventLog: [] } as unknown as WorldState;
    assignMissingResidences(state.entities, state.buildings, state.entities);
    expect(leader.residenceBuildingId).toBe(0);
    expect(child.residenceBuildingId).toBe(0);
    syncLeaderHouseResidency(state);
    expect(spouse.residenceBuildingId).toBe(0);
    expect(normal.occupants).toEqual([]);
    expect(manor.occupants).toEqual([1, 2, 3]);
  });

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
    const incoming = human(1, { workerBuildingId: 20, occupation: 'settler', job: JobType.Farmer });
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
    expect(incoming.workerBuildingId).toBe(20);
    expect(farm.occupants).toContain(1);
    expect(construction.occupants).toContain(1); // crews preserved too
    expect(former.occupation).toBe('settler');
    expect(former.job).toBe(JobType.Settler);
  });

  it('repairs a STALE leader workplace (missing building) at office-taking', () => {
    const incoming = human(1, { workerBuildingId: 99, occupation: 'settler', job: JobType.Farmer });
    const state = {
      entities: [incoming],
      buildings: [],
      villageLeaderId: 1,
    } as unknown as WorldState;

    applyLeaderOccupation(state, null);

    expect(incoming.occupation).toBe(LEADER_OCCUPATION);
    expect(incoming.workerBuildingId).toBeUndefined();
    expect(incoming.job).toBe(JobType.Settler);
  });

  it('save-load reconcile (applyLeaderOccupation on load) PRESERVES a valid leader assignment', () => {
    // validateVillageLeaderOnLoad calls applyLeaderOccupation(state, null) on
    // every load — it must keep a manually assigned workplace (BUG
    // 2026-08-20-leader-cannot-hold-workplace.md).
    const leader = human(1, {
      workerBuildingId: 2,
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
    expect(leader.workerBuildingId).toBe(2);
    expect(leader.job).toBe(JobType.Farmer);
    expect(farm.occupants).toEqual([1]);
  });
});

describe('Leader house after a leader dies', () => {
  it('keeps minor children in the manor during orphan placement and the vacant succession', () => {
    const leader = human(1, { residenceBuildingId: 0, childrenIds: [3] });
    const parent = human(2, { residenceBuildingId: 10 });
    const child = human(3, {
      age: 8, isJuvenile: true, fatherId: 1, motherId: 2,
      residenceBuildingId: 0,
    });
    const manor = building(0, BuildingType.LeaderHouse, { occupants: [1, 3] });
    const normalHouse = building(10, BuildingType.House, { occupants: [2] });
    const state = {
      entities: [leader, parent, child], buildings: [manor, normalHouse],
      villageLeaderId: 1, eventLog: [],
    } as unknown as WorldState;

    killHuman(leader, state.buildings, new Map([[2, parent], [3, child]]));
    state.villageLeaderId = null; // Succession election pending
    state.entities = [parent, child];

    syncLeaderHouseResidency(state);
    assignMissingResidences(state.entities, state.buildings, state.entities);

    expect(child.residenceBuildingId).toBe(0);
    expect(manor.occupants).toContain(3);
    expect(parent.residenceBuildingId).toBe(10);
  });
});

describe('succession residency handover', () => {
  it('restores displaced former-family residents during vacancy and evicts them only on election', () => {
    const formerChild = human(3, { residenceBuildingId: 10, isJuvenile: true, age: 8 });
    const successor = human(4, { residenceBuildingId: 10 });
    const manor = building(0, BuildingType.LeaderHouse, { occupants: [] });
    const cottage = building(10, BuildingType.House, { occupants: [3, 4] });
    const state = {
      entities: [formerChild, successor],
      buildings: [manor, cottage],
      villageLeaderId: null,
      pendingLeaderHouseResidentIds: [3],
      eventLog: [],
      tick: 0,
    } as unknown as WorldState;

    syncLeaderHouseResidency(state);
    expect(formerChild.residenceBuildingId).toBe(0);
    expect(manor.occupants).toContain(3);

    state.villageLeaderId = 4;
    syncLeaderHouseResidency(state);

    expect(state.pendingLeaderHouseResidentIds).toBeUndefined();
    expect(successor.residenceBuildingId).toBe(0);
    expect(formerChild.residenceBuildingId).not.toBe(0);
    expect(manor.occupants).toEqual([4]);
  });
});

describe('manual staffing policy', () => {
  it('defaults every workplace to auto and honours an explicit manual flag', () => {
    const church = building(4, BuildingType.Church);
    expect(isManualStaffingBuilding(church)).toBe(false);
    expect(isManualStaffingBuilding({ ...church, staffingMode: 'manual' })).toBe(true);
    expect(isManualStaffingBuilding({ ...church, staffingMode: 'auto' })).toBe(false);
  });
});