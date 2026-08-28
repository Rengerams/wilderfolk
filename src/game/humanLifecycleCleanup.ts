import type { Building, Entity } from './gameTypes';
import { EntityType } from './gameTypes';
import { finalizeMoonHowlerDeath } from './moonHowler';
import { cleanupEntityDialogueState } from './humanChat';
import { TICKS_PER_DAY } from './dayCycleClock';
import {
  ensureOrphanAdoption,
  hasResidenceAssignment,
  isMinorChild,
  listPlayerResidences,
  pickResidenceFromChildCustodian,
  placeOrphanInHouse,
  syncResidenceOccupants,
} from './residency';

/** Player settler eligible for human death cleanup (human or cursed full-moon werewolf form). */
export function isKillableSettlerEntity(entity: Entity): boolean {
  return (
    entity.type === EntityType.Human
    || (entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed)
  );
}

/** Remove a dead or evicted settler from every building occupant list. */
export function removeHumanFromBuildingOccupants(entity: Entity, buildings: Building[]): void {
  if (!isKillableSettlerEntity(entity)) return;
  for (const building of buildings) {
    if (building.occupants.includes(entity.id)) {
      building.occupants = building.occupants.filter((id) => id !== entity.id);
    }
  }
}

/** Clear building assignments when a human dies (work, home, prison). */
export function finalizeHumanDeath(
  entity: Entity,
  buildings: Building[],
  entityById?: ReadonlyMap<number, Entity>,
  /** Current world tick — used to set partner grief window. */
  tick?: number,
): void {
  const partnerId = entity.partnerId;
  const affairPartnerId = entity.affairPartnerId;

  removeHumanFromBuildingOccupants(entity, buildings);
  entity.homeBuildingId = undefined;
  entity.residenceBuildingId = undefined;
  entity.prisonBuildingId = undefined;
  entity.prisonerUntilTick = undefined;
  entity.prisonSentenceCrime = undefined;

  if (entity.relationshipStatus === 'married') {
    entity.relationshipStatus = entity.pregnant ? 'expecting' : 'single';
  }
  entity.partnerId = undefined;
  entity.affairPartnerId = undefined;
  entity.affairProgress = 0;
  entity.lastAffairSiteDay = undefined;
  entity.lastAffairSiteX = undefined;
  entity.lastAffairSiteY = undefined;

  if (entityById) {
    if (partnerId != null) {
      const partner = entityById.get(partnerId);
      if (partner?.alive) {
        partner.partnerId = undefined;
        if (partner.relationshipStatus === 'married') {
          partner.relationshipStatus = partner.pregnant ? 'expecting' : 'single';
        }
        // About a week of mourning when we know the tick — stoic settlers recover sooner.
        if (tick != null) {
          const griefDays = partner.traits?.includes('stoic') ? 5 : 7;
          partner.griefUntilTick = Math.max(partner.griefUntilTick ?? 0, tick + TICKS_PER_DAY * griefDays);
        }
        if (partner.moonHowlerSaved?.partnerId === entity.id) {
          partner.moonHowlerSaved.partnerId = undefined;
        }
      }
    }
    if (affairPartnerId != null) {
      const lover = entityById.get(affairPartnerId);
      if (lover?.alive) {
        lover.affairPartnerId = undefined;
        lover.affairProgress = 0;
        lover.lastAffairSiteDay = undefined;
        lover.lastAffairSiteX = undefined;
        lover.lastAffairSiteY = undefined;
        if (tick != null) {
          // Soft grief for a secret lover — shorter than a spouse
          lover.griefUntilTick = Math.max(lover.griefUntilTick ?? 0, tick + TICKS_PER_DAY * 3);
        }
        if (lover.moonHowlerSaved?.affairPartnerId === entity.id) {
          lover.moonHowlerSaved.affairPartnerId = undefined;
          lover.moonHowlerSaved.affairProgress = 0;
        }
      }
    }
  }

  cleanupEntityDialogueState(entity);
}

/**
 * After a settler dies, immediately adopt/place minor dependents so they are not
 * stuck under a dead custodian until the next housing assign pass (EK-E9).
 */
