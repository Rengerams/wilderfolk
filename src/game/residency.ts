import type { Building, Entity } from './gameTypes';
import { BuildingType, EntityType } from './gameTypes';
import type { ResidenceOccupancy } from './residencyOccupancy';
import { collectOwnHousehold, getChildCustodian, isMinorChild } from './householdComposition';
export { collectOwnHousehold, getChildCustodian, isMinorChild } from './householdComposition';

import { HUMAN_ADULT_MIN_AGE } from './dayCycleConstants';
import {
  HUMAN_MOVE_OUT_MIN_AGE,
  isResidenceBuilding,
  isResidenceBuildingType,
  isLeaderHouseResidence,
  getResidenceCapacity,
  getResidenceUpgradeSlotGain,
  hasWorkAssignment,
  hasResidenceAssignment,
  isImprisoned,
  shareResidence,
  isNearResidence,
  buildResidenceOccupancy,
  occupancyMove,
  countResidentsInBuilding,
  residenceHasCapacity,
  residenceRoomFor,
} from './residencyOccupancy';
export type { ResidenceOccupancy } from './residencyOccupancy';
export {
  HUMAN_MOVE_OUT_MIN_AGE,
  isResidenceBuilding,
  isResidenceBuildingType,
  isLeaderHouseResidence,
  getResidenceCapacity,
  getResidenceUpgradeSlotGain,
  hasWorkAssignment,
  hasResidenceAssignment,
  isImprisoned,
  shareResidence,
  isNearResidence,
  buildResidenceOccupancy,
  occupancyMove,
  countResidentsInBuilding,
  residenceHasCapacity,
  residenceRoomFor,
} from './residencyOccupancy';


interface PickResidenceOptions {
  forbidSinglesOnly?: boolean;
}

export function listPlayerResidences(buildings: Building[]): Building[] {
  return buildings.filter((b) => isResidenceBuilding(b) && b.faction !== 'rival');
}

function pickLeastCrowdedResidence(
  humans: Entity[],
  residences: Building[],
  extraSlots = 1,
  options: PickResidenceOptions = {},
  occupancy?: ResidenceOccupancy,
): number | undefined {
  let best: Building | undefined;
  let bestCount = Infinity;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    if (options.forbidSinglesOnly && residenceHostsOnlySingles(residence.id, humans)) continue;
    const cap = getResidenceCapacity(residence);
    const count = countResidentsInBuilding(humans, residence.id, occupancy);
    if (count + extraSlots > cap) continue;
    if (count < bestCount || (count === bestCount && residence.id < (best?.id ?? Infinity))) {
      bestCount = count;
      best = residence;
    }
  }
  return best?.id;
}

function livingHuman(humans: Entity[], id: number | undefined): Entity | undefined {
  if (id === undefined) return undefined;
  return humans.find((h) => h.id === id && h.alive);
}

function humanById(humans: Entity[], id: number | undefined): Entity | undefined {
  if (id == null) return undefined;
  return humans.find((h) => h.id === id);
}



function livingAdoptiveCustodian(child: Entity, humans: Entity[]): Entity | undefined {
  const adoptiveMother = livingHuman(humans, child.adoptiveMotherId);
  if (adoptiveMother) return adoptiveMother;
  return livingHuman(humans, child.adoptiveFatherId);
}

function listVillageCouples(humans: Entity[]): Array<{ mother: Entity; father: Entity }> {
  const alive = humans.filter((h) => h.alive && !h.faction);
  const couples: Array<{ mother: Entity; father: Entity }> = [];
  const seen = new Set<number>();

  for (const human of alive.sort((a, b) => a.id - b.id)) {
    if (seen.has(human.id)) continue;
    const partner = livingHuman(alive, human.partnerId);
    if (!partner) continue;
    seen.add(human.id);
    seen.add(partner.id);
    const mother = human.gender === 'female'
      ? human
      : partner.gender === 'female'
        ? partner
        : human;
    const father = mother.id === human.id ? partner : human;
    couples.push({ mother, father });
  }

  return couples;
}

