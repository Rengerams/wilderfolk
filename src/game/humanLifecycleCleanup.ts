import { recordWarPrisonerOutcome } from './warPrisonerCustody';
import { ensureOrphanAdoption, placeOrphanInHouse, relocateChildToCustodian } from './housingPipeline';
import { moveResident } from './housingPipeline';
import type { Building, Entity, WorldState } from './gameTypes';
import type { GenealogyRegistry } from './genealogyTypes';
import { EntityType } from './gameTypes';
import { isMarriedOrExpecting } from './relationships';
import { logEvent } from './eventLog';
import { recordGenealogyDeath } from './genealogyRegistry';
import { finalizeMoonHowlerDeath, isSettlerRelationshipEntity } from './moonHowlerForm';
import { cleanupEntityDialogueState } from './humanChat';
import { TICKS_PER_DAY } from './dayCycleClock';
import { hasResidenceAssignment } from './housingModel';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { clearWorkerAssignment } from './workforce';
import { syncResidenceOccupants } from './housingPipeline';
import { isResidenceOccupantEntity } from './housingModel';

import { listPlayerResidences } from './housingPipeline';
import { evaluateAptitudeInfluence } from './personality/traitEvaluation';

/** Ordinary spousal mourning before the bereavement activity's bounded modifier. */
const SPOUSAL_GRIEF_DAYS = 7;

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

/** The status a settler holds once the marriage that set it is gone: only a pregnancy keeps `'expecting'`. */
function statusAfterMarriageEnd(entity: Pick<Entity, 'pregnant'>): 'single' | 'expecting' {
  return entity.pregnant ? 'expecting' : 'single';
}

