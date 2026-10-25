import { EntityType, LEADER_OCCUPATION, BuildingType } from './gameTypes';
import type { Building, Entity } from './gameTypes';
import type { GenealogyRegistry } from './genealogyTypes';
import type { ResidenceOccupancy } from './residencyOccupancy';
import { collectFamilyMembers, collectMinorHousehold, collectOwnHousehold, indexFamilyRelations, isMinorChild, isAdultChildAtHome, getChildCustodian } from './householdComposition';
import { isResidenceBuilding, isLeaderHouseResidence, getResidenceCapacity, hasResidenceAssignment, buildResidenceOccupancy, occupancyMove, isImprisoned, isResidenceOccupantEntity, residenceRoomFor, countResidentsInBuilding } from './residencyOccupancy';
import { listPlayerResidences, familyFitsInResidence, pickResidenceForHumanExcluding, pickResidenceForFamily, pickResidenceForHuman, pickResidenceFromChildCustodian, buildHousingUnits, housingUnitBucket, housingUnitNeedsReassignment, sortHousingUnitsForAssignment, pickLeastCrowdedResidence, buildResidenceTraits, residenceTraitMove, pickCommuteRelocation, buildCommuteRelocationIndex, MAX_RELOCATIONS_PER_DAY } from './residencySelection';
import type { ResidenceTraitsById } from './residencySelection';
import { beginCommuteRoutePass } from './commuteReach';
import { isPlayerHuman } from './playerHuman';
import { SPECIES_CONFIG } from './speciesConfig';
import { TICKS_PER_DAY } from './dayCycleClock';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';

export type ResidenceMoveReason = 'assignment' | 'family' | 'guardian' | 'commute' | 'leader'
  | 'departure' | 'birth' | 'death' | 'demolition' | 'load' | 'moon-form' | 'divorce' | 'prison' | 'player';

/** The sole residence write; keep pass indexes and any supplied residence rosters consistent. */
export function moveResident(
  human: Entity,
  toId: number | undefined,
  reason: ResidenceMoveReason,
  context: { occupancy?: ResidenceOccupancy; traits?: ResidenceTraitsById; buildings?: Building[] } = {},
): void {
  const fromId = human.residenceBuildingId;
  if (fromId === toId) return;
  const previous = context.buildings?.find((building) => building.id === fromId);
  const target = context.buildings?.find((building) => building.id === toId);
  const ordinaryMove = ['assignment', 'family', 'guardian', 'commute', 'player'].includes(reason);
  if (previous && isLeaderHouseResidence(previous) && ordinaryMove) return;
  if (target && (!isResidenceBuilding(target) || target.faction === 'rival')) return;
  if (target && isLeaderHouseResidence(target) && !['leader', 'birth', 'moon-form'].includes(reason)) return;
  if (context.occupancy) occupancyMove(context.occupancy, fromId, toId);
  if (context.traits) residenceTraitMove(context.traits, human, fromId, toId);
  human.residenceBuildingId = toId;
  if (context.buildings) {
    if (previous && isResidenceBuilding(previous)) previous.occupants = previous.occupants.filter((id) => id !== human.id);
    if (target && isResidenceBuilding(target) && isResidenceOccupantEntity(human) && !target.occupants.includes(human.id)) {
      target.occupants.push(human.id);
    }
  }
}

