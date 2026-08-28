import { EntityType } from './gameTypes';
import type { Building, Entity } from './gameTypes';
import type { ResidenceOccupancy } from './residencyOccupancy';
import { collectFamilyMembers, collectOwnHousehold, isMinorChild } from './householdComposition';
import { isResidenceBuilding, isLeaderHouseResidence, getResidenceCapacity, hasResidenceAssignment, buildResidenceOccupancy, occupancyMove, countResidentsInBuilding } from './residencyOccupancy';
import { listPlayerResidences, ensureOrphanAdoption, rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable, pickResidenceForFamily, pickResidenceForHuman, pickResidenceFromChildCustodian, buildHousingUnits, housingUnitNeedsReassignment, sortHousingUnitsForAssignment, pickSharedResidenceForFamily } from './residencySelection';

function pickSharedResidence(
  human: Entity,
  partner: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  const needed = 2;
  let best: Building | undefined;
  let bestCount = Infinity;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    const cap = getResidenceCapacity(residence);
    let count = countResidentsInBuilding(humans, residence.id);
    let slots = needed;
    if (human.residenceBuildingId === residence.id) {
      count--;
      slots--;
    }
    if (partner.residenceBuildingId === residence.id) {
      count--;
      slots--;
    }
    if (count + slots > cap) continue;
    if (count < bestCount || (count === bestCount && residence.id < (best?.id ?? Infinity))) {
      bestCount = count;
      best = residence;
    }
  }
  return best?.id;
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
  let evicted = false;
  for (const residence of residences) {
    // The leader's household is never overcrowd-evicted from the manor.
    if (isLeaderHouseResidence(residence)) continue;
    const cap = getResidenceCapacity(residence);
    const occupants = humans.filter(
      (h) => h.alive && !h.faction && h.residenceBuildingId === residence.id,
    );
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


/** Keep house/mansion occupants in sync with residenceBuildingId for the UI. */
export function syncResidenceOccupants(humans: Entity[], buildings: Building[]): void {
  for (const building of buildings) {
    if (!isResidenceBuilding(building) || building.faction === 'rival') continue;
    building.occupants = humans
      .filter((h) => isResidenceOccupantEntity(h) && h.residenceBuildingId === building.id)
      .map((h) => h.id);
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
  const picked = pickResidenceForFamily(family, alive, residences, occupancy)
    ?? pickSharedResidenceForFamily(family, alive, residences, occupancy);
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

  const alive = humans.filter((h) => h.alive && !h.faction);
  const genealogyPool = (allHumansForGenealogy ?? humans).filter(
    (h) => h.alive && h.type === EntityType.Human,
  );

  rebuildChildrenIds(genealogyPool);

  for (const human of alive) {
    if (isMinorChild(human)) ensureOrphanAdoption(human, alive, residences);
  }

  for (const human of alive) {
    if (
      hasResidenceAssignment(human)
      && !residences.some((b) => b.id === human.residenceBuildingId)
    ) {
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
