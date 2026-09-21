import type { Building, Entity } from './gameTypes';
import { LEADER_OCCUPATION } from './gameTypes';
import type { ResidenceOccupancy } from './residencyOccupancy';
import {
  collectFamilyMembers,
  collectMinorHousehold,
  collectOwnHousehold,
  getChildCustodian,
  isAdultChildAtHome,
  isMinorChild,
} from './householdComposition';
import { HUMAN_ADULT_MIN_AGE } from './dayCycleConstants';
import {
  isResidenceBuilding,
  isLeaderHouseResidence,
  getResidenceCapacity,
  hasResidenceAssignment,
  countResidentsInBuilding,
  residenceRoomFor,
} from './residencyOccupancy';
import { isPlayerHuman } from './playerHuman';

const HOUSING_SCORES = {
  EMPTY_HOUSE_BONUS: -100,
  COUPLE_HOST_BONUS: -50,
  SINGLES_ALREADY_HOSTED: 50,
  COUPLE_HOST_PENALTY: 100,
  OUTSIDER_MULTIPLIER_NORMAL: 1000,
  OUTSIDER_MULTIPLIER_SHORTAGE: 10,
  MINOR_IN_SINGLES_PENALTY: 10_000,
  SINGLES_ALTERNATIVE_PENALTY: 10_000,
} as const;

interface PickResidenceOptions {
  forbidSinglesOnly?: boolean;
}

export function listPlayerResidences(buildings: Building[]): Building[] {
  return buildings.filter((b) => isResidenceBuilding(b) && b.faction !== 'rival');
}

function findLivingHuman(humans: Entity[], id: number | undefined): Entity | undefined {
  if (id === undefined) return undefined;
  return humans.find((h) => h.id === id && h.alive);
}

function findHumanRecord(humans: Entity[], id: number | undefined): Entity | undefined {
  if (id == null) return undefined;
  return humans.find((h) => h.id === id);
}

/**
 * The one least-crowded-residence rule. Exported because `residencyReconciliation.pickSharedResidence`
 * asks this owner for its verdict instead of re-implementing the loop (duplication A2).
 */
export function pickLeastCrowdedResidence(
  humans: Entity[],
  residences: Building[],
  extraSlots = 1,
  options: PickResidenceOptions = {},
  occupancy?: ResidenceOccupancy,
  /**
   * Movers who are already counted as residents of a candidate. When they move *together* to the home
   * one of them already lives in, that home counts them once, not twice — this is the eligibility
   * accounting `residencyReconciliation.pickSharedResidence` needs, and the reason that rule is no
   * longer re-implemented there (`LIVE-FINDINGS-STATUS.md`, duplication A2).
   */
  movingTogether: readonly Entity[] = [],
): number | undefined {
  let best: Building | undefined;
  let bestCount = Infinity;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    if (options.forbidSinglesOnly && residenceHostsOnlySingles(residence.id, humans)) continue;
    const cap = getResidenceCapacity(residence);
    let count = countResidentsInBuilding(humans, residence.id, occupancy);
    let slots = extraSlots;
    for (const mover of movingTogether) {
      if (mover.residenceBuildingId === residence.id) {
        count--;
        slots--;
      }
    }
    if (count + slots > cap) continue;
    if (count < bestCount || (count === bestCount && residence.id < (best?.id ?? Infinity))) {
      bestCount = count;
      best = residence;
    }
  }
  return best?.id;
}

function livingAdoptiveCustodian(child: Entity, humans: Entity[]): Entity | undefined {
  const adoptiveMother = findLivingHuman(humans, child.adoptiveMotherId);
  if (adoptiveMother) return adoptiveMother;
  return findLivingHuman(humans, child.adoptiveFatherId);
}

