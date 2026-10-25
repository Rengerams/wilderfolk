import type { Building, Entity } from './gameTypes';
import { BuildingType } from './gameTypes';
import type { ResidenceOccupancy } from './residencyOccupancy';
import { estimatedCommuteHours, MAX_ASSIGNABLE_COMMUTE_HOURS } from './commuteReach';
import {
  areCloseKin,
  collectFamilyMembers,
  collectMinorHousehold,
  collectOwnHousehold,
  getChildCustodian,
  isAdultChildAtHome,
  isMinorChild,
} from './householdComposition';
import {
  isResidenceBuilding,
  buildResidenceOccupancy,
  isLeaderHouseResidence,
  getResidenceCapacity,
  hasResidenceAssignment,
  countResidentsInBuilding,
  residenceRoomFor,
  isImprisoned,
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
  /** Between two otherwise equal homes, a couple never picks the one holding another couple. */
  OTHER_COUPLE_PENALTY: 20,
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
  traits?: ResidenceTraitsById,
): number | undefined {
  let best: Building | undefined;
  let bestCount = Infinity;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    if (options.forbidSinglesOnly && residenceHostsOnlySingles(residence.id, humans, traits)) continue;
    const cap = getResidenceCapacity(residence);
    const residents = countResidentsInBuilding(humans, residence.id, occupancy);
    let alreadyHere = 0;
    for (const mover of movingTogether) {
      if (mover.residenceBuildingId === residence.id) alreadyHere++;
    }
    // The home holds its current residents plus every mover that is not one of them — a mover
    // already living there is discounted once, from the count or from the slots, never both.
    if (residents + extraSlots - alreadyHere > cap) continue;
    const count = residents - alreadyHere;
    if (count < bestCount || (count === bestCount && residence.id < (best?.id ?? Infinity))) {
      bestCount = count;
      best = residence;
    }
  }
  return best?.id;
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
    const unit = collectMinorHousehold(human, alive).filter((member) => !visited.has(member.id));
    if (unit.length === 0) continue;
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

export function familyFitsInResidence(
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
  traitsIn?: ResidenceTraitsById,
): boolean {
  const traits = traitsFor(humans, traitsIn);
  return residences.some((r) => {
    if (isLeaderHouseResidence(r)) return false;
    if (excludeResidenceId != null && r.id === excludeResidenceId) return false;
    if (!familyFitsInResidence(unit, r, humans, occupancy)) return false;
    const count = countResidentsInBuilding(humans, r.id, occupancy);
    if (count === 0) return true;
    return residenceHostsOnlySingles(r.id, humans, traits);
  });
}

/**
 * Which sweep bucket a housing unit belongs to, from its lowest member id — a stable key, so a unit
 * cannot drift between buckets as its members come and go.
 */
export function housingUnitBucket(unit: Entity[], buckets: number): number {
  let lowest = Infinity;
  for (const member of unit) if (member.id < lowest) lowest = member.id;
  return Number.isFinite(lowest) ? lowest % buckets : 0;
}

/** Determines if a unit should vacate its current residence in favour of a better option. */
export function housingUnitNeedsReassignment(
  unit: Entity[],
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
): boolean {
  const homeId = unitResidenceId(unit);
  const home = residences.find((residence) => residence.id === homeId);
  if (home && isLeaderHouseResidence(home) && unit.every((member) => member.residenceBuildingId === homeId)) return false;
  if (!isFamilyHousingValid(unit, residences, alive, occupancy)) {
    const child = unit.find(isMinorChild);
    const guardian = child ? getChildCustodian(child, alive) : undefined;
    const core = guardian ? unit.filter((member) => member.id === guardian.id || isMinorChild(member)) : [];
    const coreTogether = core.length > 1 && core.every((member) => member.residenceBuildingId === guardian?.residenceBuildingId);
    const coreCannotFit = guardian?.residenceBuildingId != null
      || pickResidenceForFamily(core, alive, residences, occupancy, traits) === undefined;
    const stableShortage = coreTogether && coreCannotFit
      && pickResidenceForFamily(unit, alive, residences, occupancy, traits) === undefined;
    return !stableShortage;
  }
  if (homeId == null) return true;

  if (isLoneSettler(unit, alive)) {
    if (!unitSharesResidenceWithOutsiders(unit, alive, homeId)) return false;
    if (hasEmptyResidenceForUnit(unit, alive, residences, occupancy)) return true;
    if (
      residenceHostsCouple(homeId, alive, traits) &&
      hasSinglesOnlyResidenceWithRoom(unit, alive, residences, homeId, occupancy, traits)
    ) {
      return true;
    }
    return false;
  }

  // A couple sharing with an unrelated couple moves in with its own family, empty house or not.
  if (residenceHostsUnrelatedCouple(unit, homeId, alive, traits)) {
    const kinHome = pickResidenceForFamily(unit, alive, residences, occupancy, traits);
    if (kinHome !== undefined && kinHome !== homeId
      && residenceHostsKin(unit, kinHome, alive, traits)
      && !residenceHostsUnrelatedCouple(unit, kinHome, alive, traits)) {
      return true;
    }
  }

  if (!hasEmptyResidenceForUnit(unit, alive, residences, occupancy)) return false;
  if (countResidentsInBuilding(alive, homeId, occupancy) === unit.length) return false;
  return unitSharesResidenceWithOutsiders(unit, alive, homeId);
}

