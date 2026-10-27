/** The manor hold seats the leader's household even past its twelve beds. */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { building, human } from '../src/test/factories';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsedOutcome, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { assignMissingResidences } from '../src/game/residencyReconciliation';

const CHILD_IDS = Array.from({ length: 19 }, (_, index) => index + 3);

interface OversizedHousehold {
  state: WorldState;
  manor: Building;
  children: Entity[];
}

/** Leader and spouse seated, nineteen adult descendants still without a bed of their own. */
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
  it('does not require adult descendants to occupy the manor', () => {
    const { state, manor, children } = oversizedHousehold();

    syncLeaderHouseResidency(state);

    for (const child of children) expect(child.residenceBuildingId).not.toBe(manor.id);
    expect(manor.occupants).toEqual([1, 2]);
  });

  it('preserves independent adult descendants through real save/load and housing reconciliation', () => {
    const world = initGame({ seed: 4242 });
    const leader = human(900001, { partnerId: 900002, childrenIds: CHILD_IDS.map((id) => id + 900000) });
    const spouse = human(900002, { partnerId: leader.id, childrenIds: [...(leader.childrenIds ?? [])] });
    const children = CHILD_IDS.map((id) => human(id + 900000, { motherId: spouse.id, fatherId: leader.id, age: 22 }));
    const manor = building(900000, BuildingType.LeaderHouse, { occupants: [] });
    world.entities = [leader, spouse, ...children];
    world.buildings = [manor];
    world.villageLeaderId = leader.id;
    syncLeaderHouseResidency(world);
    const expected = [leader.id, spouse.id].sort((a, b) => a - b);
    expect([...manor.occupants].sort((a, b) => a - b)).toEqual(expected);
    const raw = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
    const parsed = parseSaveJson(raw);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) throw new Error('Save payload refused');
    const outcome = loadGameFromParsedOutcome(parsed.parsed);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.detail ?? outcome.reason);
    const loaded = outcome.world;
    const restoredManor = loaded.buildings.find((item) => item.id === manor.id);
    expect(restoredManor).toBeDefined();
    const assertResidents = () => {
      expect(loaded.entities.filter((entity) => children.some((child) => child.id === entity.id))).toHaveLength(children.length);
      expect(loaded.entities.filter((entity) => expected.includes(entity.id)).map((entity) => entity.id).sort((a, b) => a - b)).toEqual(expected);
      expect(loaded.entities.filter((entity) => expected.includes(entity.id)).every((entity) => entity.residenceBuildingId === manor.id)).toBe(true);
      expect([...(restoredManor?.occupants ?? [])].sort((a, b) => a - b)).toEqual(expected);
    };
    assertResidents();
    assignMissingResidences(loaded.entities, loaded.buildings, loaded.entities, loaded.tick);
    syncLeaderHouseResidency(loaded);
    assertResidents();
  });
});
