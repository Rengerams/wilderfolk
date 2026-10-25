/** A leader's married child settled in an ordinary home keeps their own children with them. */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { building, human } from '../src/test/factories';

interface SettledFamily {
  state: WorldState;
  manor: Building;
  adult: Entity;
  adultSpouse: Entity;
  grandchild: Entity;
}

/** The leader and spouse in the manor; their married adult child's family in a house of its own. */
function settledFamily(): SettledFamily {
  const leader = human(1, { partnerId: 2, residenceBuildingId: 0, childrenIds: [3] });
  const leaderSpouse = human(2, { partnerId: 1, residenceBuildingId: 0, childrenIds: [3] });
  const adult = human(3, {
    motherId: 2, fatherId: 1, partnerId: 4, residenceBuildingId: 10, age: 26,
  });
  const adultSpouse = human(4, { partnerId: 3, residenceBuildingId: 10, age: 25 });
  const grandchild = human(5, {
    motherId: 3, fatherId: 4, residenceBuildingId: 10, isJuvenile: true, age: 4,
  });
  const manor = building(0, BuildingType.LeaderHouse, { occupants: [1, 2] });
  const cottage = building(10, BuildingType.House, { occupants: [3, 4, 5] });
  const state = {
    entities: [leader, leaderSpouse, adult, adultSpouse, grandchild],
    buildings: [manor, cottage],
    villageLeaderId: 1,
    eventLog: [],
    tick: 0,
    year: 0,
    dayInYear: 1,
  } as unknown as WorldState;
  return { state, manor, adult, adultSpouse, grandchild };
}

describe("Leader's House with a settled descendant", () => {
  it('leaves the married child, their spouse and their child in their own home', () => {
    const { state, manor, adult, adultSpouse, grandchild } = settledFamily();

    syncLeaderHouseResidency(state);

    expect(adult.residenceBuildingId).toBe(10);
    expect(adultSpouse.residenceBuildingId).toBe(10);
    expect(grandchild.residenceBuildingId).toBe(10);
    expect(manor.occupants).toEqual([1, 2]);
    expect(state.eventLog).toEqual([]);
  });
});
