/** A cursed Moon Howler keeps the manor claim their family's beds depend on.
 * Guards the Y4 D121 churn: one relocation at dusk and one move-in at dawn, every full moon. */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { collectLeaderHousehold, syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { building, human } from '../src/test/factories';

/** The manor at dusk: the leader home, the infant home, and a cursed spouse whose bed the form
 * switch has already cleared — the state the nightly relocation was triggered from. */
function cursedHousehold(): { state: WorldState; manor: Building; infant: Entity; spouse: Entity } {
  const leader = human(1, { partnerId: 2, residenceBuildingId: 0 });
  const spouse = human(2, {
    partnerId: 1,
    childrenIds: [3],
    type: EntityType.Werewolf,
    moonHowlerCursed: true,
  });
  const infant = human(3, {
    motherId: 2,
    fatherId: 1,
    residenceBuildingId: 0,
    isJuvenile: true,
    age: 1,
  });
  const manor = building(0, BuildingType.LeaderHouse, { occupants: [1, 3] });
  const cottage = building(10, BuildingType.House);
  const state = {
    entities: [leader, spouse, infant],
    buildings: [manor, cottage],
    villageLeaderId: 1,
    eventLog: [],
    tick: 0,
    year: 0,
    dayInYear: 1,
  } as unknown as WorldState;
  return { state, manor, infant, spouse };
}

function manorChronicleEntries(state: WorldState): string[] {
  return (state.eventLog ?? [])
    .map((entry) => entry.message)
    .filter((message) => /Leader's House/.test(message));
}

describe("Leader's House through a household member's Moon Howler curse", () => {
  it('keeps the cursed spouse in the household and the infant in the manor', () => {
    const { state, manor, infant, spouse } = cursedHousehold();

    expect(collectLeaderHousehold(state).map((person) => person.id)).toEqual([1, 2, 3]);

    syncLeaderHouseResidency(state);

    expect(infant.residenceBuildingId).toBe(0);
    expect(manor.occupants).toContain(3);
    // The form switch owns the cursed settler's own bed; the manor does not chase it.
    expect(spouse.residenceBuildingId).toBeUndefined();
    expect(manorChronicleEntries(state)).toEqual([]);
  });

  it('re-admits the reverted spouse at dawn with no relocation and no move-in entry', () => {
    const { state, manor, infant, spouse } = cursedHousehold();
    syncLeaderHouseResidency(state);

    spouse.type = EntityType.Human;
    spouse.residenceBuildingId = 0;
    manor.occupants = [1, 2, 3];
    syncLeaderHouseResidency(state);

    expect(spouse.residenceBuildingId).toBe(0);
    expect(infant.residenceBuildingId).toBe(0);
    expect(manor.occupants).toEqual([1, 2, 3]);
    expect(manorChronicleEntries(state)).toEqual([]);
  });

  it('still evicts a settler the leader household has no claim on', () => {
    const { state, manor } = cursedHousehold();
    const stranger = human(4, { residenceBuildingId: 0 });
    state.entities.push(stranger);
    manor.occupants = [1, 3, 4];

    syncLeaderHouseResidency(state);

    expect(stranger.residenceBuildingId).not.toBe(0);
    expect(manorChronicleEntries(state)).toHaveLength(1);
  });
});
