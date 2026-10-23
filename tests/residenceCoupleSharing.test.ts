/**
 * A couple does not live with another, unrelated couple. With no home of its own free, it stays with
 * its own family instead, and a lone settler keeps to a singles' house. Capacity, shortage and manor
 * rules are pinned elsewhere; only the pairing preference is asserted here.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import {
  buildHousingUnits,
  housingUnitNeedsReassignment,
  pickResidenceForFamily,
} from '../src/game/residencySelection';

/** A completed House through the production factory — no hand-built Building literal. */
function residence(id: number): Building {
  const house = createBuilding(BuildingType.House, 400, 400, id);
  house.completed = true;
  return house;
}

function adult(id: number, overrides: Partial<Entity> = {}): Entity {
  const human = createEntity(EntityType.Human, 400, 400, id, 200, false, { ageYears: 30 });
  return Object.assign(human, overrides);
}

function unitOf(humans: Entity[], memberId: number): Entity[] {
  const unit = buildHousingUnits(humans).find((candidate) => candidate.some((m) => m.id === memberId));
  if (!unit) throw new Error(`no housing unit holds settler ${memberId}`);
  return unit;
}

describe('a couple never shares its house with another couple', () => {
  it('moves out of a shared house into the home of its own family', () => {
    const shared = residence(1);
    const familyHome = residence(2);

    const strangerA = adult(10, { partnerId: 11, residenceBuildingId: 1 });
    const strangerB = adult(11, { partnerId: 10, residenceBuildingId: 1 });
    const parent = adult(20, { partnerId: 21, residenceBuildingId: 2 });
    const otherParent = adult(21, { partnerId: 20, residenceBuildingId: 2 });
    // The couple lives in a full house with an unrelated couple; one partner's parents have room.
    const spouse = adult(12, { partnerId: 13, motherId: 21, fatherId: 20, residenceBuildingId: 1 });
    const subject = adult(13, { partnerId: 12, residenceBuildingId: 1 });

    const humans = [strangerA, strangerB, parent, otherParent, spouse, subject];
    const residences = [shared, familyHome];
    const unit = unitOf(humans, subject.id);

    expect(unit.map((m) => m.id).sort((a, b) => a - b)).toEqual([12, 13]);
    expect(housingUnitNeedsReassignment(unit, humans, residences)).toBe(true);
    expect(pickResidenceForFamily(unit, humans, residences)).toBe(familyHome.id);
  });

  it('leaves a couple living with its own parents where it is', () => {
    const parentsHome = residence(1);
    const strangersHome = residence(2);

    const parent = adult(20, { partnerId: 21, residenceBuildingId: 1 });
    const otherParent = adult(21, { partnerId: 20, residenceBuildingId: 1 });
    const spouse = adult(12, { partnerId: 13, motherId: 21, fatherId: 20, residenceBuildingId: 1 });
    const subject = adult(13, { partnerId: 12, motherId: 21, fatherId: 20, residenceBuildingId: 1 });
    // No empty house anywhere: only the pairing preference can be asked to move this couple.
    const strangers = [30, 31, 32, 33].map((id) => adult(id, { residenceBuildingId: 2 }));

    const humans = [parent, otherParent, spouse, subject, ...strangers];
    const unit = unitOf(humans, subject.id);

    expect(housingUnitNeedsReassignment(unit, humans, [parentsHome, strangersHome])).toBe(false);
  });

  it('prefers the family home over a house of unrelated singles', () => {
    const familyHome = residence(1);
    const singlesHome = residence(2);

    const parent = adult(20, { partnerId: 21, residenceBuildingId: 1 });
    const otherParent = adult(21, { partnerId: 20, residenceBuildingId: 1 });
    const singleA = adult(30, { residenceBuildingId: 2 });
    const singleB = adult(31, { residenceBuildingId: 2 });
    const spouse = adult(12, { partnerId: 13, motherId: 21, fatherId: 20 });
    const subject = adult(13, { partnerId: 12 });

    const humans = [parent, otherParent, singleA, singleB, spouse, subject];
    const unit = unitOf(humans, subject.id);

    expect(pickResidenceForFamily(unit, humans, [familyHome, singlesHome])).toBe(familyHome.id);
  });
});

describe('singles keep to a singles house', () => {
  it('moves a lone settler out of a couple’s house into an open singles’ house', () => {
    const coupleHome = residence(1);
    const singlesHome = residence(2);

    const partnerA = adult(10, { partnerId: 11, residenceBuildingId: 1 });
    const partnerB = adult(11, { partnerId: 10, residenceBuildingId: 1 });
    const lone = adult(12, { residenceBuildingId: 1 });
    const singleA = adult(20, { residenceBuildingId: 2 });
    const singleB = adult(21, { residenceBuildingId: 2 });

    const humans = [partnerA, partnerB, lone, singleA, singleB];
    const unit = unitOf(humans, lone.id);
    const residences = [coupleHome, singlesHome];

    expect(unit.map((m) => m.id)).toEqual([12]);
    expect(housingUnitNeedsReassignment(unit, humans, residences)).toBe(true);
    expect(pickResidenceForFamily(unit, humans, residences)).toBe(singlesHome.id);
  });
});