/**
 * Married couples that may adopt. The Leader's House is excluded here, not only in
 * `pickOrphanResidence`: the housing rule already refuses to place an orphan in the manor, but
 * adoption is a second path into the same household — `syncLeaderHouseResidency` force-moves every
 * member of the leader's household into the manor, so adopting an orphan into the leader's couple
 * put the child exactly where the housing rule had just said it must not go
 * (`BUG_REPORTS/2026-09-20-orphans-adopted-into-the-leaders-house.md`).
 */
function listVillageCouples(humans: Entity[]): Array<{ mother?: Entity; father?: Entity; partnerA: Entity; partnerB: Entity }> {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
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

function pickRandomAdoptiveCouple(
  child: Entity,
  humans: Entity[],
): { mother?: Entity; father?: Entity; partnerA: Entity; partnerB: Entity } | undefined {
  const couples = listVillageCouples(humans);
  if (couples.length === 0) return undefined;
  const idx = Math.abs(child.id * 7919) % couples.length;
  return couples[idx];
}

function listVillageSingleAdults(humans: Entity[]): Entity[] {
  const alive = humans.filter(
    (h) => h.alive && isPlayerHuman(h) && !h.isJuvenile && h.age >= HUMAN_ADULT_MIN_AGE,
  );
  return alive.filter((h) => !findLivingHuman(alive, h.partnerId));
}

function pickRandomAdoptiveGuardian(child: Entity, humans: Entity[]): Entity | undefined {
  const singles = listVillageSingleAdults(humans).sort((a, b) => a.id - b.id);
  if (singles.length === 0) return undefined;
  return singles[Math.abs(child.id * 7919) % singles.length];
}

function hasLivingNaturalCustodian(child: Entity, humans: Entity[]): boolean {
  if (findLivingHuman(humans, child.motherId)) return true;
  if (findLivingHuman(humans, child.fatherId)) return true;

  if (child.isBastard) {
    const motherRecord = findHumanRecord(humans, child.motherId);
    if (motherRecord?.motherId != null && findLivingHuman(humans, motherRecord.motherId)) return true;
    const fatherRecord = findHumanRecord(humans, child.fatherId);
    if (fatherRecord?.motherId != null && findLivingHuman(humans, fatherRecord.motherId)) return true;
  }

  return false;
}

function pickOrphanResidence(
  child: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): number | undefined {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  const custodianHome = pickResidenceFromChildCustodian(child, humans, residences, occupancy);
  if (custodianHome !== undefined) return custodianHome;

  let best: Building | undefined;
  let bestScore = Infinity;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    if (!residenceRoomFor(child, residence, alive, occupancy)) continue;
    if (residenceHostsOnlySingles(residence.id, alive)) continue;
    const count = countResidentsInBuilding(alive, residence.id, occupancy);
    let score = count;
    if (count === 0) score += HOUSING_SCORES.EMPTY_HOUSE_BONUS;
    if (residenceHostsCouple(residence.id, alive)) score += HOUSING_SCORES.COUPLE_HOST_BONUS;
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
  occupancy?: ResidenceOccupancy,
): boolean {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  if (hasResidenceAssignment(child)) {
    const current = residences.find((b) => b.id === child.residenceBuildingId);
    if (current && residenceRoomFor(child, current, alive, occupancy)) return true;
  }

  const picked =
    pickOrphanResidence(child, humans, residences, occupancy) ??
    pickLeastCrowdedResidence(alive, residences, 1, { forbidSinglesOnly: true }, occupancy);
  if (picked === undefined) return false;

  child.residenceBuildingId = picked;
  return true;
}

export function ensureOrphanAdoption(
  child: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  if (!child.alive || child.faction || !isMinorChild(child)) return false;

  if (hasLivingNaturalCustodian(child, humans)) {
    child.adoptiveMotherId = undefined;
    child.adoptiveFatherId = undefined;
    return false;
  }

  if (livingAdoptiveCustodian(child, humans)) {
    return false;
  }

  child.adoptiveMotherId = undefined;
  child.adoptiveFatherId = undefined;

  const couple = pickRandomAdoptiveCouple(child, humans);
  if (couple) {
    const motherId = couple.mother?.id ?? couple.partnerA.id;
    const fatherId = couple.father?.id ?? couple.partnerB.id;

    child.adoptiveMotherId = motherId;
    child.adoptiveFatherId = fatherId;
    // An adopted child joins the family in name as well as in the tree: the family tree and the
    // Families browser group by surname, so a birth surname here reads as a guest at home.
    const coupleSurname = couple.father?.surname ?? couple.mother?.surname;
    if (coupleSurname) child.surname = coupleSurname;

    couple.partnerA.childrenIds ??= [];
    couple.partnerB.childrenIds ??= [];
    if (!couple.partnerA.childrenIds.includes(child.id)) couple.partnerA.childrenIds.push(child.id);
    if (!couple.partnerB.childrenIds.includes(child.id)) couple.partnerB.childrenIds.push(child.id);
    return true;
  }

  const guardian = pickRandomAdoptiveGuardian(child, humans);
  if (guardian) {
    if (guardian.gender === 'female') {
      child.adoptiveMotherId = guardian.id;
    } else {
      child.adoptiveFatherId = guardian.id;
    }
    if (guardian.surname) child.surname = guardian.surname;
    guardian.childrenIds ??= [];
    if (!guardian.childrenIds.includes(child.id)) guardian.childrenIds.push(child.id);
    return true;
  }

  return placeOrphanInHouse(child, humans, residences, occupancy);
}

export function pickResidenceFromChildCustodian(
  child: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): number | undefined {
  const custodian = getChildCustodian(child, humans);
  if (!custodian || !hasResidenceAssignment(custodian)) return undefined;
  const residence = residences.find((b) => b.id === custodian.residenceBuildingId);
  if (!residence || !residenceRoomFor(child, residence, humans, occupancy)) return undefined;
  return custodian.residenceBuildingId;
}

export function buildHousingUnits(humans: Entity[]): Entity[][] {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
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

  // A settler may appear in exactly one unit. Custodians are visited in bucket order, and a
  // settler can be the custodian of one bucket *and* the partner (or a member) of another —
  // for example a widower adding his late partner's child, and his new partner adding hers.
  // The old loop had no guard, so the second bucket re-added the already-visited settler and
  // produced two units claiming one person: each unit's reassignment invalidated the other,
  // `reassigned` never reached 0 and the convergence loop burned all its passes 4×/day,
  // leaving that settler housed away from one half of the family.
  const unitByMember = new Map<number, Entity[]>();
  const claim = (unit: Entity[], member: Entity) => {
    unit.push(member);
    visited.add(member.id);
    unitByMember.set(member.id, unit);
  };

  for (const [custodianId, children] of childrenByCustodian) {
    const custodian = alive.find((h) => h.id === custodianId);
    if (!custodian) continue;

    // Reuse the unit that already holds this custodian (if any) so their children join
    // their parent's household instead of forming a competing unit — or being dropped.
    let unit = unitByMember.get(custodian.id);
    if (!unit) {
      unit = [];
      claim(unit, custodian);
      const partner = findLivingHuman(alive, custodian.partnerId);
      if (partner && !visited.has(partner.id)) claim(unit, partner);
      units.push(unit);
    }
    for (const child of children.sort((a, b) => a.id - b.id)) {
      if (!visited.has(child.id)) claim(unit, child);
    }
  }

  for (const human of alive.sort((a, b) => a.id - b.id)) {
    if (visited.has(human.id)) continue;
    // The fallback unit is the settler, a living partner and their *minor* children.
    // `collectOwnHousehold` also walks `childrenIds` with no age filter, so a parent whose
    // children had all grown up formed a unit spanning two houses; `isFamilyHousingValid`
    // then failed and the convergence loop re-homed the whole unit together, silently
    // undoing the adult-child move-out on every pass (it could never persist).
    const unit = collectMinorHousehold(human, alive);
    for (const member of unit) visited.add(member.id);
    units.push(unit);
  }

  return units;
}

export function canMoveOutOfFamilyHome(
  human: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  if (!isAdultChildAtHome(human, humans)) return false;
  const household = collectOwnHousehold(human, humans);
  return residences.some(
    (r) =>
      countResidentsInBuilding(humans, r.id, occupancy) === 0 &&
      familyFitsInResidence(household, r, humans, occupancy),
  );
}

export function tryMoveOutOfFamilyHome(
  human: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  if (!isAdultChildAtHome(human, humans)) return false;

  const household = collectOwnHousehold(human, humans);
  // One scan instead of two. `canMoveOutOfFamilyHome` used to run this exact predicate as a
  // `.some()`, and the `.find()` below then repeated it over the same residences with a freshly
  // rebuilt (identical) household — nothing between them mutates `humans`, `residences` or
  // `occupancy`. `some(pred)` and `find(pred) !== undefined` select the same verdict, and the target
  // is still the first match, so both the result and the chosen building are unchanged.
  const target = residences.find(
    (r) =>
      countResidentsInBuilding(humans, r.id, occupancy) === 0 &&
      familyFitsInResidence(household, r, humans, occupancy),
  );
  if (!target) return false;

  for (const member of household) member.residenceBuildingId = target.id;
  return true;
}

export function rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable(
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): void {
  let emptyHomeIds = residences
    .filter(
      (r) =>
        !isLeaderHouseResidence(r) &&
        r.faction !== 'rival' &&
        countResidentsInBuilding(humans, r.id, occupancy) === 0,
    )
    .map((r) => r.id);
  if (emptyHomeIds.length === 0) return;

  const leaderHouseIds = new Set(residences.filter(isLeaderHouseResidence).map((r) => r.id));
  // One id → entity index for the whole candidate filter: `isAdultChildAtHome` scans the list twice
  // per candidate (mother, father), so without this the filter below was O(settlers²) per assign
  // pulse.
  const humansById = new Map<number, Entity>();
  for (let i = 0; i < humans.length; i++) humansById.set(humans[i].id, humans[i]);
  const candidates = humans
    .filter(
      (h) =>
        isAdultChildAtHome(h, humans, humansById) &&
        (h.residenceBuildingId == null || !leaderHouseIds.has(h.residenceBuildingId)),
    )
    .sort((a, b) => b.age - a.age || a.id - b.id);

  const moved = new Set<number>();
  for (const adult of candidates) {
    if (moved.has(adult.id)) continue;
    if (emptyHomeIds.length === 0) return;

    const household = collectOwnHousehold(adult, humans);
    if (household.some((m) => moved.has(m.id))) continue;
    if (!tryMoveOutOfFamilyHome(adult, humans, residences, occupancy)) continue;

    const newHomeId = adult.residenceBuildingId;
    if (newHomeId != null) {
      emptyHomeIds = emptyHomeIds.filter((id) => id !== newHomeId);
    }
    for (const member of household) moved.add(member.id);
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
  return !findLivingHuman(humans, family[0].partnerId);
}

function unitResidenceId(unit: Entity[]): number | undefined {
  const ids = new Set(
    unit.map((m) => m.residenceBuildingId).filter((id): id is number => id != null),
  );
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
    (h) => h.alive && isPlayerHuman(h) && h.residenceBuildingId === residenceId && !unitIds.has(h.id),
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
      !isLeaderHouseResidence(r) &&
      countResidentsInBuilding(humans, r.id, occupancy) === 0 &&
      familyFitsInResidence(unit, r, humans, occupancy),
  );
}

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

/** Determines if a unit should vacate its current residence in favour of a better option. */
export function housingUnitNeedsReassignment(
  unit: Entity[],
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  if (!isFamilyHousingValid(unit, residences, alive, occupancy)) return true;
  const homeId = unitResidenceId(unit);
  if (homeId == null) return true;

  const home = residences.find((r) => r.id === homeId);
  if (home && isLeaderHouseResidence(home)) return false;

  if (isLoneSettler(unit, alive)) {
    if (!unitSharesResidenceWithOutsiders(unit, alive, homeId)) return false;
    if (hasEmptyResidenceForUnit(unit, alive, residences, occupancy)) return true;
    if (
      residenceHostsCouple(homeId, alive) &&
      hasSinglesOnlyResidenceWithRoom(unit, alive, residences, homeId, occupancy)
    ) {
      return true;
    }
    return false;
  }

  if (!hasEmptyResidenceForUnit(unit, alive, residences, occupancy)) return false;
  if (countResidentsInBuilding(alive, homeId, occupancy) === unit.length) return false;
  return unitSharesResidenceWithOutsiders(unit, alive, homeId);
}

export function isUnnecessarilySharingHousing(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  return housingUnitNeedsReassignment(unit, humans, residences, occupancy);
}

export function auditHousingSharingIssues(humans: Entity[], buildings: Building[]): string[] {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  // Player housing only, and never the Leader's House: rival-camp houses count 0 *player*
  // residents and the manor is never a placement target, so counting either as an "empty
  // house available" reported sharing that no picker could actually resolve.
  const residences = buildings.filter(
    (b) => isResidenceBuilding(b) && !isLeaderHouseResidence(b) && b.faction !== 'rival',
  );
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

export function sortHousingUnitsForAssignment(
  units: Entity[][],
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): Entity[][] {
  const needReassign = units.map((u) =>
    housingUnitNeedsReassignment(u, alive, residences, occupancy),
  );
  return units
    .map((unit, i) => ({ unit, need: needReassign[i] ? 0 : 1, len: unit.length }))
    .sort((a, b) => a.need - b.need || b.len - a.len)
    .map((x) => x.unit);
}

function residenceHostsCouple(residenceId: number, humans: Entity[]): boolean {
  const occupants = humans.filter(
    (h) => h.alive && isPlayerHuman(h) && h.residenceBuildingId === residenceId,
  );
  // "is this occupant's partner also in the house?" — a Set lookup instead of a `.some` over the
  // same array per occupant. Callers ask this per residence (up to four times per picker call) from
  // inside the residency convergence loop, so the quadratic inner scan was multiplied by the number
  // of residences and passes.
  const occupantIds = new Set<number>();
  for (let i = 0; i < occupants.length; i++) occupantIds.add(occupants[i].id);
  for (let i = 0; i < occupants.length; i++) {
    const occupant = occupants[i];
    if (!occupant.partnerId) continue;
    if (occupantIds.has(occupant.partnerId)) return true;
  }
  return false;
}

function residenceHasMinorOccupants(residenceId: number, humans: Entity[]): boolean {
  return humans.some(
    (h) => h.alive && isPlayerHuman(h) && h.residenceBuildingId === residenceId && isMinorChild(h),
  );
}

function residenceHostsOnlySingles(residenceId: number, humans: Entity[]): boolean {
  if (residenceHasMinorOccupants(residenceId, humans)) return false;
  const adults = humans.filter(
    (h) => h.alive && isPlayerHuman(h) && !h.isJuvenile && h.residenceBuildingId === residenceId,
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
      !isLeaderHouseResidence(r) &&
      countResidentsInBuilding(humans, r.id, occupancy) < getResidenceCapacity(r),
  );
}

export function pickResidenceForFamily(
  family: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): number | undefined {
  if (residences.length === 0 || family.length === 0) return undefined;

  const loneSingle = isLoneSettler(family, humans);
  const hasMinor = family.some((m) => isMinorChild(m));
  
  let emptyHouseCount = 0;
  const singlesFriendlyHouseIds = new Set<number>();

  for (const r of residences) {
    if (isLeaderHouseResidence(r) || r.faction === 'rival') continue;
    const count = countResidentsInBuilding(humans, r.id, occupancy);
    if (count === 0) {
      emptyHouseCount++;
    }
    if (familyFitsInResidence(family, r, humans, occupancy) && (count === 0 || residenceHostsOnlySingles(r.id, humans))) {
      singlesFriendlyHouseIds.add(r.id);
    }
  }

  const anyEmptyHouse = emptyHouseCount > 0;
  const housingShortage = !anyEmptyHouse || !anyOpenBeds(humans, residences, occupancy);

  let best: Building | undefined;
  let bestScore = Infinity;

  for (const residence of residences) {
    if (isLeaderHouseResidence(residence) || residence.faction === 'rival') continue;
    if (!familyFitsInResidence(family, residence, humans, occupancy)) continue;

    const count = countResidentsInBuilding(humans, residence.id, occupancy);
    const alreadyHere = familyAlreadyInResidence(family, residence.id);
    const outsiders = count - alreadyHere;
    const cap = getResidenceCapacity(residence);
    const largeFamilyBonus = family.length > 4 ? cap * 10 : 0;

    // O(1) singles alternative check via pre-aggregated Set
    const hasOtherSinglesFriendlyHouse = singlesFriendlyHouseIds.size > (singlesFriendlyHouseIds.has(residence.id) ? 1 : 0);

    let score: number;
    if (loneSingle) {
      if (count === 0) {
        score = HOUSING_SCORES.EMPTY_HOUSE_BONUS;
      } else if (anyEmptyHouse) {
        score = HOUSING_SCORES.OUTSIDER_MULTIPLIER_NORMAL + outsiders * 100 + count;
      } else if (residenceHostsOnlySingles(residence.id, humans)) {
        score = alreadyHere > 0 ? HOUSING_SCORES.SINGLES_ALREADY_HOSTED + count : count;
      } else if (residenceHostsCouple(residence.id, humans)) {
        if (hasOtherSinglesFriendlyHouse) {
          score = HOUSING_SCORES.SINGLES_ALTERNATIVE_PENALTY + outsiders * 100 + count;
        } else {
          score = HOUSING_SCORES.COUPLE_HOST_PENALTY + outsiders;
        }
      } else if (alreadyHere > 0) {
        score = HOUSING_SCORES.SINGLES_ALREADY_HOSTED + count;
      } else {
        score = outsiders * HOUSING_SCORES.OUTSIDER_MULTIPLIER_NORMAL + count;
      }
    } else if (housingShortage) {
      score = outsiders * HOUSING_SCORES.OUTSIDER_MULTIPLIER_SHORTAGE + count - largeFamilyBonus;
    } else {
      score = outsiders * HOUSING_SCORES.OUTSIDER_MULTIPLIER_NORMAL + count - largeFamilyBonus;
    }

    if (hasMinor && residenceHostsOnlySingles(residence.id, humans)) {
      score += HOUSING_SCORES.MINOR_IN_SINGLES_PENALTY;
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
  if (assigned.length === 0 || assigned.length !== family.length) return false;

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
  occupancy?: ResidenceOccupancy,
): number | undefined {
  const exclude = new Set(excludeResidenceIds);
  const filtered = residences.filter((r) => !exclude.has(r.id));
  if (filtered.length === 0) return undefined;
  return pickResidenceForHuman(human, humans, filtered, occupancy);
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
    const partner = findLivingHuman(humans, human.partnerId);
    if (partner && hasResidenceAssignment(partner)) {
      const partnerResidence = residences.find((b) => b.id === partner.residenceBuildingId);
      if (partnerResidence && residenceRoomFor(human, partnerResidence, humans, occupancy)) {
        return partner.residenceBuildingId;
      }
    }
  }

  if (isMinorChild(human)) {
    const custodianHome = pickResidenceFromChildCustodian(human, humans, residences, occupancy);
    if (custodianHome !== undefined) return custodianHome;
  }

  const crowdOpts: PickResidenceOptions = isMinorChild(human) ? { forbidSinglesOnly: true } : {};
  return pickLeastCrowdedResidence(humans, residences, 1, crowdOpts, occupancy);
}
