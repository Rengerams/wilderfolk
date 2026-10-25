/** A jailed parent is away, not gone: custody is borrowed and returns on release. */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { assignMissingResidences, ensureOrphanAdoption, restoreCustodyAfterRelease } from '../src/game/residencyReconciliation';
import { building, human } from '../src/test/factories';

const PRISON_ID = 900;
const GUARDIAN_HOUSE_ID = 20;
const FREE_HOUSE_ID = 22;

function jailedCoupleWorld() {
  const mother = human(1, { gender: 'female', partnerId: 2, childrenIds: [3], prisonBuildingId: PRISON_ID });
  const father = human(2, { partnerId: 1, childrenIds: [3], prisonBuildingId: PRISON_ID });
  const child = human(3, { isJuvenile: true, age: 8, motherId: 1, fatherId: 2 });
  const guardian = human(4, { gender: 'female', relationshipStatus: 'single', residenceBuildingId: GUARDIAN_HOUSE_ID });
  const guardianHouse = building(GUARDIAN_HOUSE_ID, BuildingType.House, { occupants: [guardian.id] });
  const freeHouse = building(FREE_HOUSE_ID, BuildingType.House, { occupants: [] });
  const prison = building(PRISON_ID, BuildingType.Prison, { occupants: [mother.id, father.id] });
  const humans: Entity[] = [mother, father, child, guardian];
  const residences: Building[] = [guardianHouse, freeHouse];
  return { mother, father, child, guardian, guardianHouse, freeHouse, prison, humans, residences };
}

describe('custody while both parents serve a sentence', () => {
  it('places the child with a stand-in guardian instead of leaving them alone', () => {
    const { child, guardian, guardianHouse, humans, residences } = jailedCoupleWorld();

    const adopted = ensureOrphanAdoption(child, humans, residences);

    expect(adopted).toBe(true);
    expect(child.adoptiveMotherId).toBe(guardian.id);
    expect(child.residenceBuildingId).toBeDefined();
    expect(child.residenceBuildingId).toBe(guardian.residenceBuildingId);
  });

  it('returns custody to the parent once the sentence ends', () => {
    const { mother, father, child, guardianHouse, freeHouse, humans, residences } = jailedCoupleWorld();
    ensureOrphanAdoption(child, humans, residences);
    const buildings = [guardianHouse, freeHouse];

    mother.prisonBuildingId = undefined;
    father.prisonBuildingId = undefined;
    const homecoming = [mother, father].flatMap((parent) => restoreCustodyAfterRelease(parent, humans));

    expect(homecoming).toContain(child);
    expect(child.adoptiveMotherId).toBeUndefined();
    expect(child.adoptiveFatherId).toBeUndefined();

    assignMissingResidences([mother, father, child], buildings, humans);
    expect(child.residenceBuildingId).toBeDefined();
    expect(child.residenceBuildingId).toBe(mother.residenceBuildingId);
  });
});