function pickRandomAdoptiveCouple(
  child: Entity,
  humans: Entity[],
): { mother: Entity; father: Entity } | undefined {
  const couples = listVillageCouples(humans);
  if (couples.length === 0) return undefined;
  const idx = Math.abs(child.id * 7919) % couples.length;
  return couples[idx];
}

function listVillageSingleAdults(humans: Entity[]): Entity[] {
  // Social adults only — not graduated juveniles aged 12–15
  const alive = humans.filter(
    (h) => h.alive && !h.faction && !h.isJuvenile && h.age >= HUMAN_ADULT_MIN_AGE,
  );
  return alive.filter((h) => {
    const partner = livingHuman(alive, h.partnerId);
    return !partner;
  });
}

/** Stable foster pick when no married couples remain in the village. */
function pickRandomAdoptiveGuardian(child: Entity, humans: Entity[]): Entity | undefined {
  const singles = listVillageSingleAdults(humans).sort((a, b) => a.id - b.id);
  if (singles.length === 0) return undefined;
  return singles[Math.abs(child.id * 7919) % singles.length];
}



function hasLivingNaturalCustodian(child: Entity, humans: Entity[]): boolean {
  if (livingHuman(humans, child.motherId)) return true;
  if (livingHuman(humans, child.fatherId)) return true;

  if (child.isBastard) {
    const motherRecord = humanById(humans, child.motherId);
    if (motherRecord?.motherId != null && livingHuman(humans, motherRecord.motherId)) return true;
    const fatherRecord = humanById(humans, child.fatherId);
    if (fatherRecord?.motherId != null && livingHuman(humans, fatherRecord.motherId)) return true;
  }

  return false;
}

function pickOrphanResidence(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  const alive = humans.filter((h) => h.alive && !h.faction);
  const custodianHome = pickResidenceFromChildCustodian(child, humans, residences);
  if (custodianHome !== undefined) return custodianHome;

  let best: Building | undefined;
  let bestScore = Infinity;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    if (!residenceRoomFor(child, residence, alive)) continue;
    if (residenceHostsOnlySingles(residence.id, alive)) continue;
    const count = countResidentsInBuilding(alive, residence.id);
    let score = count;
    if (count === 0) score -= 100;
    if (residenceHostsCouple(residence.id, alive)) score -= 50;
    if (score < bestScore || (score === bestScore && residence.id < (best?.id ?? Infinity))) {
      bestScore = score;
      best = residence;
    }
  }
  return best?.id;
}

export function placeOrphanInHouse(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  const alive = humans.filter((h) => h.alive && !h.faction);
  if (hasResidenceAssignment(child)) {
    const current = residences.find((b) => b.id === child.residenceBuildingId);
    if (current && residenceRoomFor(child, current, alive)) return true;
  }

  const picked = pickOrphanResidence(child, humans, residences)
    ?? pickLeastCrowdedResidence(alive, residences, 1, { forbidSinglesOnly: true });
  if (picked === undefined) return false;

  child.residenceBuildingId = picked;
  return true;
}

/**
 * Mother → grandmas → father; else random adoptive couple.
 * If no married couples exist, place the orphan in any house with room.
 */
export function ensureOrphanAdoption(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  if (!child.alive || child.faction || !isMinorChild(child)) return false;
  if (child.adoptiveMotherId != null || child.adoptiveFatherId != null) {
    if (hasLivingNaturalCustodian(child, humans) || livingAdoptiveCustodian(child, humans)) {
      if (!livingAdoptiveCustodian(child, humans)) {
        child.adoptiveMotherId = undefined;
        child.adoptiveFatherId = undefined;
      }
      return false;
    }
    child.adoptiveMotherId = undefined;
    child.adoptiveFatherId = undefined;
  }

  if (hasLivingNaturalCustodian(child, humans)) return false;

  if (livingAdoptiveCustodian(child, humans)) return false;

  child.adoptiveMotherId = undefined;
  child.adoptiveFatherId = undefined;

  const couple = pickRandomAdoptiveCouple(child, humans);
  if (couple) {
    child.adoptiveMotherId = couple.mother.id;
    child.adoptiveFatherId = couple.father.id;
    couple.mother.childrenIds ??= [];
    couple.father.childrenIds ??= [];
    if (!couple.mother.childrenIds.includes(child.id)) couple.mother.childrenIds.push(child.id);
    if (!couple.father.childrenIds.includes(child.id)) couple.father.childrenIds.push(child.id);
    return true;
  }

  const guardian = pickRandomAdoptiveGuardian(child, humans);
  if (guardian) {
    if (guardian.gender === 'female') {
      child.adoptiveMotherId = guardian.id;
    } else {
      child.adoptiveFatherId = guardian.id;
    }
    guardian.childrenIds ??= [];
    if (!guardian.childrenIds.includes(child.id)) guardian.childrenIds.push(child.id);
    return true;
  }

  return placeOrphanInHouse(child, humans, residences);
}

