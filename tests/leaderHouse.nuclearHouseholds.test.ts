import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { collectLeaderHousehold, syncLeaderHouseResidency } from '../src/game/leaderHouse';
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
