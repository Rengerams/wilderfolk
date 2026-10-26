/**
 * The manor hold outlasts the housing pipeline: repeated assignment pulses never re-house the
 * leader's household, whether the office is held or the successor is still undecided.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { collectLeaderHousehold, syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { assignMissingResidences } from '../src/game/residencyReconciliation';
import { LAYER_ASSIGN_INTERVAL } from '../src/game/tickLayerAssign';
import { building, human } from '../src/test/factories';

const MANOR_ID = 0;
const COTTAGE_ID = 10;
const HOUSEHOLD_IDS = [1, 2, 3, 4];

interface ManorWorld {
  state: WorldState;
  manor: Building;
  household: Entity[];
}

/** Leader, spouse, a child and a grown son in the manor, beside a couple still waiting for a bed. */
function manorWorld(): ManorWorld {
  const leader = human(1, { partnerId: 2, residenceBuildingId: MANOR_ID, childrenIds: [3, 4] });
  const spouse = human(2, { partnerId: 1, residenceBuildingId: MANOR_ID, childrenIds: [3, 4] });
  const child = human(3, {
    motherId: 2, fatherId: 1, residenceBuildingId: MANOR_ID, isJuvenile: true, age: 8,
  });
  const son = human(4, { motherId: 2, fatherId: 1, residenceBuildingId: MANOR_ID, age: 14, isJuvenile: true });
  const neighbour = human(5, { partnerId: 6 });
  const neighbourSpouse = human(6, { partnerId: 5 });
  const manor = building(MANOR_ID, BuildingType.LeaderHouse, { occupants: [...HOUSEHOLD_IDS] });
  const cottage = building(COTTAGE_ID, BuildingType.House);
  const state = {
    entities: [leader, spouse, child, son, neighbour, neighbourSpouse],
    buildings: [manor, cottage],
    villageLeaderId: 1,
    eventLog: [],
    tick: 0,
    year: 0,
    dayInYear: 1,
  } as unknown as WorldState;
  return { state, manor, household: [leader, spouse, child, son] };
}

/** One assign pulse in the order the tick runs it: the housing sweep, then the manor hold. */
function assignmentPulse(state: WorldState, tick: number) {
  const protectedIds = new Set(collectLeaderHousehold(state).map((person) => person.id));
  const eligible = state.entities.filter((person) => person.alive && !protectedIds.has(person.id));
  const report = assignMissingResidences(eligible, state.buildings, state.entities, tick);
  syncLeaderHouseResidency(state);
  return report;
}

describe('the manor hold through the housing pipeline', () => {
  it('keeps the leader household in the manor across assignment pulses', () => {
    const { state, manor, household } = manorWorld();
    const relocated: number[] = [];

    for (let pulse = 1; pulse <= 8; pulse++) {
      const report = assignmentPulse(state, pulse * LAYER_ASSIGN_INTERVAL);
      for (const move of report.relocations) relocated.push(...move.members);
      for (const member of household) expect(member.residenceBuildingId).toBe(MANOR_ID);
      expect([...manor.occupants].sort((a, b) => a - b)).toEqual(HOUSEHOLD_IDS);
    }

    expect(relocated.filter((id) => HOUSEHOLD_IDS.includes(id))).toEqual([]);
    expect(state.eventLog).toEqual([]);
  });

  it("keeps the late leader's household in the manor until the succession is decided", () => {
    const { state, manor, household } = manorWorld();
    const [leader, spouse, child, son] = household;
    leader.alive = false;
    leader.residenceBuildingId = undefined;
    manor.occupants = [spouse.id, child.id, son.id];
    state.pendingLeaderHouseResidentIds = [spouse.id, child.id, son.id];

    for (let pulse = 1; pulse <= 4; pulse++) {
      const report = assignmentPulse(state, pulse * LAYER_ASSIGN_INTERVAL);
      const movedInHousehold = report.relocations.flatMap((move) => move.members)
        .filter((id) => HOUSEHOLD_IDS.includes(id));
      expect(movedInHousehold).toEqual([]);
      for (const survivor of [spouse, child, son]) {
        expect(survivor.residenceBuildingId).toBe(MANOR_ID);
      }
      expect([...manor.occupants].sort((a, b) => a - b)).toEqual([2, 3, 4]);
    }
  });
});