export function pickResidenceFromChildCustodian(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  const custodian = getChildCustodian(child, humans);
  if (!custodian || !hasResidenceAssignment(custodian)) return undefined;
  const residence = residences.find((b) => b.id === custodian.residenceBuildingId);
  if (!residence || !residenceRoomFor(child, residence, humans)) return undefined;
  return custodian.residenceBuildingId;
}

/** Married couples + children form one household; lone settlers are a household of one. */
export function collectFamilyMembers(
  seed: Entity,
  humans: Entity[],
  visited: Set<number>,
): Entity[] {
  const family: Entity[] = [];
  const queue: Entity[] = [seed];

  while (queue.length > 0) {
    const human = queue.pop()!;
    if (visited.has(human.id)) continue;
    visited.add(human.id);
    family.push(human);

    const partner = livingHuman(humans, human.partnerId);
    if (partner && !visited.has(partner.id)) queue.push(partner);

    const mother = livingHuman(humans, human.motherId);
    if (mother && !visited.has(mother.id)) queue.push(mother);

    const father = livingHuman(humans, human.fatherId);
    if (father && !visited.has(father.id)) queue.push(father);

    for (const childId of human.childrenIds ?? []) {
      const child = livingHuman(humans, childId);
      if (child && !visited.has(child.id)) queue.push(child);
    }

    for (const other of humans) {
      if (other.motherId === human.id || other.fatherId === human.id) {
        if (!visited.has(other.id)) queue.push(other);
      }
    }
  }

  return family;
}



/** Housing assignment units — minors follow custodian; adults 18+ form their own household. */
export function buildHousingUnits(humans: Entity[]): Entity[][] {
  const alive = humans.filter((h) => h.alive && !h.faction);
  const visited = new Set<number>();
  const units: Entity[][] = [];
  const childrenByCustodian = new Map<number, Entity[]>();

  for (const child of alive) {
    if (!isMinorChild(child)) continue;
    const custodian = getChildCustodian(child, humans);
    if (!custodian) continue;
    const bucket = childrenByCustodian.get(custodian.id) ?? [];
    bucket.push(child);
    childrenByCustodian.set(custodian.id, bucket);
  }

  for (const [custodianId, children] of childrenByCustodian) {
    const custodian = alive.find((h) => h.id === custodianId);
    if (!custodian) continue;

    const unit: Entity[] = [custodian];
    visited.add(custodian.id);
    const partner = livingHuman(alive, custodian.partnerId);
    if (partner && !visited.has(partner.id)) {
      unit.push(partner);
      visited.add(partner.id);
    }
    for (const child of children.sort((a, b) => a.id - b.id)) {
      if (!visited.has(child.id)) {
        unit.push(child);
        visited.add(child.id);
      }
    }
    units.push(unit);
  }

  for (const human of alive.sort((a, b) => a.id - b.id)) {
    if (visited.has(human.id)) continue;
    const unit = collectOwnHousehold(human, alive);
    for (const member of unit) visited.add(member.id);
    units.push(unit);
  }

  return units;
}

export function isAdultChildAtHome(human: Entity, humans: Entity[]): boolean {
  if (!human.alive || human.faction || human.isJuvenile) return false;
  if (human.age < HUMAN_MOVE_OUT_MIN_AGE) return false;
  if (!hasResidenceAssignment(human)) return false;

  const parents = [livingHuman(humans, human.motherId), livingHuman(humans, human.fatherId)]
    .filter((p): p is Entity => !!p && hasResidenceAssignment(p));

  return parents.some((p) => p.residenceBuildingId === human.residenceBuildingId);
}

