import { describe, expect, it } from 'vitest';
import { BuildingType, LEADER_OCCUPATION } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { collectLeaderHousehold, syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { building, human } from '../src/test/factories';

describe('leader housing recognizes independent adult children', () => {
  it('excludes an adult child and their descendants from the entitled household', () => {
    const leader = human(1, { partnerId: 2, childrenIds: [3, 5], residenceBuildingId: 0 });
    const spouse = human(2, { partnerId: 1, childrenIds: [3, 5], residenceBuildingId: 0 });
    const adult = human(3, { age: 30, isJuvenile: false, motherId: 2, fatherId: 1, partnerId: 4, childrenIds: [6], residenceBuildingId: 10 });
    const adultPartner = human(4, { age: 28, partnerId: 3, residenceBuildingId: 10 });
    const minor = human(5, { age: 9, isJuvenile: true, motherId: 2, fatherId: 1, residenceBuildingId: 0 });
    const grandchild = human(6, { age: 4, isJuvenile: true, motherId: 4, fatherId: 3, residenceBuildingId: 10 });
    const state = {
      entities: [leader, spouse, adult, adultPartner, minor, grandchild],
      buildings: [building(0, BuildingType.LeaderHouse, { occupants: [1, 2, 5] }), building(10, BuildingType.House, { occupants: [3, 4, 6] })],
      villageLeaderId: 1, eventLog: [], tick: 0, year: 0, dayInYear: 1,
    } as unknown as WorldState;
    expect(collectLeaderHousehold(state).map((member) => member.id).sort((a, b) => a - b)).toEqual([1, 2, 5]);
    syncLeaderHouseResidency(state);
    expect(adult.residenceBuildingId).toBe(10);
    expect(adultPartner.residenceBuildingId).toBe(10);
    expect(grandchild.residenceBuildingId).toBe(10);
  });

  it('relocates former leader and spouse together without merging a grown child', () => {
    const former = human(1, { partnerId: 2, childrenIds: [3], residenceBuildingId: 0 });
    const spouse = human(2, { partnerId: 1, childrenIds: [3], residenceBuildingId: 0 });
    const adult = human(3, { age: 30, isJuvenile: false, motherId: 2, fatherId: 1, residenceBuildingId: 0 });
    const next = human(10, { residenceBuildingId: 20 });
    const state = {
      entities: [former, spouse, adult, next],
      buildings: [building(0, BuildingType.LeaderHouse, { occupants: [1, 2, 3] }), building(20, BuildingType.House, { occupants: [10] }), building(30, BuildingType.House, { occupants: [] })],
      villageLeaderId: 10, eventLog: [], tick: 0, year: 0, dayInYear: 1,
    } as unknown as WorldState;
    syncLeaderHouseResidency(state);
    expect(former.residenceBuildingId).toBe(spouse.residenceBuildingId);
    expect(former.residenceBuildingId).not.toBe(0);
    expect(adult.residenceBuildingId).not.toBe(0);
  });
});

describe('M18 leader household composition', () => {
  it('leaves grown children out of the manor and logs the move-in only once', () => {
    const leader = human(1, {
      occupation: LEADER_OCCUPATION,
      partnerId: 2,
      childrenIds: [3, 4, 6],
      residenceBuildingId: 10,
      age: 45,
    });
    const spouse = human(2, { partnerId: 1, residenceBuildingId: 10, age: 43 });
    const minorChild = human(3, {
      motherId: 1,
      fatherId: 2,
      isJuvenile: true,
      age: 8,
      residenceBuildingId: 11,
    });
    const marriedChild = human(4, {
      motherId: 1,
      fatherId: 2,
      age: 24,
      partnerId: 5,
      residenceBuildingId: 11,
    });
    const marriedInLaw = human(5, { partnerId: 4, age: 25, residenceBuildingId: 11 });
    const singleAdultChild = human(6, {
      motherId: 1,
      fatherId: 2,
      age: 22,
      residenceBuildingId: 10,
    });
    const manor = building(10, BuildingType.LeaderHouse, { occupants: [1, 2, 6] });
    const house = building(11, BuildingType.House, { occupants: [3, 4, 5] });
    const state = {
      entities: [leader, spouse, minorChild, marriedChild, marriedInLaw, singleAdultChild],
      buildings: [manor, house], villageLeaderId: 1, year: 5, dayInYear: 10, tick: 500, eventLog: [],
    } as unknown as WorldState;

    syncLeaderHouseResidency(state);
    syncLeaderHouseResidency(state); // daily reconciliation runs again the next colony day

    expect(minorChild.residenceBuildingId).toBe(10);
    expect(marriedChild.residenceBuildingId).toBe(11); // married adults keep their own household
    expect(singleAdultChild.residenceBuildingId).not.toBe(10);
    expect(manor.occupants).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(manor.occupants).not.toContain(4);
    expect(manor.occupants).not.toContain(6);
    expect(
      state.eventLog.filter((e) => e.message.includes("moved into the Leader's House")),
    ).toHaveLength(1);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });
});