export function rebuildChildrenIds(humans: Entity[]): void {
  const childSets = new Map<number, Set<number>>();

  for (const human of humans) {
    if (human.type !== EntityType.Human) continue;
    human.childrenIds = [];
    childSets.set(human.id, new Set());
  }

  for (const child of humans) {
    if (!child.alive || child.type !== EntityType.Human) continue;
    if (child.motherId) childSets.get(child.motherId)?.add(child.id);
    if (child.fatherId) childSets.get(child.fatherId)?.add(child.id);
    if (child.adoptiveMotherId) childSets.get(child.adoptiveMotherId)?.add(child.id);
    if (child.adoptiveFatherId) childSets.get(child.adoptiveFatherId)?.add(child.id);
  }

  for (const human of humans) {
    if (human.type !== EntityType.Human) continue;
    const ids = childSets.get(human.id);
    if (ids && ids.size > 0) human.childrenIds = [...ids];
  }
}
/** Repair a shortage in order: unrelated residents, whole household, then the father elsewhere. */
export function rebalanceOvercrowdedResidences(humans: Entity[], residences: Building[]): boolean {
  const occupancy = buildResidenceOccupancy(humans);
  const traits = buildResidenceTraits(humans);
  const units = buildHousingUnits(humans);
  let moved = false;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    const cap = getResidenceCapacity(residence);
    if ((occupancy.get(residence.id) ?? 0) <= cap) continue;
    const occupants = [...(traits.get(residence.id)?.occupants.values() ?? [])];
    const dependentUnit = units.filter((unit) => unit.some((member) => isMinorChild(member)
      && member.residenceBuildingId === residence.id)).sort((a, b) => b.length - a.length)[0];
    if (dependentUnit) {
      const familyIds = new Set(dependentUnit.map((member) => member.id));
      const alternatives = residences.filter((home) => home.id !== residence.id);
      for (const outsider of occupants.filter((member) => !familyIds.has(member.id))) {
        const unit = units.find((candidate) => candidate.includes(outsider)) ?? [outsider];
        const target = pickResidenceForFamily(unit, humans, alternatives, occupancy, traits);
        if (target === undefined) continue;
        for (const member of unit) moveResident(member, target, 'family', { occupancy, traits });
        moved = true;
        if ((occupancy.get(residence.id) ?? 0) <= cap) break;
      }
      if ((occupancy.get(residence.id) ?? 0) <= cap) continue;
      const target = pickResidenceForFamily(dependentUnit, humans, alternatives, occupancy, traits);
      if (target !== undefined) {
        for (const member of dependentUnit) moveResident(member, target, 'family', { occupancy, traits });
        moved = true;
        continue;
      }
      for (const outsider of occupants.filter((member) => !familyIds.has(member.id))) {
        const unit = units.find((candidate) => candidate.includes(outsider)) ?? [outsider];
        for (const member of unit) moveResident(member, undefined, 'family', { occupancy, traits });
        moved = true;
      }
      const before = dependentUnit.map((member) => member.residenceBuildingId);
      assignFamilyToResidence(dependentUnit, humans, residences, humans, occupancy, traits);
      moved ||= dependentUnit.some((member, index) => member.residenceBuildingId !== before[index]);
      continue;
    }
    const visited = new Set<number>();
    const relations = indexFamilyRelations(occupants);
    const groups = occupants.sort((a, b) => a.id - b.id).flatMap((occupant) => visited.has(occupant.id)
      ? [] : [collectFamilyMembers(occupant, occupants, visited, relations)]).sort((a, b) => b.length - a.length);
    let kept = 0;
    for (const group of groups) {
      if (kept + group.length <= cap) { kept += group.length; continue; }
      for (const member of group) moveResident(member, undefined, 'family', { occupancy, traits });
      moved = true;
    }
  }
  return moved;
}


/** Player settler in human or cursed full-moon werewolf form — counts for residence sync. */
export { isResidenceOccupantEntity } from './residencyOccupancy';

/**
 * Keep house/mansion occupants in sync with residenceBuildingId for the UI.
 *
 * One forward pass over `humans` buckets occupant ids by residence instead of re-scanning the
 * whole array once per residence. The occupant id **order** is unchanged: the per-building
 * `.filter().map()` this replaces emitted ids in `humans` order, and appending to a building's
 * bucket during the single forward pass emits exactly that order
 * (`tests/residencyReconciliation.occupantOrder.test.ts` pins it).
 */