export function canMoveOutOfFamilyHome(
  human: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  if (!isAdultChildAtHome(human, humans)) return false;
  const household = collectOwnHousehold(human, humans);
  return residences.some(
    (r) =>
      countResidentsInBuilding(humans, r.id) === 0
      && familyFitsInResidence(household, r, humans),
  );
}

export function tryMoveOutOfFamilyHome(
  human: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  if (!canMoveOutOfFamilyHome(human, humans, residences)) return false;

  const household = collectOwnHousehold(human, humans);
  const target = residences.find(
    (r) =>
      countResidentsInBuilding(humans, r.id) === 0
      && familyFitsInResidence(household, r, humans),
  );
  if (!target) return false;

  for (const member of household) member.residenceBuildingId = target.id;
  return true;
}

/** When a new empty house appears, adult children still at home may move into their own place. */
export function rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable(
  humans: Entity[],
  residences: Building[],
): void {
  let emptyHomeIds = residences
    .filter((r) => !isLeaderHouseResidence(r) && countResidentsInBuilding(humans, r.id) === 0)
    .map((r) => r.id);
  if (emptyHomeIds.length === 0) return;

  const leaderHouseIds = new Set(
    residences.filter(isLeaderHouseResidence).map((r) => r.id),
  );
  const candidates = humans
    .filter(
      (h) =>
        isAdultChildAtHome(h, humans)
        && (h.residenceBuildingId == null || !leaderHouseIds.has(h.residenceBuildingId)),
    )
    .sort((a, b) => b.age - a.age || a.id - b.id);

  const moved = new Set<number>();
  for (const adult of candidates) {
    if (moved.has(adult.id)) continue;
    if (emptyHomeIds.length === 0) return;

    const household = collectOwnHousehold(adult, humans);
    if (household.some((m) => moved.has(m.id))) continue;
    if (!tryMoveOutOfFamilyHome(adult, humans, residences)) continue;

    const newHomeId = adult.residenceBuildingId;
    if (newHomeId != null) {
      emptyHomeIds = emptyHomeIds.filter((id) => id !== newHomeId);
    }
    for (const member of household) moved.add(member.id);
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

export function buildFamilyGroups(humans: Entity[]): Entity[][] {
  const visited = new Set<number>();
  const families: Entity[][] = [];

  const sorted = [...humans].sort((a, b) => a.id - b.id);
  for (const human of sorted) {
    if (visited.has(human.id)) continue;
    const family = collectFamilyMembers(human, humans, visited);
    families.push(family);
  }

  return families.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return Math.min(...a.map((m) => m.id)) - Math.min(...b.map((m) => m.id));
  });
}

function familyAlreadyInResidence(family: Entity[], residenceId: number): number {
  return family.filter((m) => m.residenceBuildingId === residenceId).length;
}

function familyFitsInResidence(
  family: Entity[],
  residence: Building,
  humans: Entity[],
  occupancy?: ResidenceOccupancy,
): boolean {
  const cap = getResidenceCapacity(residence);
  const count = countResidentsInBuilding(humans, residence.id, occupancy);
  const alreadyHere = familyAlreadyInResidence(family, residence.id);
  const outsiders = count - alreadyHere;
  return outsiders + family.length <= cap;
}

function isLoneSettler(family: Entity[], humans: Entity[]): boolean {
  if (family.length !== 1) return false;
  if (family[0].isJuvenile) return false;
  return !livingHuman(humans, family[0].partnerId);
}

function unitResidenceId(unit: Entity[]): number | undefined {
  const ids = new Set(unit.map((m) => m.residenceBuildingId).filter((id): id is number => id != null));
  if (ids.size !== 1) return undefined;
  return [...ids][0];
}

