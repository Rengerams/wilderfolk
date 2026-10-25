/** The manor hold seats the leader's household even past its twelve beds. */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { building, human } from '../src/test/factories';

const CHILD_IDS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

interface OversizedHousehold {
  state: WorldState;
  manor: Building;
  children: Entity[];
}

/** Leader and spouse seated, twelve adult descendants still without a bed of their own. */
function oversizedHousehold(): OversizedHousehold {
  const leader = human(1, { partnerId: 2, residenceBuildingId: 0, childrenIds: CHILD_IDS });
  const leaderSpouse = human(2, { partnerId: 1, residenceBuildingId: 0, childrenIds: CHILD_IDS });
  const children = CHILD_IDS.map((id) => human(id, { motherId: 2, fatherId: 1, age: 22 }));
  const manor = building(0, BuildingType.LeaderHouse, { occupants: [1, 2] });
  const state = {
    entities: [leader, leaderSpouse, ...children],
    buildings: [manor],
    villageLeaderId: 1,
    eventLog: [],
    tick: 0,
    year: 0,
    dayInYear: 1,
  } as unknown as WorldState;
  return { state, manor, children };
}

describe("Leader's House beyond its bed cap", () => {
  it('seats every descendant of the household', () => {
    const { state, manor, children } = oversizedHousehold();

    syncLeaderHouseResidency(state);

    for (const child of children) expect(child.residenceBuildingId).toBe(manor.id);
    expect(manor.occupants).toHaveLength(2 + CHILD_IDS.length);
  });
});