export function syncResidenceOccupants(humans: Entity[], buildings: Building[]): void {
  const occupantsByResidenceId = new Map<number, number[]>();
  for (const human of humans) {
    if (!isResidenceOccupantEntity(human)) continue;
    const residenceId = human.residenceBuildingId;
    if (residenceId == null) continue;
    const occupants = occupantsByResidenceId.get(residenceId);
    if (occupants) occupants.push(human.id);
    else occupantsByResidenceId.set(residenceId, [human.id]);
  }

  for (const building of buildings) {
    if (!isResidenceBuilding(building) || building.faction === 'rival') continue;
    building.occupants = occupantsByResidenceId.get(building.id) ?? [];
  }
}

/** Place a family — keeps children with custodian; only splits when no home fits everyone. */
function assignFamilyToResidence(
  family: Entity[],
  alive: Entity[],
  residences: Building[],
  allHumans: Entity[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
): void {
  // A family that fits nowhere falls through to the split path below; the old
  // `?? pickSharedResidenceForFamily(...)` fallback re-ran the same fit test over the same
  // residences, so it could never contribute a placement.
  const picked = pickResidenceForFamily(family, alive, residences, occupancy, traits);
  if (picked !== undefined) {
    for (const member of family) {
      moveResident(member, picked, 'assignment', { occupancy, traits });
    }
    return;
  }

  const children = family.filter(isMinorChild);
  const guardian = children.length > 0 ? getChildCustodian(children[0], allHumans) : undefined;
  if (guardian && family.includes(guardian)) {
    const core = family.filter((member) => member.id === guardian.id || isMinorChild(member));
    const otherAdults = family.filter((member) => !core.includes(member));
    for (const adult of otherAdults) {
      if (adult.residenceBuildingId != null && adult.residenceBuildingId === guardian.residenceBuildingId) {
        moveResident(adult, undefined, 'family', { occupancy, traits });
      }
    }
    const existing = residences.find((home) => home.id === guardian.residenceBuildingId && !isLeaderHouseResidence(home));
    const coreHome = (existing && familyFitsInResidence(core, existing, alive, occupancy) ? existing.id : undefined)
      ?? pickResidenceForFamily(core, alive, residences, occupancy, traits);
    // Without a home for the dependent group, keep it together unhoused rather than overfill or split it.
    for (const member of core) moveResident(member, coreHome, 'family', { occupancy, traits });
    for (const adult of otherAdults) {
      if (hasResidenceAssignment(adult)) continue;
      const target = pickResidenceForHuman(adult, alive, residences, occupancy, traits);
      moveResident(adult, target, 'family', { occupancy, traits });
    }
    return;
  }
  for (const member of family) {
    const target = pickResidenceForHuman(member, alive, residences, occupancy, traits);
    moveResident(member, target, 'family', { occupancy, traits });
  }
}

function fillHomelessAfterEviction(
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
): void {
  for (const unit of buildHousingUnits(alive)) {
    if (unit.every(hasResidenceAssignment)) continue;
    assignFamilyToResidence(unit, alive, residences, alive, occupancy, traits);
  }
}

/**
 * Sweep buckets per day — one per assignment pulse.
 *
 * `assignMissingResidences` with a tick sweeps only the units whose bucket that pulse owns, so a day
 * of reassignment work is spread across the day instead of landing whole on the day boundary. It must
 * equal the assignment layer's pulses per day (`TICKS_PER_DAY / LAYER_ASSIGN_INTERVAL`, 72 / 18 = 4)
 * or a bucket would never come round; the guard test pins that coupling.
 */
export const RESIDENCE_SWEEP_BUCKETS = 4;

/** The bucket one assignment pulse owns: the day's pulse index. */
function activeSweepBucket(tick: number): number {
  const tickOfDay = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return Math.floor((tickOfDay * RESIDENCE_SWEEP_BUCKETS) / TICKS_PER_DAY);
}

/**
 * Seat every settler who has no residence, repair every housing unit that is wrongly placed.
 *
 * `allHumansForGenealogy` widens the family pool and the bed count beyond the settlers being seated:
 * a settler who may not move still occupies a bed. With no `sweepTick`
 * the whole colony converges at once — a load, a player command or an event must not wait for a
 * bucket to come round. With one, only that pulse's bucket of already-housed units is swept; the
 * eviction rebalance and the homeless fill below stay global on every call, so a settler who loses a
 * bed is never left outside until the next cycle.
 */
export function assignMissingResidences(
  humans: Entity[],
  buildings: Building[],
  allHumansForGenealogy?: Entity[],
  sweepTick?: number,
  genealogy?: GenealogyRegistry,
): void {
  const residences = listPlayerResidences(buildings);
  if (residences.length === 0) return;

  for (const h of humans) {
    if (!h.alive) moveResident(h, undefined, 'death');
  }

  const alive = humans.filter((h) => h.alive && isPlayerHuman(h) && !isImprisoned(h));
  // A jailed settler keeps a reserved bed, counted here with the residents this call may not move.
  const residents = (allHumansForGenealogy ?? humans).filter(
    (h) => h.alive && isResidenceOccupantEntity(h),
  );
  const genealogyPool = (allHumansForGenealogy ?? humans).filter(
    (h) => h.type === EntityType.Human || isResidenceOccupantEntity(h),
  );

  rebuildChildrenIds(genealogyPool);

  for (const human of alive) {
    if (isMinorChild(human)) ensureOrphanAdoption(human, genealogyPool, residences, undefined, undefined, genealogy);
  }

  // `residences` is built above and never mutated in this loop, and the body only writes the same
  // settler it just tested, so the membership test is answered by one id set instead of a scan per
  // settler.
  const residenceIds = new Set<number>();
  for (const residence of residences) residenceIds.add(residence.id);

  for (const human of alive) {
    const residenceId = human.residenceBuildingId;
    if (residenceId != null && !residenceIds.has(residenceId)) {
      moveResident(human, undefined, 'assignment');
    }
  }

  rebalanceOvercrowdedResidences(residents, residences);

  // Family structure is static while we converge on residence slots — build the
  // housing units ONCE instead of every pass (was 24× full rebuilds per call).
  const leaderHouseIds = new Set(residences.filter(isLeaderHouseResidence).map((residence) => residence.id));
  const housingUnitsBase = buildHousingUnits(alive).filter((unit) => !unit.some((member) =>
    member.residenceBuildingId != null && leaderHouseIds.has(member.residenceBuildingId),
  ));

  if (sweepTick === undefined) {
    for (let pass = 0; pass < 24; pass++) {
      let reassigned = 0;
      // One occupancy scan per pass — O(H) then O(1) counts (EK-E2) — and one trait walk beside it,
      // threaded through every pick below instead of rebuilt per pick (F-SIM-9).
      const occupancy = buildResidenceOccupancy(residents);
      const traits = buildResidenceTraits(residents);
      const housingUnits = sortHousingUnitsForAssignment(
        housingUnitsBase,
        alive,
        residences,
        occupancy,
        traits,
      );
      for (const unit of housingUnits) {
        if (!housingUnitNeedsReassignment(unit, alive, residences, occupancy, traits)) continue;

        assignFamilyToResidence(unit, alive, residences, genealogyPool, occupancy, traits);
        reassigned++;
      }
      const evicted = rebalanceOvercrowdedResidences(residents, residences);
      if (evicted) {
        // Rebalance clears residences without the maps — rebuild both before fill.
        const afterEvict = buildResidenceOccupancy(residents);
        const traitsAfterEvict = buildResidenceTraits(residents);
        fillHomelessAfterEviction(alive, residences, afterEvict, traitsAfterEvict);
      }
      if (reassigned === 0 && !evicted) break;
    }
  } else {
    // A pulse visits only its own quarter of the housing units. Several units
    // can depend on the same available house, so re-evaluate this bucket after
    // the first round rather than postponing a newly feasible move for a day.
    const bucket = activeSweepBucket(sweepTick);
    const sweepUnits = housingUnitsBase.filter(
      (unit) => housingUnitBucket(unit, RESIDENCE_SWEEP_BUCKETS) === bucket,
    );
    for (let pass = 0; pass < 3; pass++) {
      const occupancy = buildResidenceOccupancy(residents);
      const traits = buildResidenceTraits(residents);
      const orderedUnits = sortHousingUnitsForAssignment(sweepUnits, alive, residences, occupancy, traits);
      let moved = false;
      for (const unit of orderedUnits) {
        if (!housingUnitNeedsReassignment(unit, alive, residences, occupancy, traits)) continue;

        assignFamilyToResidence(unit, alive, residences, genealogyPool, occupancy, traits);
        moved = true;
      }
      if (!moved) break;
    }
    if (rebalanceOvercrowdedResidences(residents, residences)) {
      const afterEvict = buildResidenceOccupancy(residents);
      const traitsAfterEvict = buildResidenceTraits(residents);
      fillHomelessAfterEviction(alive, residences, afterEvict, traitsAfterEvict);
    }

    // Earlier buckets can acquire a newly available house only after later
    // buckets release it. At the final daily pulse, revisit those units once
    // against the now-current occupancy. This removes the one-day delay without
    // re-running the expensive 24-pass unsplit allocator every tick.
    if (bucket === RESIDENCE_SWEEP_BUCKETS - 1) {
      const occupancy = buildResidenceOccupancy(residents);
      const traits = buildResidenceTraits(residents);
      const ordered = sortHousingUnitsForAssignment(housingUnitsBase, alive, residences, occupancy, traits);
      for (const unit of ordered) {
        if (!housingUnitNeedsReassignment(unit, alive, residences, occupancy, traits)) continue;
        assignFamilyToResidence(unit, alive, residences, genealogyPool, occupancy, traits);
      }
      // §12: once a day, a settled household may trade its home for a vacant one that meaningfully
      // shortens its workers' commute and children's school trip — the whole household moves together.
      relocateHouseholdsForCommute(housingUnitsBase, alive, residences, buildings, occupancy, traits);
    }
  }

  fillHomelessAfterEviction(alive, residences, buildResidenceOccupancy(residents), buildResidenceTraits(residents));

  syncResidenceOccupants(
    (allHumansForGenealogy ?? humans).filter(isResidenceOccupantEntity),
    buildings,
  );
}

/** The daily commute sweep; exposed to the existing population benchmark. */
export function relocateHouseholdsForCommute(
  units: Entity[][],
  alive: Entity[],
  residences: Building[],
  buildings: Building[],
  occupancy: ResidenceOccupancy,
  traits: ResidenceTraitsById,
): void {
  const index = buildCommuteRelocationIndex(residences, buildings, occupancy);
  if (index.vacant.length === 0) return;
  const cache = new Map<string, number>();
  beginCommuteRoutePass();
  const walkSpeed = SPECIES_CONFIG[EntityType.Human].speed;
  let relocated = 0;
  for (const unit of units) {
    if (relocated >= MAX_RELOCATIONS_PER_DAY) return;
    const better = pickCommuteRelocation(unit, alive, residences, buildings, occupancy, cache, walkSpeed, index);
    if (better === undefined) continue;
    relocated += 1;
    const previousId = unit[0]?.residenceBuildingId;
    for (const member of unit) moveResident(member, better, 'commute', { occupancy, traits });
    index.vacant = index.vacant.filter((residence) => residence.id !== better);
    const previous = previousId == null ? undefined : index.residencesById.get(previousId);
    if (previous && (occupancy.get(previous.id) ?? 0) === 0) {
      index.vacant.push(previous);
      index.vacant.sort((a, b) => index.order.get(a.id)! - index.order.get(b.id)!);
    }
  }
}

/** When settlers partner up, move them into a couple's home (empty house preferred). */
export function syncPartnerResidence(
  human: Entity,
  partner: Entity,
  residences: Building[],
  humans: Entity[],
): void {
  if (residences.length === 0) return;

  // Couple + housing-minor kids only — adult children who moved out stay put (EK-E5).
  const household: Entity[] = [human, partner];
  for (const member of collectOwnHousehold(human, humans)) {
    if (member.id === human.id || member.id === partner.id) continue;
    if (!isMinorChild(member)) continue;
    household.push(member);
  }

  const familyHome = pickResidenceForFamily(household, humans, residences);
  if (familyHome !== undefined) {
    for (const member of household) {
      moveResident(member, familyHome, 'family', { buildings: residences });
    }
    return;
  }

  // No home fits the whole family, so only the couple moves: a minor child follows into a home
  // that has room for them, by the child-custodian rule the assign layer also uses.
  const coupleHome = pickSharedResidence(human, partner, humans, residences);
  if (coupleHome === undefined) return;

  for (const member of household) {
    if (member.residenceBuildingId === coupleHome) continue;
    if (member.id === human.id || member.id === partner.id) {
      moveResident(member, coupleHome, 'family', { buildings: residences });
      continue;
    }
    if (pickResidenceFromChildCustodian(member, humans, residences) !== coupleHome) continue;
    moveResident(member, coupleHome, 'family', { buildings: residences });
  }
}

/** The couple-only fallback: two movers, one of whom may already live in the chosen home. */
function pickSharedResidence(
  human: Entity,
  partner: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  return pickLeastCrowdedResidence(humans, residences, 2, {}, undefined, [human, partner]);
}

function findLivingHuman(humans: Entity[], id: number | undefined): Entity | undefined {
  return id == null ? undefined : humans.find((human) => human.id === id && human.alive);
}

function livingAdoptiveCustodian(child: Entity, humans: Entity[]): Entity | undefined {
  return [child.adoptiveMotherId, child.adoptiveFatherId].map((id) => findLivingHuman(humans, id))
    .find((guardian) => guardian && isResidenceOccupantEntity(guardian) && !isImprisoned(guardian));
}

/** Ordinary couples eligible to adopt; the sitting leader's couple is never a candidate. */
function listVillageCouples(humans: Entity[]): Array<{ mother?: Entity; father?: Entity; partnerA: Entity; partnerB: Entity }> {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h) && !isImprisoned(h));
  const couples: Array<{ mother?: Entity; father?: Entity; partnerA: Entity; partnerB: Entity }> = [];
  const seen = new Set<number>();

  for (const human of alive.sort((a, b) => a.id - b.id)) {
    if (seen.has(human.id)) continue;
    const partner = findLivingHuman(alive, human.partnerId);
    if (!partner) continue;
    seen.add(human.id);
    seen.add(partner.id);

    if (human.occupation === LEADER_OCCUPATION || partner.occupation === LEADER_OCCUPATION) continue;

    const mother = human.gender === 'female' ? human : partner.gender === 'female' ? partner : undefined;
    const father = human.gender === 'male' ? human : partner.gender === 'male' ? partner : undefined;
    couples.push({ mother, father, partnerA: human, partnerB: partner });
  }

  return couples;
}

