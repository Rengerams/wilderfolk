import { EntityType } from './gameTypes';
import type { Building, Entity } from './gameTypes';
import type { ResidenceOccupancy } from './residencyOccupancy';
import { collectFamilyMembers, collectOwnHousehold, isMinorChild } from './householdComposition';
import { isResidenceBuilding, isLeaderHouseResidence, getResidenceCapacity, hasResidenceAssignment, buildResidenceOccupancy, occupancyMove } from './residencyOccupancy';
import { listPlayerResidences, ensureOrphanAdoption, rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable, pickResidenceForFamily, pickResidenceForHuman, pickResidenceFromChildCustodian, buildHousingUnits, housingUnitNeedsReassignment, sortHousingUnitsForAssignment, pickLeastCrowdedResidence } from './residencySelection';
import { isPlayerHuman } from './playerHuman';

function pickSharedResidence(
  human: Entity,
  partner: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  // The eligibility accounting (a mover already living in the home counts once, not twice) is the
  // residency selection owner's; this function used to carry a second copy of the whole loop
  // (duplication A2).
  return pickLeastCrowdedResidence(humans, residences, 2, {}, undefined, [human, partner]);
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
export function rebalanceOvercrowdedResidences(
  humans: Entity[],
  residences: Building[],
): boolean {
  // One forward pass buckets the candidate occupants by residence instead of re-filtering the whole
  // settler list once per residence (N-7 — the same shape `syncResidenceOccupants` below uses). The
  // bucket **order** is the `humans` order the per-residence `.filter()` emitted, because a single
  // forward pass appends in that order. Exactly equivalent despite the eviction below: the loop's
  // only state write is `residenceBuildingId = undefined` (:77) and a settler holds at most one
  // residence, so an evicted settler was only ever in the bucket of the residence being processed —
  // every other residence's live `.filter()` excluded them before and after that write. The
  // predicate's other inputs (`alive`, `isPlayerHuman`) are never written in this function. Measured
  // at 0.395 % of tick time over an 8 640-tick instrumented run (46 208 calls).
  const occupantsByResidenceId = new Map<number, Entity[]>();
  for (const human of humans) {
    if (!human.alive || !isPlayerHuman(human)) continue;
    const residenceId = human.residenceBuildingId;
    if (residenceId == null) continue;
    const bucket = occupantsByResidenceId.get(residenceId);
    if (bucket) bucket.push(human);
    else occupantsByResidenceId.set(residenceId, [human]);
  }

  let evicted = false;
  for (const residence of residences) {
    // The leader's household is never overcrowd-evicted from the manor.
    if (isLeaderHouseResidence(residence)) continue;
    const cap = getResidenceCapacity(residence);
    const occupants = occupantsByResidenceId.get(residence.id) ?? [];
    if (occupants.length <= cap) continue;

    const visited = new Set<number>();
    const familiesInHouse: Entity[][] = [];
    for (const occupant of occupants.sort((a, b) => a.id - b.id)) {
      if (visited.has(occupant.id)) continue;
      familiesInHouse.push(collectFamilyMembers(occupant, occupants, visited));
    }

    familiesInHouse.sort((a, b) => b.length - a.length);

    const kept = new Set<number>();
    let count = 0;
    for (const family of familiesInHouse) {
      if (count + family.length > cap) continue;
      for (const member of family) kept.add(member.id);
      count += family.length;
    }

    for (const occupant of occupants) {
      if (!kept.has(occupant.id)) {
        occupant.residenceBuildingId = undefined;
        evicted = true;
      }
    }
  }
  return evicted;
}


/** Player settler in human or cursed full-moon werewolf form — counts for residence sync. */
export function isResidenceOccupantEntity(entity: Entity): boolean {
  if (!entity.alive || entity.faction) return false;
  if (entity.type === EntityType.Human) return true;
  return entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
}


/**
 * Keep house/mansion occupants in sync with residenceBuildingId for the UI.
 *
 * One forward pass over `humans` buckets occupant ids by residence (N-7) instead of re-scanning the
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
): void {
  // A family that fits nowhere falls through to the split path below; the old
  // `?? pickSharedResidenceForFamily(...)` fallback re-ran the same fit test over the same
  // residences, so it could never contribute a placement.
  const picked = pickResidenceForFamily(family, alive, residences, occupancy);
  if (picked !== undefined) {
    for (const member of family) {
      if (occupancy) occupancyMove(occupancy, member.residenceBuildingId, picked);
      member.residenceBuildingId = picked;
    }
    return;
  }

  const adults = family.filter((m) => !m.isJuvenile).sort((a, b) => a.id - b.id);
  const juveniles = family.filter((m) => m.isJuvenile).sort((a, b) => a.id - b.id);

  for (const adult of adults) {
    const house = pickResidenceForHuman(adult, alive, residences, occupancy);
    if (house !== undefined) {
      if (occupancy) occupancyMove(occupancy, adult.residenceBuildingId, house);
      adult.residenceBuildingId = house;
    }
  }

  for (const child of juveniles) {
    const custodianHome = pickResidenceFromChildCustodian(child, allHumans, residences);
    if (custodianHome !== undefined) {
      if (occupancy) occupancyMove(occupancy, child.residenceBuildingId, custodianHome);
      child.residenceBuildingId = custodianHome;
      continue;
    }
    const house = pickResidenceForHuman(child, alive, residences, occupancy);
    if (house !== undefined) {
      if (occupancy) occupancyMove(occupancy, child.residenceBuildingId, house);
      child.residenceBuildingId = house;
    }
  }
}

function fillHomelessAfterEviction(
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): void {
  for (const human of alive) {
    if (!hasResidenceAssignment(human)) {
      const house = pickResidenceForHuman(human, alive, residences, occupancy);
      if (house !== undefined) {
        if (occupancy) occupancyMove(occupancy, human.residenceBuildingId, house);
        human.residenceBuildingId = house;
      }
    }
  }
}

export function assignMissingResidences(
  humans: Entity[],
  buildings: Building[],
  allHumansForGenealogy?: Entity[],
): void {
  const residences = listPlayerResidences(buildings);
  if (residences.length === 0) return;

  for (const h of humans) {
    if (!h.alive) h.residenceBuildingId = undefined;
  }

  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  const genealogyPool = (allHumansForGenealogy ?? humans).filter(
    (h) => h.alive && h.type === EntityType.Human,
  );

  rebuildChildrenIds(genealogyPool);

  for (const human of alive) {
    if (isMinorChild(human)) ensureOrphanAdoption(human, alive, residences);
  }

  // `residences` is built above and never mutated in this loop, and the body only writes the same
  // settler it just tested, so the membership test is answered by one id set instead of a scan per
  // settler.
  const residenceIds = new Set<number>();
  for (const residence of residences) residenceIds.add(residence.id);

  for (const human of alive) {
    const residenceId = human.residenceBuildingId;
    if (residenceId != null && !residenceIds.has(residenceId)) {
      human.residenceBuildingId = undefined;
    }
  }

  rebalanceOvercrowdedResidences(alive, residences);
  rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable(alive, residences);

  // Family structure is static while we converge on residence slots — build the
  // housing units ONCE instead of every pass (was 24× full rebuilds per call).
  const housingUnitsBase = buildHousingUnits(alive);
  for (let pass = 0; pass < 24; pass++) {
    let reassigned = 0;
    // One occupancy scan per pass — O(H) then O(1) counts (EK-E2).
    const occupancy = buildResidenceOccupancy(alive);
    const housingUnits = sortHousingUnitsForAssignment(
      housingUnitsBase,
      alive,
      residences,
      occupancy,
    );
    for (const unit of housingUnits) {
      if (!housingUnitNeedsReassignment(unit, alive, residences, occupancy)) continue;

      for (const member of unit) {
        occupancyMove(occupancy, member.residenceBuildingId, undefined);
        member.residenceBuildingId = undefined;
      }
      assignFamilyToResidence(unit, alive, residences, humans, occupancy);
      reassigned++;
    }
    const evicted = rebalanceOvercrowdedResidences(alive, residences);
    if (evicted) {
      // Rebalance clears residences without the map — rebuild before fill.
      const afterEvict = buildResidenceOccupancy(alive);
      fillHomelessAfterEviction(alive, residences, afterEvict);
    }
    if (reassigned === 0 && !evicted) break;
  }

  {
    const occupancy = buildResidenceOccupancy(alive);
    for (const human of alive) {
      if (!hasResidenceAssignment(human)) {
        const house = pickResidenceForHuman(human, alive, residences, occupancy);
        if (house !== undefined) {
          occupancyMove(occupancy, human.residenceBuildingId, house);
          human.residenceBuildingId = house;
        }
      }
    }
  }

  syncResidenceOccupants(
    (allHumansForGenealogy ?? humans).filter(isResidenceOccupantEntity),
    buildings,
  );
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

  const shared = pickResidenceForFamily(household, humans, residences)
    ?? pickSharedResidence(human, partner, humans, residences);
  if (shared === undefined) return;

  for (const member of household) {
    member.residenceBuildingId = shared;
  }
}