function unitSharesResidenceWithOutsiders(
  unit: Entity[],
  humans: Entity[],
  residenceId: number,
): boolean {
  const unitIds = new Set(unit.map((m) => m.id));
  return humans.some(
    (h) => h.alive && !h.faction && h.residenceBuildingId === residenceId && !unitIds.has(h.id),
  );
}

function hasEmptyResidenceForUnit(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  return residences.some(
    (r) =>
      !isLeaderHouseResidence(r)
      && countResidentsInBuilding(humans, r.id, occupancy) === 0
      && familyFitsInResidence(unit, r, humans, occupancy),
  );
}

/** Another home that fits this lone adult and hosts only singles (or is empty). */
function hasSinglesOnlyResidenceWithRoom(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
  excludeResidenceId?: number,
  occupancy?: ResidenceOccupancy,
): boolean {
  return residences.some((r) => {
    if (isLeaderHouseResidence(r)) return false;
    if (excludeResidenceId != null && r.id === excludeResidenceId) return false;
    if (!familyFitsInResidence(unit, r, humans, occupancy)) return false;
    const count = countResidentsInBuilding(humans, r.id, occupancy);
    if (count === 0) return true;
    return residenceHostsOnlySingles(r.id, humans);
  });
}

function loneSingleSharesWithFamily(
  unit: Entity[],
  humans: Entity[],
  residenceId: number,
): boolean {
  if (!isLoneSettler(unit, humans)) return false;
  if (!unitSharesResidenceWithOutsiders(unit, humans, residenceId)) return false;
  return residenceHostsCouple(residenceId, humans);
}

/** Household already has a valid home but should take a dedicated empty house instead of sharing. */
export function isUnnecessarilySharingHousing(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  if (!isFamilyHousingValid(unit, residences, humans, occupancy)) return false;
  const homeId = unitResidenceId(unit);
  if (homeId == null) return false;

  const home = residences.find((r) => r.id === homeId);
  // The leader's household is placed by office, never "unnecessarily sharing".
  if (home && isLeaderHouseResidence(home)) return false;

  if (isLoneSettler(unit, humans)) {
    if (!loneSingleSharesWithFamily(unit, humans, homeId)) return false;
    return (
      hasEmptyResidenceForUnit(unit, humans, residences, occupancy)
      || hasSinglesOnlyResidenceWithRoom(unit, humans, residences, homeId, occupancy)
    );
  }

  if (!hasEmptyResidenceForUnit(unit, humans, residences, occupancy)) return false;
  if (countResidentsInBuilding(humans, homeId, occupancy) <= unit.length) return false;
  return unitSharesResidenceWithOutsiders(unit, humans, homeId);
}

/** Scan for households sharing a residence while better homes exist. */
export function auditHousingSharingIssues(
  humans: Entity[],
  buildings: Building[],
): string[] {
  const alive = humans.filter((h) => h.alive && !h.faction);
  const residences = buildings.filter(isResidenceBuilding);
  const emptyCount = residences.filter((r) => countResidentsInBuilding(alive, r.id) === 0).length;

  const issues: string[] = [];
  for (const unit of buildHousingUnits(alive)) {
    if (!isUnnecessarilySharingHousing(unit, alive, residences)) continue;
    const homeId = unitResidenceId(unit);
    if (homeId == null) continue;
    const label = unit.map((m) => m.name ?? `settler#${m.id}`).join(', ');
    if (emptyCount > 0) {
      issues.push(
        `${label} share house #${homeId} while ${emptyCount} empty house(s) are available`,
      );
      continue;
    }
    issues.push(
      `${label} bunk with a family in house #${homeId} while a singles-only house has open beds`,
    );
  }
  return issues;
}

