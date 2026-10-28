import { recordWarPrisonerOutcome } from './warPrisonerCustody';
import { ensureOrphanAdoption, placeOrphanInHouse, relocateChildToCustodian } from './residencyReconciliation';
import { moveResident } from './residencyReconciliation';
import type { Building, Entity, WorldState } from './gameTypes';
import type { GenealogyRegistry } from './genealogyTypes';
import { EntityType } from './gameTypes';
import { logEvent } from './eventLog';
import { recordGenealogyDeath } from './genealogyRegistry';
import { finalizeMoonHowlerDeath, isSettlerRelationshipEntity } from './moonHowlerForm';
import { cleanupEntityDialogueState } from './humanChat';
import { TICKS_PER_DAY } from './dayCycleClock';
import { isMinorChild } from './householdComposition';
import { hasResidenceAssignment } from './residencyOccupancy';
import { clearWorkerAssignment } from './workforce';
import { isResidenceOccupantEntity, syncResidenceOccupants } from './residencyReconciliation';
import { listPlayerResidences } from './residencySelection';
import { evaluateTraitInfluence } from './personality/traitEvaluation';

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
  /** Current world tick — used to set partner grief window. */
  tick?: number,
): void {
  const partnerId = entity.partnerId;
  const affairPartnerId = entity.affairPartnerId;
  // A dying settler can be mid-dialogue. The live-entity lookup the rest of this function already uses
  // is exactly what `cleanupEntityDialogueState` needs to release the other half of the pair *with* the
  // death, instead of leaving it holding a session key nobody owns until its own tick reclaims it.
  // Present only when the caller passes the entity index, which is why the resolver stays optional in
  // `humanChat`.
  const resolveDialoguePartner = entityById
    ? (id: number): Entity | undefined => entityById.get(id)
    : undefined;

  removeHumanFromBuildingOccupants(entity, buildings);
  clearWorkerAssignment(entity);
  moveResident(entity, undefined, 'death', { buildings });
  entity.prisonBuildingId = undefined;
  entity.prisonerUntilTick = undefined;
  entity.prisonSentenceCrime = undefined;

  if (entity.relationshipStatus === 'married') {
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
        if (partner.relationshipStatus === 'married' || partner.relationshipStatus === 'expecting') {
          partner.relationshipStatus = statusAfterMarriageEnd(partner);
        }
        // About a week of mourning when we know the tick — stoic settlers recover sooner.
        if (tick != null) {
          const griefDays = evaluateTraitInfluence(partner, { kind: 'family', activity: 'bereavement', exact: true }).griefDays ?? 7;
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
 * stuck under a dead custodian until the next housing assign pass (EK-E9).
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
    // The residence-mirror owner's predicate, not a local rule: a cursed settler temporarily in
    // Moon Howler form is still a residence occupant, and filtering them out here would wipe the
    // residence they hold when this sync rebuilds the lists.
    (h) => h === dead || isResidenceOccupantEntity(h),
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

    // A deceased village leader's family retains the official residence until
    // the succession is settled. Do not let orphan adoption relocate a minor
    // who already lives there; general housing reconciliation also protects it.
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
      if (survivor.relationshipStatus === 'married' || survivor.relationshipStatus === 'expecting') {
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
    // A youth-love link joins two living settlers (§5). The daily youth-love reconciliation
    // runs before most daily deaths, so the survivor's half must be cleared here or the
    // collector reports a one-sided link to a pruned settler until the next day.
    if (survivor.youthLovePartnerId === removedId) {
      survivor.youthLovePartnerId = undefined;
      survivor.youthLoveProgress = undefined;
      survivor.youthLoveStartedDay = undefined;
    }
    // Release a tamed animal whose owner just died: nothing else clears `tamedBy` on death and
    // `isValidHuntPrey` refuses tamed prey, so the orphan stayed on the daily ration list forever
    // and could never be hunted.
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
  if (entityById instanceof Map) entityById.delete(entity.id);
  finalizeMoonHowlerDeath(entity);
  finalizeHumanDeath(entity, buildings, entityById, tick);
  if (entityById) reconcileFamilyReferencesAfterRemoval(entity.id, entityById, state);
  // entityById is required so we can walk living settlers for adoption/housing.
  if (entityById) reassignOrphansAfterDeath(entity, buildings, entityById, state?.genealogyRegistry);
}

/**
 * Clear marriage links when the partner row was removed from the alive list.
 * Runs after dead entities are pruned — safety net when widow cleanup missed a death path.
 * The "a cursed settler in Moon Howler form still counts as a partner" rule is owned by
 * `moonHowler.isSettlerRelationshipEntity`; this module reuses it instead of redefining it.
 */
export function reconcileOrphanedMarriages(entities: readonly Entity[]): void {
  const byId = new Map<number, Entity>();
  // Index only the entities that can be somebody's partner. `isSettlerRelationshipEntity` is false
  // for every other type, so below a miss and a hit on grass/tree/wildlife answer identically —
  // while indexing them all built a ~900-entry Map on every tick (gameTick calls this with
  // `allAlive`, grass and trees included) to look up a handful of partner ids.
  for (const entity of entities) {
    if (isSettlerRelationshipEntity(entity)) byId.set(entity.id, entity);
  }
  for (const human of entities) {
    if (!human.alive || human.type !== EntityType.Human) continue;
    // A status that names a marriage cannot outlive the partner it names — including a father's
    // `'expecting'`, which only his partner's pregnancy clears, so nothing would ever free him.
    if (human.relationshipStatus !== 'married' && human.relationshipStatus !== 'expecting') continue;
    const partner = human.partnerId != null ? byId.get(human.partnerId) : undefined;
    if (isSettlerRelationshipEntity(partner)) continue;
    human.partnerId = undefined;
    human.relationshipStatus = statusAfterMarriageEnd(human);
  }
}