function listVillageSingleAdults(humans: Entity[]): Entity[] {
  const candidates = humans.filter(
    (h) =>
      h.alive
      && isPlayerHuman(h)
      && !h.isJuvenile
      && h.age >= HUMAN_ADULT_MIN_AGE
      && !isImprisoned(h)
      && h.occupation !== LEADER_OCCUPATION,
  );
  // Partner lookup includes the leader, so their spouse cannot appear as a single guardian.
  return candidates.filter((h) => !findLivingHuman(humans, h.partnerId));
}

export function placeOrphanInHouse(
  child: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
): boolean {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  if (hasResidenceAssignment(child)) {
    const current = residences.find((b) => b.id === child.residenceBuildingId);
    if (current && !isLeaderHouseResidence(current) && residenceRoomFor(child, current, alive, occupancy)) return true;
  }

  const picked =
    pickResidenceForFamily([child], alive, residences, occupancy, traits) ??
    pickLeastCrowdedResidence(alive, residences, 1, { forbidSinglesOnly: true }, occupancy, [], traits);
  if (picked === undefined) return false;

  moveResident(child, picked, 'guardian', { occupancy, traits, buildings: residences });
  return true;
}

/** Resolve custody once for a sibling set; the housing owner places its complete guardian household. */
export function ensureOrphanAdoption(
  child: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
  genealogy?: GenealogyRegistry,
): boolean {
  if (!child.alive || child.faction || !isMinorChild(child)) return false;
  const parent = [child.motherId, child.fatherId].map((id) => findLivingHuman(humans, id))
    .find((human) => human && !isImprisoned(human));
  if (parent) {
    child.adoptiveMotherId = undefined;
    child.adoptiveFatherId = undefined;
    return false;
  }
  if (livingAdoptiveCustodian(child, humans)) return false;
  const siblings = humans.filter((sibling) => sibling.alive && isPlayerHuman(sibling) && isMinorChild(sibling)
    && (sibling.id === child.id || (child.motherId != null && sibling.motherId === child.motherId)
      || (child.fatherId != null && sibling.fatherId === child.fatherId))
    && ![sibling.motherId, sibling.fatherId].some((id) => findLivingHuman(humans, id)))
    .sort((a, b) => a.id - b.id);
  const alive = humans.filter((human) => isResidenceOccupantEntity(human) && !isImprisoned(human));
  // The Leader's House is not an orphan home, so a manor resident is never a guardian here:
  // naming one would relocate the leader's household out of the manor to seat the child.
  const guardianPool = humans.filter((human) => {
    const homeId = human.residenceBuildingId;
    return homeId == null || !residences.some((home) => home.id === homeId && isLeaderHouseResidence(home));
  });
  const relative = getChildCustodian(child, guardianPool, undefined, genealogy);
  const existing = siblings.map((sibling) => livingAdoptiveCustodian(sibling, guardianPool)).find((guardian) => !!guardian);
  const couples = listVillageCouples(guardianPool);
  const singles = listVillageSingleAdults(guardianPool).sort((a, b) => a.id - b.id);
  const canHouse = (guardian: Entity, currentOnly = false): boolean => {
    const household = [...new Map([...collectMinorHousehold(guardian, alive), ...siblings]
      .map((member) => [member.id, member])).values()];
    const candidates = currentOnly ? residences.filter((home) => home.id === guardian.residenceBuildingId) : residences;
    return pickResidenceForFamily(household, alive, candidates, occupancy, traits) !== undefined;
  };
  const couple = couples.find((candidate) => canHouse(candidate.partnerA, true))
    ?? couples.find((candidate) => canHouse(candidate.partnerA)) ?? couples[0];
  const guardian = relative ?? existing ?? couple?.partnerA ?? singles.find((candidate) => canHouse(candidate, true)) ?? singles.find((candidate) => canHouse(candidate)) ?? singles[0];
  if (!guardian) {
    const picked = pickResidenceForFamily(siblings, alive, residences, occupancy, traits);
    if (picked === undefined) return false;
    for (const sibling of siblings) moveResident(sibling, picked, 'guardian', { occupancy, traits, buildings: residences });
    return true;
  }
  const partner = findLivingHuman(alive, guardian.partnerId);
  const guardians = [guardian, partner].filter((human): human is Entity => !!human);
  for (const sibling of siblings) {
    if (livingAdoptiveCustodian(sibling, humans)) continue;
    sibling.adoptiveMotherId = guardians.find((human) => human.gender === 'female')?.id;
    sibling.adoptiveFatherId = guardians.find((human) => human.gender === 'male')?.id;
    if (guardian.surname) sibling.surname = guardian.surname;
    for (const adult of guardians) {
      adult.childrenIds ??= [];
      if (!adult.childrenIds.includes(sibling.id)) adult.childrenIds.push(sibling.id);
    }
  }
  const household = [...new Map([...collectMinorHousehold(guardian, alive), ...siblings]
    .map((member) => [member.id, member])).values()];
  assignFamilyToResidence(household, alive, residences, humans, occupancy, traits);
  return true;
}