/** Whether a housing unit should leave its current residence and be re-placed. */
export function housingUnitNeedsReassignment(
  unit: Entity[],
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  if (!isFamilyHousingValid(unit, residences, alive, occupancy)) return true;
  const homeId = unitResidenceId(unit);
  if (homeId == null) return true;

  // The leader's household keeps the manor until leadership changes (leaderHouse.ts).
  const home = residences.find((r) => r.id === homeId);
  if (home && isLeaderHouseResidence(home)) return false;

  if (isLoneSettler(unit, alive)) {
    if (!unitSharesResidenceWithOutsiders(unit, alive, homeId)) return false;
    if (hasEmptyResidenceForUnit(unit, alive, residences, occupancy)) return true;
    if (
      residenceHostsCouple(homeId, alive)
      && hasSinglesOnlyResidenceWithRoom(unit, alive, residences, homeId, occupancy)
    ) {
      return true;
    }
    return false;
  }

  if (!hasEmptyResidenceForUnit(unit, alive, residences, occupancy)) return false;
  if (countResidentsInBuilding(alive, homeId, occupancy) === unit.length) return false;
  return unitSharesResidenceWithOutsiders(unit, alive, homeId);
}

function sortHousingUnitsForAssignment(
  units: Entity[][],
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): Entity[][] {
  // Cache reassignment priority once — comparator must not recompute O(R) checks.
  const needReassign = units.map((u) => housingUnitNeedsReassignment(u, alive, residences, occupancy));
  return units
    .map((unit, i) => ({ unit, need: needReassign[i] ? 0 : 1, len: unit.length }))
    .sort((a, b) => {
      const d = a.need - b.need;
      if (d !== 0) return d;
      return b.len - a.len;
    })
    .map((x) => x.unit);
}

function residenceHostsCouple(residenceId: number, humans: Entity[]): boolean {
  const occupants = humans.filter(
    (h) => h.alive && !h.faction && h.residenceBuildingId === residenceId,
  );
  for (const occupant of occupants) {
    if (!occupant.partnerId) continue;
    if (occupants.some((p) => p.id === occupant.partnerId)) return true;
  }
  return false;
}

function residenceHasMinorOccupants(residenceId: number, humans: Entity[]): boolean {
  return humans.some(
    (h) => h.alive && !h.faction && h.residenceBuildingId === residenceId && isMinorChild(h),
  );
}

function residenceHostsOnlySingles(residenceId: number, humans: Entity[]): boolean {
  if (residenceHasMinorOccupants(residenceId, humans)) return false;
  const adults = humans.filter(
    (h) => h.alive && !h.faction && !h.isJuvenile && h.residenceBuildingId === residenceId,
  );
  if (adults.length === 0) return false;
  return !residenceHostsCouple(residenceId, humans);
}

function anyOpenBeds(
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  return residences.some(
    (r) =>
      !isLeaderHouseResidence(r)
      && countResidentsInBuilding(humans, r.id, occupancy) < getResidenceCapacity(r),
  );
}

/** Any house that fits the whole household — used when empty homes are gone. */
function pickSharedResidenceForFamily(
  family: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): number | undefined {
  let best: Building | undefined;
  let bestScore = Infinity;

  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    if (!familyFitsInResidence(family, residence, humans, occupancy)) continue;

    const count = countResidentsInBuilding(humans, residence.id, occupancy);
    const alreadyHere = familyAlreadyInResidence(family, residence.id);
    const outsiders = count - alreadyHere;
    const score = outsiders * 10 + count;

    if (score < bestScore || (score === bestScore && residence.id < (best?.id ?? Infinity))) {
      bestScore = score;
      best = residence;
    }
  }

  return best?.id;
}

