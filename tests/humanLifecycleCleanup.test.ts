import { describe, expect, it } from 'vitest';
import {
  finalizeHumanDeath,
  killHuman,
  reconcileFamilyReferencesAfterRemoval,
  reconcileOrphanedMarriages,
  removeHumanFromBuildingOccupants,
} from '../src/game/dayCycle';
import {
  finalizeHumanDeath as extractedFinalizeHumanDeath,
  killHuman as extractedKillHuman,
  reconcileFamilyReferencesAfterRemoval as extractedReconcileFamilyReferencesAfterRemoval,
  reconcileOrphanedMarriages as extractedReconcileOrphanedMarriages,
  removeHumanFromBuildingOccupants as extractedRemoveHumanFromBuildingOccupants,
} from '../src/game/humanLifecycleCleanup';
import { BuildingType, EntityType, type Building, type Entity } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    alive: true,
    age: 28,
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

function house(occupants: number[]): Building {
  return {
    id: 10,
    type: BuildingType.House,
    completed: true,
    occupants,
  } as Building;
}

describe('human lifecycle cleanup compatibility facade', () => {
  it('keeps established dayCycle lifecycle APIs connected to the extracted owner', () => {
    expect(killHuman).toBe(extractedKillHuman);
    expect(finalizeHumanDeath).toBe(extractedFinalizeHumanDeath);
    expect(removeHumanFromBuildingOccupants).toBe(extractedRemoveHumanFromBuildingOccupants);
    expect(reconcileFamilyReferencesAfterRemoval).toBe(extractedReconcileFamilyReferencesAfterRemoval);
    expect(reconcileOrphanedMarriages).toBe(extractedReconcileOrphanedMarriages);
  });

  it('preserves death cleanup, spouse and affair grief, links, and building occupants', () => {
    const deceased = human(1, {
      homeBuildingId: 10,
      residenceBuildingId: 10,
      partnerId: 2,
      relationshipStatus: 'married',
      affairPartnerId: 3,
      affairProgress: 42,
      lastAffairSiteDay: 9,
    });
    const spouse = human(2, {
      partnerId: 1,
      relationshipStatus: 'married',
      traits: ['stoic'],
      moonHowlerSaved: { partnerId: 1 },
    });
    const lover = human(3, {
      affairPartnerId: 1,
      affairProgress: 17,
      lastAffairSiteDay: 9,
      moonHowlerSaved: { affairPartnerId: 1, affairProgress: 17 },
    });
    const building = house([1, 2]);
    const byId = new Map<number, Entity>([
      [deceased.id, deceased],
      [spouse.id, spouse],
      [lover.id, lover],
    ]);
    const tick = TICKS_PER_DAY * 20;

    killHuman(deceased, [building], byId, tick);

    expect(deceased.alive).toBe(false);
    expect(deceased.homeBuildingId).toBeUndefined();
    expect(deceased.residenceBuildingId).toBeUndefined();
    expect(deceased.partnerId).toBeUndefined();
    expect(deceased.affairPartnerId).toBeUndefined();
    expect(building.occupants).toEqual([spouse.id]);
    expect(byId.has(deceased.id)).toBe(false);

    expect(spouse.partnerId).toBeUndefined();
    expect(spouse.relationshipStatus).toBe('single');
    expect(spouse.griefUntilTick).toBe(tick + TICKS_PER_DAY * 5);
    expect(spouse.moonHowlerSaved?.partnerId).toBeUndefined();

    expect(lover.affairPartnerId).toBeUndefined();
    expect(lover.affairProgress).toBe(0);
    expect(lover.griefUntilTick).toBe(tick + TICKS_PER_DAY * 3);
    expect(lover.moonHowlerSaved?.affairPartnerId).toBeUndefined();
    expect(lover.moonHowlerSaved?.affairProgress).toBe(0);
  });
});
