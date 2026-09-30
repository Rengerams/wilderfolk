/**
 * An orphan must never end up in the Leader's House.
 *
 * The orphan-**housing** rule says so out loud: `pickOrphanResidence` skips any Leader's House
 * (`residencySelection.ts` — `if (isLeaderHouseResidence(residence)) continue;`). Adoption is a
 * separate path that never consults it:
 *
 *   `ensureOrphanAdoption` → `pickRandomAdoptiveCouple` offers **every** player couple, the leader's
 *   included → the orphan is recorded as the leader's and the spouse's child and appended to both
 *   `childrenIds` → `collectMinorHousehold` then counts the orphan as a dependent of the leader →
 *   `syncLeaderHouseResidency` force-moves every household member into the manor the housing rule
 *   had just refused.
 *
 * Reported from play 2026-09-20: "in leadership house i noticed orphans are now adopted that should
 * not be possible". See `BUG_REPORTS/2026-09-20-orphans-adopted-into-the-leaders-house.md`.
 */
import { describe, expect, it } from 'vitest';
import { ensureOrphanAdoption } from '../src/game/residencySelection';
import { syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { HUMAN_ADULT_MIN_AGE } from '../src/game/dayCycle';
import { BuildingType, EntityType, LEADER_OCCUPATION } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';

const LEADER_ID = 1;
const SPOUSE_ID = 2;
const ORPHAN_ID = 3;
const OTHER_COUPLE_A = 4;
const OTHER_COUPLE_B = 5;
const LEADER_HOUSE_ID = 10;
const HOUSE_ID = 11;
const DEAD_MOTHER_ID = 901;
const DEAD_FATHER_ID = 902;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    surname: 'Test',
    gender: 'male',
    alive: true,
    age: HUMAN_ADULT_MIN_AGE + 10,
    isJuvenile: false,
    relationshipStatus: 'single',
    childrenIds: [],
    ...overrides,
  } as Entity;
}

function residence(id: number, type: BuildingType): Building {
  return {
    id,
    type,
    completed: true,
    faction: undefined,
    occupants: [],
    x: 0,
    y: 0,
    width: 20,
    height: 20,
  } as unknown as Building;
}

/**
 * A married pair plus a parentless minor — the minimum an adoption decision needs.
 *
 * The leader carries `LEADER_OCCUPATION`, which is what `leaderHouse.applyLeaderOccupation` writes in
 * a real world, and deliberately **starts unhoused**: the exploit this file guards fired *before*
 * `syncLeaderHouseResidency` ever moved the couple into the manor, so a fixture that pre-houses them
 * would pass a residence-only check and miss the defect.
 */
function village(): { leader: Entity; spouse: Entity; orphan: Entity; humans: Entity[] } {
  const leader = human(LEADER_ID, {
    gender: 'male',
    relationshipStatus: 'married',
    partnerId: SPOUSE_ID,
    occupation: LEADER_OCCUPATION,
  });
  const spouse = human(SPOUSE_ID, {
    gender: 'female',
    relationshipStatus: 'married',
    partnerId: LEADER_ID,
  });
  const orphan = human(ORPHAN_ID, {
    age: 6,
    isJuvenile: true,
    motherId: DEAD_MOTHER_ID,
    fatherId: DEAD_FATHER_ID,
  });
  return { leader, spouse, orphan, humans: [leader, spouse, orphan] };
}

function makeWorld(entities: Entity[], buildings: Building[]): WorldState {
  return {
    entities,
    buildings,
    villageLeaderId: LEADER_ID,
    // `syncLeaderHouseResidency` logs its move-in/evict through `logEvent`, which reads the head of
    // this log — a real world always has it.
    eventLog: [],
    width: 400,
    height: 400,
    tick: 0,
  } as unknown as WorldState;
}