/** Couples/families prefer their own empty house; lone singles may share with couples or other singles. */
export function pickResidenceForFamily(
  family: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): number | undefined {
  if (residences.length === 0 || family.length === 0) return undefined;

  const loneSingle = isLoneSettler(family, humans);
  const hasMinor = family.some((m) => isMinorChild(m));
  // Prefer map-backed empty checks when occupancy is provided (EK-E2).
  const anyEmptyHouse = residences.some(
    (r) => !isLeaderHouseResidence(r) && countResidentsInBuilding(humans, r.id, occupancy) === 0,
  );
  const housingShortage = !anyEmptyHouse || !anyOpenBeds(humans, residences, occupancy);

  let best: Building | undefined;
  let bestScore = Infinity;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    if (!familyFitsInResidence(family, residence, humans, occupancy)) continue;

    const count = countResidentsInBuilding(humans, residence.id, occupancy);
    const alreadyHere = familyAlreadyInResidence(family, residence.id);
    const outsiders = count - alreadyHere;
    const cap = getResidenceCapacity(residence);
    const largeFamilyBonus = family.length > 4 ? cap * 10 : 0;

    const singlesAlternative = residences.some(
      (r) =>
        r.id !== residence.id
        && !isLeaderHouseResidence(r)
        && familyFitsInResidence(family, r, humans, occupancy)
        && (countResidentsInBuilding(humans, r.id, occupancy) === 0
          || residenceHostsOnlySingles(r.id, humans)),
    );

    let score: number;
    if (loneSingle) {
      if (count === 0) {
        score = -100;
      } else if (anyEmptyHouse) {
        // Empty homes available — only use shared housing when every house is occupied.
        score = 1000 + outsiders * 100 + count;
      } else if (residenceHostsOnlySingles(residence.id, humans)) {
        score = alreadyHere > 0 ? 50 + count : count;
      } else if (residenceHostsCouple(residence.id, humans)) {
        if (singlesAlternative) {
          score = 10_000 + outsiders * 100 + count;
        } else {
          score = 100 + outsiders;
        }
      } else if (alreadyHere > 0) {
        score = 50 + count;
      } else {
        score = outsiders * 1000 + count;
      }
    } else if (housingShortage) {
      // No empty homes (or every bed taken) — keep households together in shared houses.
      score = outsiders * 10 + count - largeFamilyBonus;
    } else {
      score = outsiders * 1000 + count - largeFamilyBonus;
    }

    if (hasMinor && residenceHostsOnlySingles(residence.id, humans)) {
      score += 10_000;
    }

    if (score < bestScore || (score === bestScore && residence.id < (best?.id ?? Infinity))) {
      bestScore = score;
      best = residence;
    }
  }
  return best?.id;
}

function isFamilyHousingValid(
  family: Entity[],
  residences: Building[],
  humans: Entity[],
  occupancy?: ResidenceOccupancy,
): boolean {
  const assigned = family.filter((m) => m.residenceBuildingId !== undefined);
  if (assigned.length === 0) return false;
  if (assigned.length !== family.length) return false;

  const houseId = assigned[0].residenceBuildingId!;
  if (!assigned.every((m) => m.residenceBuildingId === houseId)) return false;

  const residence = residences.find((b) => b.id === houseId);
  if (!residence) return false;

  return familyFitsInResidence(family, residence, humans, occupancy);
}

export function pickResidenceForHumanExcluding(
  human: Entity,
  humans: Entity[],
  residences: Building[],
  excludeResidenceIds: Iterable<number> = [],
): number | undefined {
  const exclude = new Set(excludeResidenceIds);
  const filtered = residences.filter((r) => !exclude.has(r.id));
  if (filtered.length === 0) return undefined;
  return pickResidenceForHuman(human, humans, filtered);
}

export function pickResidenceForHuman(
  human: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): number | undefined {
  if (residences.length === 0) return undefined;

  const household = isMinorChild(human) ? [human] : collectOwnHousehold(human, humans);
  const familyHouse = pickResidenceForFamily(household, humans, residences, occupancy);
  if (familyHouse !== undefined) return familyHouse;

  if (human.partnerId) {
    const partner = humans.find((h) => h.id === human.partnerId && h.alive);
    if (partner && hasResidenceAssignment(partner)) {
      const partnerResidence = residences.find((b) => b.id === partner.residenceBuildingId);
      if (partnerResidence && residenceRoomFor(human, partnerResidence, humans, occupancy)) {
        return partner.residenceBuildingId;
      }
    }
  }

  if (isMinorChild(human)) {
    const custodianHome = pickResidenceFromChildCustodian(human, humans, residences);
    if (custodianHome !== undefined) return custodianHome;
  }

  const crowdOpts: PickResidenceOptions = isMinorChild(human) ? { forbidSinglesOnly: true } : {};
  return pickLeastCrowdedResidence(humans, residences, 1, crowdOpts, occupancy);
}

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

/** Evict whole families from overcrowded houses (keeps households together). */
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
interface PickResidenceOptions {
  forbidSinglesOnly?: boolean;
}
