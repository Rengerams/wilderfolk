import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import { human, building } from '../src/test/factories';
import { getChildCustodian } from '../src/game/householdComposition';
import { reassignDivorcedResidences } from '../src/game/residencyReconciliation';

describe('divorce custody and housing', () => {
  it('makes one stable custody selection for siblings regardless of lookup order', () => {
    const mother = human(1, { gender: 'female', pastPartnerTicks: { 2: 1201 } });
    const father = human(2, { gender: 'male', pastPartnerTicks: { 1: 1201 } });
    const first = human(3, { age: 5, isJuvenile: true, motherId: 1, fatherId: 2 });
    const second = human(4, { age: 8, isJuvenile: true, motherId: 1, fatherId: 2 });
    const people = [mother, father, first, second];
    const selected = getChildCustodian(first, people);
    expect(selected).toBeDefined();
    expect(getChildCustodian(second, [...people].reverse())?.id).toBe(selected?.id);
    expect(getChildCustodian(first, people)?.id).toBe(selected?.id);
  });

  it('also selects the father for the alternate divorce outcome', () => {
    const mother = human(1, { gender: 'female', pastPartnerTicks: { 2: 1200 } });
    const father = human(2, { gender: 'male', pastPartnerTicks: { 1: 1200 } });
    const first = human(3, { age: 5, isJuvenile: true, motherId: 1, fatherId: 2 });
    const second = human(4, { age: 8, isJuvenile: true, motherId: 1, fatherId: 2 });
    const people = [mother, father, first, second];
    expect(getChildCustodian(first, people)?.id).toBe(father.id);
    expect(getChildCustodian(second, people)?.id).toBe(father.id);
  });

  it('moves the departing parent with assigned minor children to the farthest fitting home', () => {
    const home = building(10, BuildingType.House, { x: 0, y: 0 });
    const near = building(20, BuildingType.Mansion, { x: 40, y: 0, level: 3 });
    const far = building(30, BuildingType.Mansion, { x: 150, y: 0, level: 3 });
    const mother = human(1, { gender: 'female', residenceBuildingId: 10, pastPartnerTicks: { 2: 1201 } });
    const father = human(2, { gender: 'male', residenceBuildingId: 10, pastPartnerTicks: { 1: 1201 } });
    const first = human(3, { age: 5, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const second = human(4, { age: 8, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const people = [mother, father, first, second];
    reassignDivorcedResidences(mother, father, [home, near, far], people, father);
    expect(father.residenceBuildingId).toBe(10);
    expect(mother.residenceBuildingId).toBe(30);
    expect(first.residenceBuildingId).toBe(getChildCustodian(first, people)?.residenceBuildingId);
    expect(second.residenceBuildingId).toBe(getChildCustodian(second, people)?.residenceBuildingId);
  });
  it('reshuffles a whole independent household to free enough beds for a parent', () => {
    const oldHome = building(10, BuildingType.House, { x: 0, y: 0 });
    const occupied = building(20, BuildingType.House, { x: 150, y: 0 });
    const spare = building(30, BuildingType.House, { x: 40, y: 0 });
    const mother = human(1, { gender: 'female', residenceBuildingId: 10, pastPartnerTicks: { 2: 1201 } });
    const father = human(2, { gender: 'male', residenceBuildingId: 10, pastPartnerTicks: { 1: 1201 } });
    const first = human(3, { age: 5, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const second = human(4, { age: 8, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const occupant = human(5, { age: 30, partnerId: 6, residenceBuildingId: 20 });
    const spouse = human(6, { age: 30, partnerId: 5, residenceBuildingId: 20 });
    const people = [mother, father, first, second, occupant, spouse];
    reassignDivorcedResidences(mother, father, [oldHome, occupied, spare], people, father);
    expect(occupant.residenceBuildingId).toBe(30);
    expect(spouse.residenceBuildingId).toBe(30);
    expect(mother.residenceBuildingId).toBe(20);
    expect(first.residenceBuildingId).toBe(getChildCustodian(first, people)?.residenceBuildingId);
    expect(second.residenceBuildingId).toBe(getChildCustodian(second, people)?.residenceBuildingId);
  });

});