function reassignOrphansAfterDeath(
  dead: Entity,
  buildings: Building[],
  entityById: ReadonlyMap<number, Entity>,
): void {
  const residences = listPlayerResidences(buildings);
  if (residences.length === 0) return;

  const humans = [...entityById.values()].filter(
    (h) => h.alive && !h.faction && h.type === EntityType.Human,
  );
  const deadId = dead.id;
  let touched = false;

  for (const child of humans) {
    if (!isMinorChild(child)) continue;
    const related =
      child.motherId === deadId
      || child.fatherId === deadId
      || child.adoptiveMotherId === deadId
      || child.adoptiveFatherId === deadId
      || (dead.childrenIds?.includes(child.id) ?? false);
    if (!related) continue;

    ensureOrphanAdoption(child, humans, residences);
    const home = pickResidenceFromChildCustodian(child, humans, residences);
    if (home !== undefined) {
      child.residenceBuildingId = home;
      touched = true;
    } else if (!hasResidenceAssignment(child)) {
      if (placeOrphanInHouse(child, humans, residences)) touched = true;
    }
  }

  if (touched) syncResidenceOccupants(humans, buildings);
}

/** Remove references to a permanently removed settler from all surviving entities. */
export function reconcileFamilyReferencesAfterRemoval(
  removedId: number,
  entityById: ReadonlyMap<number, Entity>,
): void {
  for (const survivor of entityById.values()) {
    if (!survivor.alive) continue;
    if (survivor.partnerId === removedId) {
      survivor.partnerId = undefined;
      if (survivor.relationshipStatus === 'married') {
        survivor.relationshipStatus = survivor.pregnant ? 'expecting' : 'single';
      }
    }
    if (survivor.affairPartnerId === removedId) {
      survivor.affairPartnerId = undefined;
      survivor.affairProgress = 0;
      survivor.lastAffairSiteDay = undefined;
      survivor.lastAffairSiteX = undefined;
      survivor.lastAffairSiteY = undefined;
    }
    if (survivor.pregnantById === removedId) survivor.pregnantById = undefined;
    if (survivor.childrenIds?.includes(removedId)) {
      survivor.childrenIds = survivor.childrenIds.filter((id) => id !== removedId);
    }
  }
}

/** Mark a settler dead and run all death cleanup (buildings, spouse widowing). */
export function killHuman(
  entity: Entity,
  buildings: Building[],
  entityById?: ReadonlyMap<number, Entity>,
  tick?: number,
): void {
  if (!entity.alive || !isKillableSettlerEntity(entity)) return;
  entity.alive = false;
  if (entityById instanceof Map) entityById.delete(entity.id);
  finalizeMoonHowlerDeath(entity);
  finalizeHumanDeath(entity, buildings, entityById, tick);
  if (entityById) reconcileFamilyReferencesAfterRemoval(entity.id, entityById);
  // entityById is required so we can walk living settlers for adoption/housing.
  if (entityById) reassignOrphansAfterDeath(entity, buildings, entityById);
}

/** Human settler or cursed villager in werewolf form — valid marriage partner for lookups. */
function isLivingMarriagePartner(entity: Entity | undefined): boolean {
  if (!entity?.alive) return false;
  if (entity.type === EntityType.Human) return true;
  return entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
}

/**
 * Clear marriage links when the partner row was removed from the alive list.
 * Runs after dead entities are pruned — safety net when widow cleanup missed a death path.
 */
export function reconcileOrphanedMarriages(entities: readonly Entity[]): void {
  const byId = new Map<number, Entity>();
  for (const entity of entities) byId.set(entity.id, entity);
  for (const human of entities) {
    if (!human.alive || human.type !== EntityType.Human) continue;
    if (human.partnerId == null || human.relationshipStatus !== 'married') continue;
    if (!isLivingMarriagePartner(byId.get(human.partnerId))) {
      human.partnerId = undefined;
      human.relationshipStatus = human.pregnant ? 'expecting' : 'single';
    }
  }
}
