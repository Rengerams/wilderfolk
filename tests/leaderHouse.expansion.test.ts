import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { canBuildLeaderHouse, leaderHouseBuildings } from '../src/game/leaderHouseExpansion';
import { syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { building, human } from '../src/test/factories';

describe('Leader\'s House overflow annex', () => {
  it('allows just one expansion after the main manor exceeds 20 occupants', () => {
    const main = building(10, BuildingType.LeaderHouse, { occupants: Array.from({ length: 20 }, (_, i) => i + 1) });
    expect(canBuildLeaderHouse([main])).toBe(false);
    main.occupants.push(21);
    expect(canBuildLeaderHouse([main])).toBe(true);
    const annex = building(11, BuildingType.LeaderHouse, { groupId: 'leader-house:10' });
    expect(canBuildLeaderHouse([main, annex])).toBe(false);
    expect(leaderHouseBuildings([annex, main]).map((home) => home.id)).toEqual([10, 11]);
    const unlinked = building(12, BuildingType.LeaderHouse);
    expect(leaderHouseBuildings([unlinked, annex, main]).map((home) => home.id)).toEqual([10, 11]);
    expect(canBuildLeaderHouse([unlinked, main])).toBe(false);
    expect(leaderHouseBuildings([annex])).toEqual([]);
    expect(canBuildLeaderHouse([annex])).toBe(false);
    const restored = JSON.parse(JSON.stringify([annex, main])) as typeof annex[];
    expect(leaderHouseBuildings(restored).map((home) => home.id)).toEqual([10, 11]);
  
  });

  it('keeps the leader in the original manor and seats the extra household members in the annex', () => {
    const childIds = Array.from({ length: 20 }, (_, index) => index + 3);
    const leader = human(1, { partnerId: 2, residenceBuildingId: 10, childrenIds: childIds });
    const spouse = human(2, { partnerId: 1, residenceBuildingId: 10, childrenIds: childIds });
    const children = childIds.map((id) => human(id, {
      fatherId: 1, motherId: 2, age: id === 22 ? 8 : 22,
      isJuvenile: id === 22,
      residenceBuildingId: 10,
    }));
    const main = building(10, BuildingType.LeaderHouse, { occupants: [1, 2, ...childIds] });
    const annex = building(11, BuildingType.LeaderHouse, { groupId: 'leader-house:10', occupants: [] });
    const state = {
      entities: [leader, spouse, ...children],
      buildings: [annex, main],
      villageLeaderId: 1,
      eventLog: [],
      tick: 0,
      year: 0,
      dayInYear: 1,
    } as unknown as WorldState;

    syncLeaderHouseResidency(state);

    expect(leader.residenceBuildingId).toBe(10);
    expect(main.occupants).toHaveLength(20);
    expect(annex.occupants).toHaveLength(2);
    expect(children.at(-1)?.residenceBuildingId).toBe(11);
    syncLeaderHouseResidency(state);
    expect(main.occupants).toHaveLength(20);
    expect(annex.occupants).toHaveLength(2);
  });
});
