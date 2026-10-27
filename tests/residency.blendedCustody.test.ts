import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { assignMissingResidences } from '../src/game/residencyReconciliation';
import { getResidenceCapacity } from '../src/game/residencyOccupancy';

function person(id: number, overrides: Partial<Entity> = {}): Entity {
  const entity = createEntity(EntityType.Human, 400, 400, id, 200);
  return Object.assign(entity, {
    alive: true, age: 30, isJuvenile: false, partnerId: undefined,
    fatherId: undefined, motherId: undefined, residenceBuildingId: undefined,
    childrenIds: [], faction: undefined,
  }, overrides);
}

describe('blended household split', () => {
  it('seats children with their own custodian rather than the first child\'s mother', () => {
    const first = createBuilding(BuildingType.House, 400, 400, 1);
    const second = createBuilding(BuildingType.House, 600, 400, 2);
    first.completed = true;
    second.completed = true;

    const mother = person(10, { partnerId: 11, childrenIds: [20, 21, 22] });
    const father = person(11, { partnerId: 10, childrenIds: [23, 24] });
    const children = [
      person(20, { age: 6, isJuvenile: true, motherId: 10 }),
      person(21, { age: 7, isJuvenile: true, motherId: 10 }),
      person(22, { age: 8, isJuvenile: true, motherId: 10 }),
      person(23, { age: 9, isJuvenile: true, fatherId: 11, motherId: 99 }),
      person(24, { age: 10, isJuvenile: true, fatherId: 11, motherId: 99 }),
    ];
    const residents = [mother, father, ...children];

    assignMissingResidences(residents, [first, second]);
    for (const child of children.slice(0, 3)) {
      expect(child.residenceBuildingId).toBe(mother.residenceBuildingId);
    }
    for (const child of children.slice(3)) {
      expect(child.residenceBuildingId).toBe(father.residenceBuildingId);
    }
    expect(mother.residenceBuildingId).toBeDefined();
    expect(father.residenceBuildingId).toBeDefined();
    for (const home of [first, second]) {
      expect(residents.filter((entity) => entity.residenceBuildingId === home.id).length)
        .toBeLessThanOrEqual(getResidenceCapacity(home));
    }
    const again = assignMissingResidences(residents, [first, second]);
    expect(again.violations.filter((violation) => violation.includes('custod'))).toEqual([]);
  });
});
