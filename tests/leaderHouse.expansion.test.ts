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
    expect(canBuildLeaderHouse([annex])).toBe(true);
    const restored = JSON.parse(JSON.stringify([annex, main])) as typeof annex[];
    expect(leaderHouseBuildings(restored).map((home) => home.id)).toEqual([10, 11]);
  
  });

  it('permits replacing a demolished main manor without treating its orphaned annex as a main', () => {
    const main = building(10, BuildingType.LeaderHouse, { occupants: Array.from({ length: 21 }, (_, i) => i + 1) });
    const annex = building(11, BuildingType.LeaderHouse, { groupId: 'leader-house:10' });
    expect(canBuildLeaderHouse([main, annex])).toBe(false);
    // Demolition removes the main, leaving an annex linked to a missing ID.
    expect(leaderHouseBuildings([annex])).toEqual([]);
    expect(canBuildLeaderHouse([annex])).toBe(true);
    const replacement = building(12, BuildingType.LeaderHouse);
    expect(leaderHouseBuildings([annex, replacement]).map((home) => home.id)).toEqual([12, 11]);
    expect(canBuildLeaderHouse([annex, replacement])).toBe(false);
    // A new annex must link to the replacement rather than the demolished building.
    const newAnnex = building(13, BuildingType.LeaderHouse, { groupId: 'leader-house:12' });
    expect(leaderHouseBuildings([annex, replacement, newAnnex]).map((home) => home.id)).toEqual([12, 13, 11]);
  });

  it('evicts an unrelated prior leader household from a surviving annex after replacement', () => {
    const formerLeader = human(31, { residenceBuildingId: 11 });
    const newLeader = human(32, { residenceBuildingId: 12 });
    const oldAnnex = building(11, BuildingType.LeaderHouse, { groupId: 'leader-house:10', occupants: [31] });
    const replacement = building(12, BuildingType.LeaderHouse, { occupants: [32] });
    const state = {
      entities: [formerLeader, newLeader],
      buildings: [oldAnnex, replacement],
      villageLeaderId: 32,
      eventLog: [],
      tick: 0,
      year: 0,
      dayInYear: 1,
    } as unknown as WorldState;
    syncLeaderHouseResidency(state);
    expect(newLeader.residenceBuildingId).toBe(12);
    expect(formerLeader.residenceBuildingId).not.toBe(11);
    expect(oldAnnex.occupants).not.toContain(31);
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
