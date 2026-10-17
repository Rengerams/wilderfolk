import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import { human, building } from '../src/test/factories';
import { isMinorChild, isHousingDependentChild, getChildCustodian } from '../src/game/householdComposition';
import { buildHousingUnits } from '../src/game/residencySelection';
import { assignMissingResidences } from '../src/game/residencyReconciliation';

function youngFamily() {
  const grandmother = human(1, {
    age: 44, gender: 'female', childrenIds: [2], residenceBuildingId: 10,
  });
  const mother = human(2, {
    age: 16, isJuvenile: true, gender: 'female', motherId: 1,
    youthLovePartnerId: 4, childrenIds: [3], residenceBuildingId: 10,
  });
  const baby = human(3, {
    age: 0, isJuvenile: true, motherId: 2, fatherId: 4,
    residenceBuildingId: 10,
  });
  const father = human(4, {
    age: 16, isJuvenile: true, gender: 'male', youthLovePartnerId: 2,
    childrenIds: [3],
  });
  return { grandmother, mother, baby, father };
}

describe('a teenage mother keeps her baby', () => {
  it('places the mother and baby in one housing unit instead of assigning the mother to her grandmother', () => {
    const { grandmother, mother, baby, father } = youngFamily();
    const humans = [grandmother, mother, baby, father];

    expect(isMinorChild(mother)).toBe(true);
    expect(isHousingDependentChild(mother)).toBe(false);
    expect(isHousingDependentChild(baby)).toBe(true);
    expect(getChildCustodian(baby, humans)?.id).toBe(mother.id);
    const units = buildHousingUnits(humans);
    expect(units.find((unit) => unit.some((person) => person.id === mother.id))?.map((person) => person.id))
      .toEqual([mother.id, baby.id]);
    expect(units.find((unit) => unit.some((person) => person.id === grandmother.id))?.map((person) => person.id))
      .toEqual([grandmother.id]);
  });

  it('moves mother and baby together when an independent house has room', () => {
    const { grandmother, mother, baby } = youngFamily();
    const humans = [grandmother, mother, baby];
    const homes = [
      building(10, BuildingType.House, { occupants: [1, 2, 3] }),
      building(11, BuildingType.House),
    ];

    assignMissingResidences(humans, homes);

    expect(mother.residenceBuildingId).toBe(baby.residenceBuildingId);
    expect(mother.residenceBuildingId).toBe(11);
    expect(grandmother.residenceBuildingId).toBe(10);
    assignMissingResidences(humans, homes);
    expect(mother.residenceBuildingId).toBe(baby.residenceBuildingId);
  });
});