export function tryMoveOutOfFamilyHome(
  human: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  if (!isAdultChildAtHome(human, humans)) return false;

  const household = collectOwnHousehold(human, humans);
  // Select an empty home that fits the complete departing household.
  const target = residences.find(
    (r) =>
      countResidentsInBuilding(humans, r.id, occupancy) === 0 &&
      familyFitsInResidence(household, r, humans, occupancy),
  );
  if (!target) return false;

  for (const member of household) moveResident(member, target.id, 'family', { occupancy, buildings: residences });
  return true;
}


export function reassignDivorcedResidences(
  a: Entity,
  b: Entity,
  buildings: Building[],
  villagers: Entity[],
  preferredCustodian?: Entity,
): void {
  const residences = buildings.filter(isResidenceBuilding);

  const wife = a.gender === 'female' ? a : b.gender === 'female' ? b : null;
  // A sitting leader keeps the manor on divorce, regardless of gender.
  // Generic marital-home rules would otherwise evict the leader until the next
  // leader-house reconciliation pulse and produce a residence bounce.
  const sharedManor = a.residenceBuildingId != null
    && a.residenceBuildingId === b.residenceBuildingId
    && buildings.some((building) => building.id === a.residenceBuildingId
      && building.type === BuildingType.LeaderHouse && building.completed);
  const manorLeader = sharedManor
    ? [a, b].find((person) => person.occupation === LEADER_OCCUPATION)
    : undefined;
  const custodian = manorLeader ?? preferredCustodian ?? wife ?? a;
  const leaver = custodian === a ? b : a;

  const formerHomes = new Set<number>();
  for (const resident of [custodian, leaver]) {
    if (resident.residenceBuildingId != null) {
      formerHomes.add(resident.residenceBuildingId);
    }
  }

  // Evict leaver from the shared home
  if (leaver.residenceBuildingId != null) {
    const oldHome = buildings.find((building) => building.id === leaver.residenceBuildingId);
    if (oldHome) {
      oldHome.occupants = oldHome.occupants.filter((id) => id !== leaver.id);
    }
  }

  if (residences.length === 0) {
    moveResident(custodian, undefined, 'divorce', { buildings });
    moveResident(leaver, undefined, 'divorce', { buildings });
    return;
  }

  const custodianImprisoned = isImprisoned(custodian);
  if (custodianImprisoned) {
    moveResident(custodian, undefined, 'divorce', { buildings });
  } else {
    const custodianHome = custodian.residenceBuildingId != null ? buildings.find((building) => building.id === custodian.residenceBuildingId) : undefined;
    if (!custodianHome || !isResidenceBuilding(custodianHome) || !custodianHome.completed) {
      moveResident(custodian, pickResidenceForHuman(custodian, villagers, residences), 'divorce', { buildings });
    }
  }

  if (!isImprisoned(leaver)) {
    const excludeHomes = new Set(formerHomes);
    if (custodian.residenceBuildingId != null) {
      excludeHomes.add(custodian.residenceBuildingId);
    }
    moveResident(leaver, pickResidenceForHumanExcluding(leaver, villagers, residences, excludeHomes), 'divorce', { buildings });
  } else {
    moveResident(leaver, undefined, 'divorce', { buildings });
  }

  if (!custodianImprisoned && custodian.residenceBuildingId != null) {
    const children = villagers.filter(
      (child) =>
        child.alive &&
        isMinorChild(child) &&
        (child.motherId === custodian.id ||
          child.adoptiveMotherId === custodian.id ||
          child.fatherId === custodian.id ||
          child.adoptiveFatherId === custodian.id),
    );
    for (const child of children) {
      // A child follows the custodian only into a home with room for them; the assign layer
      // places the rest, exactly as the death path does.
      const custodianHome = pickResidenceFromChildCustodian(child, villagers, residences);
      if (custodianHome !== undefined) moveResident(child, custodianHome, 'guardian', { buildings });
    }
  }

  syncResidenceOccupants(villagers, buildings);
}

