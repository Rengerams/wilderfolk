/** A new leader's household takes the manor; the outgoing household leaves together. */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { killHuman } from '../src/game/humanLifecycleCleanup';
import { building, human } from '../src/test/factories';

const MANOR_ID = 0;
const HOUSE_ID = 20;

/** Old leader, spouse and their minor child in the manor; a new leader with a spouse waits outside. */
function successionWorld() {
  const child = human(3, {
    isJuvenile: true,
    age: 8,
    motherId: 2,
    fatherId: 1,
    residenceBuildingId: MANOR_ID,
  });
  const oldLeader = human(1, { partnerId: 2, childrenIds: [3], residenceBuildingId: MANOR_ID });
  const oldSpouse = human(2, { partnerId: 1, childrenIds: [3], residenceBuildingId: MANOR_ID });
  const newLeader = human(10, { partnerId: 11, residenceBuildingId: HOUSE_ID });
  const newSpouse = human(11, { partnerId: 10, residenceBuildingId: HOUSE_ID });
  const manor = building(MANOR_ID, BuildingType.LeaderHouse, {
    occupants: [child.id, oldLeader.id, oldSpouse.id],
  });
  const house = building(HOUSE_ID, BuildingType.House, { occupants: [newLeader.id, newSpouse.id] });
  // The child comes first in `entities` so a per-settler eviction would meet them before a custodian.
  const state = {
    entities: [child, oldLeader, oldSpouse, newLeader, newSpouse],
    buildings: [manor, house],
    villageLeaderId: newLeader.id,
    eventLog: [],
    tick: 0,
    year: 0,
    dayInYear: 1,
  } as unknown as WorldState;
  return { state, manor, house, child, oldLeader, oldSpouse, newLeader, newSpouse };
}

describe("the Leader's House on succession", () => {
  it('moves the new household in and the outgoing household out, child with custodian', () => {
    const { state, manor, child, oldLeader, oldSpouse, newLeader, newSpouse } = successionWorld();

    syncLeaderHouseResidency(state);

    expect(manor.occupants).toContain(newLeader.id);
    expect(manor.occupants).toContain(newSpouse.id);
    expect(manor.occupants).not.toContain(oldLeader.id);
    expect(manor.occupants).not.toContain(oldSpouse.id);
    expect(manor.occupants).not.toContain(child.id);
  });

  it('keeps the late leader\'s family in the manor until the election', () => {
    const { state, manor, oldLeader, oldSpouse, child } = successionWorld();
    state.villageLeaderId = oldLeader.id;

    killHuman(oldLeader, state.buildings, undefined, 0, state);
    expect(state.villageLeaderId).toBeNull();

    syncLeaderHouseResidency(state);

    expect(oldSpouse.residenceBuildingId).toBe(MANOR_ID);
    expect(child.residenceBuildingId).toBe(MANOR_ID);
    expect(manor.occupants).toContain(oldSpouse.id);
    expect(manor.occupants).toContain(child.id);
  });

  it('never leaves a minor behind in the manor without their custodian', () => {
    const { state, child, oldLeader } = successionWorld();

    syncLeaderHouseResidency(state);

    expect(child.residenceBuildingId).toBeDefined();
    expect(child.residenceBuildingId).toBe(oldLeader.residenceBuildingId);
  });
});