/** Family shortages are derived, so the warning disappears as soon as the household reunites. */
export function collectFamilyHousingShortages(humans: Entity[], buildings: Building[]): Entity[][] {
  const alive = humans.filter((human) => human.alive && isPlayerHuman(human) && !isImprisoned(human));
  const residences = listPlayerResidences(buildings);
  const occupancy = buildResidenceOccupancy(alive);
  return buildHousingUnits(alive).filter((unit) => unit.some(isMinorChild)
    && !unit.some((member) => residences.some((home) => isLeaderHouseResidence(home) && home.id === member.residenceBuildingId))
    && !isFamilyHousingValid(unit, residences, alive, occupancy));
}

export function isUnnecessarilySharingHousing(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
): boolean {
  return housingUnitNeedsReassignment(unit, humans, residences, occupancy, traits);
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
  const traits = buildResidenceTraits(alive);
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
    if (residenceHostsUnrelatedCouple(unit, homeId, alive, traits)) {
      issues.push(`${label} share house #${homeId} with an unrelated couple`);
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
  traits?: ResidenceTraitsById,
): Entity[][] {
  const needReassign = units.map((u) =>
    housingUnitNeedsReassignment(u, alive, residences, occupancy, traits),
  );
  return units
    .map((unit, i) => ({ unit, need: needReassign[i] ? 0 : 1, len: unit.length }))
    .sort((a, b) => a.need - b.need || b.len - a.len)
    .map((x) => x.unit);
}

/** A commute move must save the household this many hours a day before it is worth making. */
export const RELOCATION_MIN_SAVED_HOURS = 0.5;
/** …and beat the current home by this fraction, so two near-equal homes never trade the household. */
export const RELOCATION_MIN_IMPROVEMENT_RATIO = 0.25;
/** No member's own daily travel may worsen by more than this, whatever the household total does. */
export const RELOCATION_MAX_MEMBER_REGRESSION_HOURS = 0.25;
/** Most household moves a colony makes in one day, so a new row of houses cannot reshuffle it at once. */
export const MAX_RELOCATIONS_PER_DAY = 8;

/** Per-sweep lookups and vacant candidates; the reconciliation owner updates vacancies after each move. */
export interface CommuteRelocationIndex {
  buildingsById: ReadonlyMap<number, Building>;
  residencesById: ReadonlyMap<number, Building>;
  order: ReadonlyMap<number, number>;
  vacant: Building[];
  roads: readonly Building[];
}

export function buildCommuteRelocationIndex(
  residences: Building[],
  buildings: readonly Building[],
  occupancy: ResidenceOccupancy,
): CommuteRelocationIndex {
  return {
    buildingsById: new Map(buildings.map((building) => [building.id, building])),
    residencesById: new Map(residences.map((residence) => [residence.id, residence])),
    order: new Map(residences.map((residence, index) => [residence.id, index])),
    roads: buildings.filter((building) => building.type === BuildingType.Road || building.type === BuildingType.Bridge),
    vacant: residences.filter((residence) => !isLeaderHouseResidence(residence)
      && residence.faction !== 'rival' && (occupancy.get(residence.id) ?? 0) === 0),
  };
}

/** One member's daily travel: the trip to work plus the trip to school. */
function memberCommuteHours(
  member: Entity,
  home: Building,
  buildings: readonly Building[],
  walkSpeed: number,
  cache: Map<string, number>,
  buildingsById?: ReadonlyMap<number, Building>,
): number {
  let total = 0;
  if (member.workerBuildingId != null) {
    total += cachedCommuteHours(home, member.workerBuildingId, buildings, walkSpeed, cache, buildingsById);
  }
  if (member.schoolBuildingId != null) {
    total += cachedCommuteHours(home, member.schoolBuildingId, buildings, walkSpeed, cache, buildingsById);
  }
  return total;
}

/** One home's daily travel burden: every worker's trip to work plus every pupil's trip to school. */
function householdCommuteHours(
  unit: Entity[],
  home: Building,
  buildings: readonly Building[],
  walkSpeed: number,
  cache: Map<string, number>,
  buildingsById?: ReadonlyMap<number, Building>,
): number {
  let total = 0;
  for (const member of unit) {
    total += memberCommuteHours(member, home, buildings, walkSpeed, cache, buildingsById);
  }
  return total;
}

/** Per-pass travel time for one home→destination leg, keyed so a sweep prices each leg once. */
function cachedCommuteHours(
  home: Building,
  destinationId: number,
  buildings: readonly Building[],
  walkSpeed: number,
  cache: Map<string, number>,
  buildingsById?: ReadonlyMap<number, Building>,
): number {
  const destination = buildingsById ? buildingsById.get(destinationId) : buildings.find((b) => b.id === destinationId);
  if (!destination) return 0;
  const key = `${home.id}:${destination.id}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const hours = estimatedCommuteHours(home, destination, buildings, walkSpeed);
  cache.set(key, hours);
  return hours;
}

/** Whether every pupil in the unit still reaches their school from `home` inside the reach rule. */
function pupilsKeepSchoolReach(
  unit: Entity[],
  home: Building,
  buildings: readonly Building[],
  walkSpeed: number,
  cache: Map<string, number>,
  buildingsById?: ReadonlyMap<number, Building>,
): boolean {
  for (const member of unit) {
    if (member.schoolBuildingId == null) continue;
    const hours = cachedCommuteHours(home, member.schoolBuildingId, buildings, walkSpeed, cache, buildingsById);
    if (hours > MAX_ASSIGNABLE_COMMUTE_HOURS) return false;
  }
  return true;
}

/** §12 commute move: the vacant home that most shortens the household's daily travel, and never back. */
export function pickCommuteRelocation(
  unit: Entity[],
  alive: Entity[],
  residences: Building[],
  buildings: readonly Building[],
  occupancy: ResidenceOccupancy | undefined,
  cache: Map<string, number>,
  walkSpeed: number,
  index?: CommuteRelocationIndex,
): number | undefined {
  const homeId = unitResidenceId(unit);
  if (homeId == null) return undefined;
  const candidates = index?.vacant ?? residences;
  if (candidates.length === 0) return undefined;
  const buildingsById = index?.buildingsById;
  const commuteBuildings = index?.roads ?? buildings;
  const home = index ? index.residencesById.get(homeId) : residences.find((r) => r.id === homeId);
  if (!home || isLeaderHouseResidence(home)) return undefined;

  const current = householdCommuteHours(unit, home, commuteBuildings, walkSpeed, cache, buildingsById);
  if (current <= 0) return undefined;

  // A household total can improve while one member's own day worsens; no candidate may do that.
  const before = unit.map((member) => memberCommuteHours(member, home, commuteBuildings, walkSpeed, cache, buildingsById));
  let best: Building | undefined;
  let bestHours = current;
  for (const residence of candidates) {
    if (residence.id === homeId || isLeaderHouseResidence(residence) || residence.faction === 'rival') continue;
    if (countResidentsInBuilding(alive, residence.id, occupancy) !== 0) continue;
    if (!familyFitsInResidence(unit, residence, alive, occupancy)) continue;
    if (!pupilsKeepSchoolReach(unit, residence, commuteBuildings, walkSpeed, cache, buildingsById)) continue;
    const hours = householdCommuteHours(unit, residence, commuteBuildings, walkSpeed, cache, buildingsById);
    if (hours > bestHours || (hours === bestHours && (best === undefined || residence.id >= best.id))) continue;
    const after = unit.map((member) => memberCommuteHours(member, residence, commuteBuildings, walkSpeed, cache, buildingsById));
    if (after.some((memberHours, index) => memberHours - before[index] > RELOCATION_MAX_MEMBER_REGRESSION_HOURS)) continue;
    bestHours = hours;
    best = residence;
  }
  if (!best) return undefined;
  if (current - bestHours < RELOCATION_MIN_SAVED_HOURS) return undefined;
  if (bestHours > current * (1 - RELOCATION_MIN_IMPROVEMENT_RATIO)) return undefined;
  return best.id;
}

/**
 * Per-residence facts the pickers ask about, built in **one** walk over `humans` and then kept
 * current by `residenceTraitMove` beside every occupancy move — threading it through is what makes
 * a pick O(residences) instead of O(residences × humans).
 */
export interface ResidenceTraits {
  adults: number;
  minors: number;
  /** Occupants whose partner is a housemate; above zero is the "hosts a couple" predicate. */
  pairs: number;
  occupants: Map<number, Entity>;
}
export type ResidenceTraitsById = Map<number, ResidenceTraits>;

function addResidenceOccupant(traits: ResidenceTraitsById, residenceId: number, human: Entity): void {
  let entry = traits.get(residenceId);
  if (!entry) {
    entry = { adults: 0, minors: 0, pairs: 0, occupants: new Map() };
    traits.set(residenceId, entry);
  }
  entry.occupants.set(human.id, human);
  if (!human.isJuvenile) entry.adults += 1;
  if (isMinorChild(human)) entry.minors += 1;
  if (human.partnerId != null && entry.occupants.has(human.partnerId)) entry.pairs += 1;
  for (const occupant of entry.occupants.values()) {
    if (occupant.id !== human.id && occupant.partnerId === human.id) entry.pairs += 1;
  }
}

function removeResidenceOccupant(traits: ResidenceTraitsById, residenceId: number, human: Entity): void {
  const entry = traits.get(residenceId);
  if (!entry) return;
  entry.occupants.delete(human.id);
  if (!human.isJuvenile) entry.adults -= 1;
  if (isMinorChild(human)) entry.minors -= 1;
  if (human.partnerId != null && entry.occupants.has(human.partnerId)) entry.pairs -= 1;
  for (const occupant of entry.occupants.values()) {
    if (occupant.partnerId === human.id) entry.pairs -= 1;
  }
  if (entry.occupants.size === 0) traits.delete(residenceId);
}

/** One walk over the colony; a house with no occupant gets no entry. */
export function buildResidenceTraits(humans: readonly Entity[]): ResidenceTraitsById {
  const traits: ResidenceTraitsById = new Map();
  for (const human of humans) {
    if (!human.alive || !isPlayerHuman(human)) continue;
    const residenceId = human.residenceBuildingId;
    if (residenceId == null) continue;
    addResidenceOccupant(traits, residenceId, human);
  }
  return traits;
}

/**
 * Applies one move to a threaded trait map, exactly as a fresh `buildResidenceTraits` would read it
 * at that moment. Every residence write inside an assignment pass must call this beside
 * `occupancyMove`, or the threaded map drifts from the live world.
 */
export function residenceTraitMove(
  traits: ResidenceTraitsById,
  human: Entity,
  fromId: number | undefined,
  toId: number | undefined,
): void {
  if (fromId === toId) return;
  if (fromId != null) removeResidenceOccupant(traits, fromId, human);
  if (toId != null) addResidenceOccupant(traits, toId, human);
}

function traitsFor(humans: Entity[], traits?: ResidenceTraitsById): ResidenceTraitsById {
  return traits ?? buildResidenceTraits(humans);
}

function residenceHostsCouple(
  residenceId: number,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): boolean {
  return (traitsFor(humans, traits).get(residenceId)?.pairs ?? 0) > 0;
}

function residenceHostsOnlySingles(
  residenceId: number,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): boolean {
  const entry = traitsFor(humans, traits).get(residenceId);
  if (!entry || entry.minors > 0 || entry.pairs > 0) return false;
  return entry.adults > 0;
}

function unitIdSet(unit: Entity[]): Set<number> {
  return new Set(unit.map((member) => member.id));
}

/** A couple in the residence that no member of the unit is related to. */
function residenceHostsUnrelatedCouple(
  unit: Entity[],
  residenceId: number,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): boolean {
  const entry = traitsFor(humans, traits).get(residenceId);
  if (!entry) return false;
  const unitIds = unitIdSet(unit);
  for (const occupant of entry.occupants.values()) {
    if (unitIds.has(occupant.id)) continue;
    const partnerId = occupant.partnerId;
    if (partnerId == null || unitIds.has(partnerId)) continue;
    const partner = entry.occupants.get(partnerId);
    if (!partner) continue;
    const related = unit.some((member) => areCloseKin(member, occupant) || areCloseKin(member, partner));
    if (!related) return true;
  }
  return false;
}

/** A residence holding the unit's own family — the household it would rather move back in with. */
function residenceHostsKin(
  unit: Entity[],
  residenceId: number,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): boolean {
  const entry = traitsFor(humans, traits).get(residenceId);
  if (!entry) return false;
  const unitIds = unitIdSet(unit);
  for (const occupant of entry.occupants.values()) {
    if (unitIds.has(occupant.id)) continue;
    if (unit.some((member) => areCloseKin(member, occupant))) return true;
  }
  return false;
}

/** A household's own home first, then its own family, then whoever else will take it in. */
function residencePreferenceTier(
  unit: Entity[],
  residenceId: number,
  outsiders: number,
  hasMinor: boolean,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): number {
  if (outsiders === 0) return 0;
  if (!residenceHostsKin(unit, residenceId, humans, traits)) return 2;
  if (hasMinor && residenceHostsOnlySingles(residenceId, humans, traits)) return 2;
  return 1;
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
  traitsIn?: ResidenceTraitsById,
): number | undefined {
  if (residences.length === 0 || family.length === 0) return undefined;

  const loneSingle = isLoneSettler(family, humans);
  const hasMinor = family.some((m) => isMinorChild(m));
  
  // A threaded map is the pass's own; without one, one walk over the colony answers every
  // per-residence question below by lookup.
  const traits = traitsFor(humans, traitsIn);

  let emptyHouseCount = 0;
  const singlesFriendlyHouseIds = new Set<number>();

  for (const r of residences) {
    if (isLeaderHouseResidence(r) || r.faction === 'rival') continue;
    const count = countResidentsInBuilding(humans, r.id, occupancy);
    if (count === 0) {
      emptyHouseCount++;
    }
    if (familyFitsInResidence(family, r, humans, occupancy) && (count === 0 || residenceHostsOnlySingles(r.id, humans, traits))) {
      singlesFriendlyHouseIds.add(r.id);
    }
  }

  const anyEmptyHouse = emptyHouseCount > 0;
  const housingShortage = !anyEmptyHouse || !anyOpenBeds(humans, residences, occupancy);

  let best: Building | undefined;
  let bestScore = Infinity;
  let bestTier = Infinity;

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
      } else if (residenceHostsOnlySingles(residence.id, humans, traits)) {
        score = alreadyHere > 0 ? HOUSING_SCORES.SINGLES_ALREADY_HOSTED + count : count;
      } else if (residenceHostsCouple(residence.id, humans, traits)) {
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

    if (hasMinor && residenceHostsOnlySingles(residence.id, humans, traits)) {
      score += HOUSING_SCORES.MINOR_IN_SINGLES_PENALTY;
    }

    // Between two otherwise equal homes, a couple never picks the one holding another couple.
    if (!loneSingle && outsiders > 0
      && residenceHostsUnrelatedCouple(family, residence.id, humans, traits)) {
      score += HOUSING_SCORES.OTHER_COUPLE_PENALTY;
    }

    const tier = loneSingle ? 0
      : residencePreferenceTier(family, residence.id, outsiders, hasMinor, humans, traits);
    if (tier < bestTier || (tier === bestTier
      && (score < bestScore || (score === bestScore && residence.id < (best?.id ?? Infinity))))) {
      bestTier = tier;
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
  traits?: ResidenceTraitsById,
): number | undefined {
  const exclude = new Set(excludeResidenceIds);
  const filtered = residences.filter((r) => !exclude.has(r.id));
  if (filtered.length === 0) return undefined;
  return pickResidenceForHuman(human, humans, filtered, occupancy, traits);
}

export function pickResidenceForHuman(
  human: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
): number | undefined {
  if (residences.length === 0) return undefined;

  const household = isMinorChild(human) ? [human] : collectOwnHousehold(human, humans);
  const familyHouse = pickResidenceForFamily(household, humans, residences, occupancy, traits);
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
  return pickLeastCrowdedResidence(humans, residences, 1, crowdOpts, occupancy, [], traits);
}