describe("orphans are not adopted into the Leader's House", () => {
  it('control: a village couple still adopts a parentless minor, and the child takes their name', () => {
    // Guards against over-fixing — the ordinary adoption path must keep working.
    const guardianA = human(OTHER_COUPLE_A, {
      surname: 'Adoptive',
      relationshipStatus: 'married',
      partnerId: OTHER_COUPLE_B,
    });
    const guardianB = human(OTHER_COUPLE_B, {
      gender: 'female',
      surname: 'Adoptive',
      relationshipStatus: 'married',
      partnerId: OTHER_COUPLE_A,
    });
    const orphan = human(ORPHAN_ID, {
      surname: 'Birthname',
      age: 6,
      isJuvenile: true,
      motherId: DEAD_MOTHER_ID,
      fatherId: DEAD_FATHER_ID,
    });

    expect(ensureOrphanAdoption(orphan, [guardianA, guardianB, orphan], [residence(HOUSE_ID, BuildingType.House)])).toBe(true);
    expect(orphan.adoptiveFatherId).toBe(OTHER_COUPLE_A);
    expect(orphan.adoptiveMotherId).toBe(OTHER_COUPLE_B);
    // An adopted child is part of the family in name as well as in the tree: the family tree and
    // the Families browser group by surname, so a birth surname here reads as a guest at home.
    expect(orphan.surname).toBe('Adoptive');
  });

  it('gives an orphan a single guardian’s surname too', () => {
    const guardian = human(OTHER_COUPLE_A, { surname: 'Solo', age: HUMAN_ADULT_MIN_AGE });
    const orphan = human(ORPHAN_ID, {
      surname: 'Birthname',
      age: 6,
      isJuvenile: true,
      motherId: DEAD_MOTHER_ID,
      fatherId: DEAD_FATHER_ID,
    });

    expect(ensureOrphanAdoption(orphan, [guardian, orphan], [residence(HOUSE_ID, BuildingType.House)])).toBe(true);
    expect(orphan.adoptiveFatherId).toBe(OTHER_COUPLE_A);
    expect(orphan.surname).toBe('Solo');
  });

  it("does not offer the leader's couple as an adoptive home", () => {
    const { orphan, humans } = village();
    const residences = [residence(LEADER_HOUSE_ID, BuildingType.LeaderHouse), residence(HOUSE_ID, BuildingType.House)];

    ensureOrphanAdoption(orphan, humans, residences);

    expect(orphan.adoptiveFatherId).toBeUndefined();
    expect(orphan.adoptiveMotherId).toBeUndefined();
  });

  it("never moves an orphan into the Leader's House", () => {
    const { leader, spouse, orphan, humans } = village();
    const leaderHouse = residence(LEADER_HOUSE_ID, BuildingType.LeaderHouse);
    const world = makeWorld([leader, spouse, orphan], [leaderHouse, residence(HOUSE_ID, BuildingType.House)]);

    ensureOrphanAdoption(orphan, humans, world.buildings);
    syncLeaderHouseResidency(world);

    expect(orphan.residenceBuildingId).not.toBe(LEADER_HOUSE_ID);
  });

  it('gives an orphan to a village couple before any single', () => {
    const coupleA = human(OTHER_COUPLE_A, {
      surname: 'Adoptive',
      relationshipStatus: 'married',
      partnerId: OTHER_COUPLE_B,
    });
    const coupleB = human(OTHER_COUPLE_B, {
      gender: 'female',
      surname: 'Adoptive',
      relationshipStatus: 'married',
      partnerId: OTHER_COUPLE_A,
    });
    const single = human(6, { surname: 'Solo', age: HUMAN_ADULT_MIN_AGE });
    const orphan = human(ORPHAN_ID, {
      surname: 'Birthname',
      age: 6,
      isJuvenile: true,
      motherId: DEAD_MOTHER_ID,
      fatherId: DEAD_FATHER_ID,
    });

    expect(ensureOrphanAdoption(
      orphan,
      [coupleA, coupleB, single, orphan],
      [residence(HOUSE_ID, BuildingType.House)],
    )).toBe(true);
    expect(orphan.adoptiveFatherId).toBe(OTHER_COUPLE_A);
    expect(orphan.adoptiveMotherId).toBe(OTHER_COUPLE_B);
    expect(orphan.surname).toBe('Adoptive');
  });

  it("does not offer an unmarried leader as a single guardian", () => {
    const leader = human(LEADER_ID, {
      occupation: LEADER_OCCUPATION,
      relationshipStatus: 'single',
    });
    const orphan = human(ORPHAN_ID, {
      age: 6,
      isJuvenile: true,
      motherId: DEAD_MOTHER_ID,
      fatherId: DEAD_FATHER_ID,
    });
    const residences = [residence(LEADER_HOUSE_ID, BuildingType.LeaderHouse), residence(HOUSE_ID, BuildingType.House)];

    ensureOrphanAdoption(orphan, [leader, orphan], residences);

    expect(orphan.adoptiveFatherId).toBeUndefined();
    expect(orphan.adoptiveMotherId).toBeUndefined();
    expect(orphan.residenceBuildingId).toBe(HOUSE_ID);
  });

  it('still houses the orphan somewhere — adoption is refused, not the bed', () => {
    // The rule is "not the manor", not "no housing": an unadopted orphan still needs a bed.
    const { orphan, humans } = village();
    const residences = [residence(LEADER_HOUSE_ID, BuildingType.LeaderHouse), residence(HOUSE_ID, BuildingType.House)];

    ensureOrphanAdoption(orphan, humans, residences);

    expect(orphan.residenceBuildingId).toBe(HOUSE_ID);
  });
});
