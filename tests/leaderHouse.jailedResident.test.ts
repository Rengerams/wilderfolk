/** A jail sentence must not cost a manor resident their bed. */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { building, human } from '../src/test/factories';

const MANOR_ID = 0;
const PRISON_ID = 800;

function jailWorld() {
  const leader = human(1, { partnerId: 2, residenceBuildingId: MANOR_ID });
  const spouse = human(2, { partnerId: 1, residenceBuildingId: MANOR_ID, prisonBuildingId: PRISON_ID });
  const manor = building(MANOR_ID, BuildingType.LeaderHouse, { occupants: [leader.id, spouse.id] });
  const state = {
    entities: [leader, spouse],
    buildings: [manor],
    villageLeaderId: 1,
    eventLog: [],
    tick: 0,
    year: 0,
    dayInYear: 1,
  } as unknown as WorldState;
  return { state, manor, leader, spouse };
}

describe("the Leader's House during a jail sentence", () => {
  it('keeps a jailed household member in the manor', () => {
    const { state, manor, spouse } = jailWorld();

    syncLeaderHouseResidency(state);

    expect(spouse.residenceBuildingId).toBe(MANOR_ID);
    expect(manor.occupants).toContain(spouse.id);
  });
});
