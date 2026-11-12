/**
 * S-17 / W-70: an oversized custodian group is split across residences instead of staying homeless,
 * the custodian keeps the youngest children, and a colony without a bed keeps the shortage named.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import {
  assignMissingResidences,
  collectFamilyHousingShortages,
} from '../src/game/housingPipeline';
import { buildResidenceOccupancy, getResidenceCapacity } from '../src/game/housingModel';

const GUARDIAN_ID = 1;
const FIRST_CHILD_ID = 10;

/** A custodian and their minor children — one housing unit by the owner's composition rule. */
function guardianUnit(childAges: number[]): Entity[] {
  const guardian = human(GUARDIAN_ID, { age: 34 });
  const children = childAges.map((age, index) => human(FIRST_CHILD_ID + index, {
    age, isJuvenile: true, motherId: guardian.id,
  }));
  guardian.childrenIds = children.map((child) => child.id);
  return [guardian, ...children];
}

/** A couple and their minor children — one housing unit including the other adult. */
function familyUnit(childAges: number[]): Entity[] {
  const mother = human(GUARDIAN_ID, { age: 34 });
  const father = human(2, { age: 36, partnerId: mother.id });
  mother.partnerId = father.id;
  const children = childAges.map((age, index) => human(FIRST_CHILD_ID + index, {
    age, isJuvenile: true, motherId: mother.id, fatherId: father.id,
  }));
  mother.childrenIds = children.map((child) => child.id);
  father.childrenIds = [...mother.childrenIds];
  return [mother, father, ...children];
}

function expectHoused(unit: Entity[]): void {
  for (const member of unit) expect(member.residenceBuildingId, `settler #${member.id}`).toBeDefined();
}

function expectWithinCapacity(humans: Entity[], homes: Building[]): void {
  const occupancy = buildResidenceOccupancy(humans);
  for (const home of homes) {
    expect(occupancy.get(home.id) ?? 0, `home #${home.id}`).toBeLessThanOrEqual(getResidenceCapacity(home));
  }
}

describe('an oversized custodian group splits across homes', () => {
  it.each([
    { children: 6, main: BuildingType.House, spare: BuildingType.House },
    { children: 8, main: BuildingType.Mansion, spare: BuildingType.House },
    { children: 14, main: BuildingType.Villa, spare: BuildingType.House },
  ])('seats a guardian and $children children beside free $spare beds', ({ children, main, spare }) => {
    const unit = guardianUnit(Array.from({ length: children }, (_, index) => 2 + index));
    const homes = [building(100, main), building(101, spare)];

    const report = assignMissingResidences(unit, homes, unit);

    expectHoused(unit);
    expectWithinCapacity(unit, homes);
    expect(report.violations).toEqual([]);
    const guardian = unit[0];
    const youngest = unit[1];
    expect(youngest.residenceBuildingId, 'the youngest child stays with the custodian')
      .toBe(guardian.residenceBuildingId);
    expect(unit.some((member) => member.residenceBuildingId !== guardian.residenceBuildingId),
      'the group is too large for one home, so an older child takes a second bed').toBe(true);
    // The necessary split is a settled state: a second pulse moves nobody and changes no bed.
    const before = unit.map((member) => member.residenceBuildingId);
    expect(assignMissingResidences(unit, homes, unit).relocations).toEqual([]);
    expect(unit.map((member) => member.residenceBuildingId)).toEqual(before);
  });

  it('keeps the shortage named instead of splitting illegally when every bed is taken', () => {
    const unit = guardianUnit([2, 4, 6, 8, 10, 12]);
    const tenants = Array.from({ length: 12 }, (_, index) =>
      human(200 + index, { residenceBuildingId: index < 6 ? 300 : 301 }));
    const homes = [building(300, BuildingType.House), building(301, BuildingType.House)];
    const humans = [...tenants, ...unit];

    const report = assignMissingResidences(humans, homes, humans);

    // No bed exists, so no child is moved apart: the whole unit waits and the warning stays.
    expect(unit.every((member) => member.residenceBuildingId == null)).toBe(true);
    expectWithinCapacity(humans, homes);
    expect(report.violations).toEqual([]);
    expect(collectFamilyHousingShortages(humans, homes)).toHaveLength(1);
  });
});

describe('the over-capacity repair does not split a family unnecessarily', () => {
  it('moves the whole family into a home that fits every member', () => {
    const family = familyUnit([2, 4, 6, 8, 10]);
    const home = building(400, BuildingType.House);
    const mansion = building(401, BuildingType.Mansion);
    for (const member of family) member.residenceBuildingId = home.id;

    assignMissingResidences(family, [home, mansion], family);

    expect(family.every((member) => member.residenceBuildingId === mansion.id)).toBe(true);
    expectWithinCapacity(family, [home, mansion]);
    expect(collectFamilyHousingShortages(family, [home, mansion])).toEqual([]);
  });

  it('seats a homeless family with the other adult beside the children, not alone', () => {
    const family = familyUnit([2, 4, 6, 8, 10, 12]);
    const homes = [building(500, BuildingType.House), building(501, BuildingType.House)];

    const report = assignMissingResidences(family, homes, family);

    expectHoused(family);
    expectWithinCapacity(family, homes);
    expect(report.violations).toEqual([]);
    const mother = family[0];
    const father = family[1];
    expect(family[2].residenceBuildingId).toBe(mother.residenceBuildingId);
    const fatherHomeOccupants = family.filter((member) => member.residenceBuildingId === father.residenceBuildingId);
    expect(fatherHomeOccupants.length).toBeGreaterThan(1);
  });

  it('splits only the older children instead of evicting the group and seating the father alone', () => {
    const family = familyUnit([2, 4, 6, 8, 10, 12]);
    const home = building(400, BuildingType.House);
    const spare = building(401, BuildingType.House);
    for (const member of family) member.residenceBuildingId = home.id;

    const report = assignMissingResidences(family, [home, spare], family);

    expectHoused(family);
    expectWithinCapacity(family, [home, spare]);
    expect(report.violations).toEqual([]);
    const mother = family[0];
    const father = family[1];
    const youngest = family[2];
    expect(youngest.residenceBuildingId, 'the youngest child stays with the custodian')
      .toBe(mother.residenceBuildingId);
    // W-70: the other adult keeps a family bed instead of being seated alone in the emptied home.
    const fatherHomeOccupants = family.filter((member) => member.residenceBuildingId === father.residenceBuildingId);
    expect(fatherHomeOccupants.length).toBeGreaterThan(1);
  });

  it('keeps the whole household together when no other bed exists', () => {
    const family = familyUnit([2, 4, 6, 8, 10, 12]);
    const home = building(400, BuildingType.House);
    for (const member of family) member.residenceBuildingId = home.id;

    const report = assignMissingResidences(family, [home], family);

    // No destination exists: the family stays one unit and is unhoused together rather than
    // leaving the father alone in a house with free beds while the custodian group sleeps rough.
    expect(new Set(family.map((member) => member.residenceBuildingId)).size).toBe(1);
    expect(family.every((member) => member.residenceBuildingId == null)).toBe(true);
    expectWithinCapacity(family, [home]);
    expect(report.violations).toEqual([]);
  });
});