/** Clear building assignments when a human dies (work, home, prison). */
export function finalizeHumanDeath(
  entity: Entity,
  buildings: Building[],
  entityById?: ReadonlyMap<number, Entity>,
  /** World tick for the partner grief window. */
  tick?: number,
): void {
  const partnerId = entity.partnerId;
  const affairPartnerId = entity.affairPartnerId;
  // A dying settler can be mid-dialogue: pass the live-entity lookup so the other half of the pair is
  // released with the death instead of holding an orphaned session key. Optional in `humanChat`.
  const resolveDialoguePartner = entityById
    ? (id: number): Entity | undefined => entityById.get(id)
    : undefined;

  removeHumanFromBuildingOccupants(entity, buildings);
  clearWorkerAssignment(entity);
  moveResident(entity, undefined, 'death', { buildings });
  entity.prisonBuildingId = undefined;
  entity.prisonerUntilTick = undefined;
  entity.prisonSentenceCrime = undefined;

  if (isMarriedOrExpecting(entity)) {
    entity.relationshipStatus = statusAfterMarriageEnd(entity);
  }
  entity.partnerId = undefined;
  entity.affairPartnerId = undefined;
  entity.affairProgress = 0;
 // A courtship ends with the settler: the link and its progress are a pair bond, so the
  // dying side keeps neither and the survivor's half is cleared by the reference sweep below.
  entity.courtshipPartnerId = undefined;
  entity.courtshipProgress = 0;
  entity.lastAffairSiteDay = undefined;
  entity.lastAffairSiteX = undefined;
  entity.lastAffairSiteY = undefined;
  // Youth love is mutual-only: a dying sweetheart must not leave its own half link behind
  // (the survivor's half is cleared in reconcileFamilyReferencesAfterRemoval).
  entity.youthLovePartnerId = undefined;
  entity.youthLoveProgress = undefined;
  entity.youthLoveStartedDay = undefined;

  if (entityById) {
    if (partnerId != null) {
      const partner = entityById.get(partnerId);
      if (partner?.alive) {
        partner.partnerId = undefined;
        // A father's `'expecting'` is the dead partner's pregnancy — nothing will ever clear it, and
        // courtship refuses anything but `'single'`, so the widow or widower would never marry again.
        if (isMarriedOrExpecting(partner)) {
          partner.relationshipStatus = statusAfterMarriageEnd(partner);
        }
        // About a week of mourning when we know the tick — a faster recovery shortens it.
        if (tick != null) {
          const griefDays = SPOUSAL_GRIEF_DAYS / evaluateAptitudeInfluence(partner, 'bereavement').factor;
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

  cleanupEntityDialogueState(entity, resolveDialoguePartner);
}

/**
 * After a settler dies, immediately adopt/place minor dependents so they are not
 * stuck under a dead custodian until the next housing assign pass.
 */
function reassignOrphansAfterDeath(
  dead: Entity,
  buildings: Building[],
  entityById: ReadonlyMap<number, Entity>,
  genealogy?: GenealogyRegistry,
): void {
  const residences = listPlayerResidences(buildings);
  if (residences.length === 0) return;

  const humans = [...entityById.values(), dead].filter(
    // The residence-mirror owner's predicate: a cursed settler temporarily in Moon Howler form is
    // still a residence occupant, and filtering them out would wipe the residence they hold.
    (h) => h === dead || isResidenceOccupantEntity(h),
  );
  const deadId = dead.id;
  let touched = false;

  for (const child of humans) {
    if (child.age >= HUMAN_ADULT_MIN_AGE || child.partnerId != null) continue;
    const related =
      child.motherId === deadId
      || child.fatherId === deadId
      || child.adoptiveMotherId === deadId
      || child.adoptiveFatherId === deadId
      || (dead.childrenIds?.includes(child.id) ?? false);
    if (!related) continue;

    // A deceased village leader's family retains the official residence until succession settles;
    // orphan adoption must not relocate a minor who already lives there.
    const livesInLeaderHouse = residences.some(
      (residence) => residence.id === child.residenceBuildingId && residence.type === 'leaderHouse',
    );
    ensureOrphanAdoption(child, humans, residences, undefined, undefined, genealogy);
    if (livesInLeaderHouse) continue;
    if (relocateChildToCustodian(child, humans, residences)) {
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
  state?: WorldState,
): void {
  for (const survivor of entityById.values()) {
    if (!survivor.alive) continue;
    if (survivor.partnerId === removedId) {
      survivor.partnerId = undefined;
      if (isMarriedOrExpecting(survivor)) {
        survivor.relationshipStatus = statusAfterMarriageEnd(survivor);
      }
    }
    if (survivor.affairPartnerId === removedId) {
      survivor.affairPartnerId = undefined;
      survivor.affairProgress = 0;
      survivor.lastAffairSiteDay = undefined;
      survivor.lastAffairSiteX = undefined;
      survivor.lastAffairSiteY = undefined;
    }
    // A courtship is a mutual pair bond: the survivor's half must go with the removed settler, or the
    // heart badge and the pair's progress outlive the partner.
    if (survivor.courtshipPartnerId === removedId) {
      survivor.courtshipPartnerId = undefined;
      survivor.courtshipProgress = 0;
    }
    if (survivor.pregnantById === removedId) survivor.pregnantById = undefined;
    // A youth-love link joins two living settlers. Reconciliation runs before most daily deaths, so
    // the survivor's half must be cleared here or it points at a pruned settler until the next day.
    if (survivor.youthLovePartnerId === removedId) {
      survivor.youthLovePartnerId = undefined;
      survivor.youthLoveProgress = undefined;
      survivor.youthLoveStartedDay = undefined;
    }
    // Release a tamed animal whose owner died: nothing else clears `tamedBy`, and `isValidHuntPrey`
    // refuses tamed prey, so the orphan would stay on the daily ration list forever.
    if (survivor.tamedBy === removedId) {
      survivor.tamedBy = undefined;
      if (state) {
        logEvent(state, 'migration', `A tamed ${survivor.type} returned to the wild after its owner died.`);
      }
    }
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
  state?: WorldState,
): void {
  if (!entity.alive || !isKillableSettlerEntity(entity)) return;
  if (state) {
    recordGenealogyDeath(state, entity);
    if (entity.warCaptive && !state.raidPrisonerHistory?.some((record) => record.entityId === entity.id && record.status === 'executed')) {
      recordWarPrisonerOutcome(state, entity, 'died');
    }
  }
  entity.alive = false;
  // The office is vacant on death; the manor keeps the family until the election.
  if (state && state.villageLeaderId === entity.id) state.villageLeaderId = null;
  if (entityById instanceof Map) entityById.delete(entity.id);
  finalizeMoonHowlerDeath(entity);
  finalizeHumanDeath(entity, buildings, entityById, tick);
  if (entityById) reconcileFamilyReferencesAfterRemoval(entity.id, entityById, state);
  // entityById is required so we can walk living settlers for adoption/housing.
  if (entityById) reassignOrphansAfterDeath(entity, buildings, entityById, state?.genealogyRegistry);
}

/**
 * Clear marriage links when the partner row was removed from the alive list. Runs after dead entities
 * are pruned — the safety net when widow cleanup missed a death path.
 */
export function reconcileOrphanedMarriages(entities: readonly Entity[]): void {
  const byId = new Map<number, Entity>();
  // Index only entities that can be somebody's partner: `isSettlerRelationshipEntity` is false for
  // every other type, and indexing them all built a ~900-entry Map each tick to look up a few ids.
  for (const entity of entities) {
    if (isSettlerRelationshipEntity(entity)) byId.set(entity.id, entity);
  }
  for (const human of entities) {
    if (!human.alive || human.type !== EntityType.Human) continue;
    // Any spouse id naming a pruned entity is corruption, whatever the status says; a status that
    // names a marriage cannot outlive the partner it names either (a father's `'expecting'` is
    // cleared only by his partner's pregnancy, so nothing else would ever free him).
    const partner = human.partnerId != null ? byId.get(human.partnerId) : undefined;
    if (partner?.alive && isSettlerRelationshipEntity(partner)) continue;
    if (human.partnerId != null) human.partnerId = undefined;
    if (isMarriedOrExpecting(human)) human.relationshipStatus = statusAfterMarriageEnd(human);
  }
}
