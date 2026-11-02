import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, BUILDING_CONFIGS, EntityType } from './gameTypes';
import { BUILDING_TYPE_CODES, isCompletedPlayerBuilding } from './buildings';
import { isPlayerHuman } from './playerHuman';
import { getBuildingCenter } from './buildingGeometry';
import type { GenealogyRegistry } from './genealogyTypes';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';


export function isResidenceBuilding(b: Building): boolean {
  return b.completed && isResidenceBuildingType(b.type);
}

/** The one eligibility gate every assignment caller shares: a completed player residence. */
export function isAssignableHome(b: Building): boolean {
  return isCompletedPlayerBuilding(b) && isResidenceBuildingType(b.type);
}

/** The type codes that are homes — filters match on the code, never on the type name. */
const RESIDENCE_TYPE_CODES: ReadonlySet<number> = new Set<number>([
  BUILDING_TYPE_CODES[BuildingType.House],
  BUILDING_TYPE_CODES[BuildingType.Mansion],
  BUILDING_TYPE_CODES[BuildingType.Villa],
  BUILDING_TYPE_CODES[BuildingType.LeaderHouse],
]);

export function isResidenceBuildingType(type: BuildingType): boolean {
  return RESIDENCE_TYPE_CODES.has(BUILDING_TYPE_CODES[type]);
}

export function isLeaderHouseResidence(b: Building): boolean {
  return b.type === BuildingType.LeaderHouse;
}

/** Base occupants + bonus from house/mansion upgrades (+2 slots per level above 1). */
export function getResidenceCapacity(residence: Building): number {
  const base = BUILDING_CONFIGS[residence.type].maxOccupants;
  // The Leader's House is out of the level rule: its beds are fixed, and a save made before that
  // rule can still carry a level it can no longer use.
  if (!isResidenceBuildingType(residence.type) || isLeaderHouseResidence(residence)) return base;
  const level = residence.level || 1;
  return base + (level - 1) * 2;
}

export function getResidenceUpgradeSlotGain(type: BuildingType): number {
  return isResidenceBuildingType(type) ? 2 : 0;
}

/** Building id 0 is valid — never use bare !id for assignment checks. */
export function hasWorkAssignment(human: Entity): boolean {
  return human.workerBuildingId != null;
}

export function hasResidenceAssignment(human: Entity): boolean {
  return human.residenceBuildingId != null;
}

export function isImprisoned(human: Entity): boolean {
  return human.prisonBuildingId != null;
}

/**
 * A living player settler with no bed — the one definition of "homeless".
 *
 * Two rules meet here, and four surfaces used to disagree about them:
 *
 *  - **A prisoner is not homeless.** Imprisonment deliberately clears `residenceBuildingId`
 *    (`humanLifecycleCleanup`), so a naive `residenceBuildingId == null` count reports every jailed
 *    settler as unhoused — the mistake `LIVE-FINDINGS-STATUS.md` F10 recorded for the council report
 *    and the priority strip, and that `housingDiagnostics.unassignedPlayerHumans` still made.
 *  - **A child without a bed is homeless.** The People screen's Home card excluded juveniles, so a
 *    child sleeping rough was counted by the dashboard and the alert strip but not by the card whose
 * tone and "Housing is tight" mood depend on it.
 */
export function isHomelessSettler(entity: Entity): boolean {
  return entity.alive
    && isPlayerHuman(entity)
    && !hasResidenceAssignment(entity)
    && !isImprisoned(entity);
}

/** Homeless settlers, by the rule above — the owner every "without a home" surface reads. */
export function countHomelessSettlers(world: Pick<WorldState, 'entities'>): number {
  const entities = world.entities ?? [];
  let homeless = 0;
  for (let i = 0; i < entities.length; i++) {
    if (isHomelessSettler(entities[i])) homeless += 1;
  }
  return homeless;
}

export function shareResidence(a: Entity, b: Entity): boolean {
  return hasResidenceAssignment(a) && hasResidenceAssignment(b) && a.residenceBuildingId === b.residenceBuildingId;
}

export function isNearResidence(human: Entity, buildings: Building[] | ReadonlyMap<number, Building>, maxDist = 55): boolean {
  if (!hasResidenceAssignment(human)) return false;
  const id = human.residenceBuildingId!;
  const residence = 'get' in buildings ? (buildings as ReadonlyMap<number, Building>).get(id) : (buildings as Building[]).find((b) => b.id === id);
  if (!residence || !isResidenceBuilding(residence)) return false;
  const { x: cx, y: cy } = getBuildingCenter(residence);
  return Math.hypot(human.x - cx, human.y - cy) <= maxDist;
}

export type ResidenceOccupancy = Map<number, number>;

/** One occupancy rule for living player settlers, including cursed Moon Howlers.
 * The housing solver and occupant sync both use this leaf owner. */
export function isResidenceOccupantEntity(entity: Entity): boolean {
  if (!entity.alive) return false;
  if (entity.type === EntityType.Human) return isPlayerHuman(entity);
  return entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed && !entity.faction;
}

function residenceCountsBy(
  humans: readonly Entity[],
  includes: (human: Entity) => boolean,
): ResidenceOccupancy {
  const occupancy: ResidenceOccupancy = new Map();
  for (const h of humans) {
    if (!includes(h)) continue;
    const id = h.residenceBuildingId;
    if (id == null) continue;
    occupancy.set(id, (occupancy.get(id) ?? 0) + 1);
  }
  return occupancy;
}

export function buildResidenceOccupancy(humans: readonly Entity[]): ResidenceOccupancy {
  return residenceCountsBy(humans, isResidenceOccupantEntity);
}

/** Player-human residents per residence — the count the "shares with outsiders" check reads. */
export function buildPlayerResidenceOccupancy(humans: readonly Entity[]): ResidenceOccupancy {
  return residenceCountsBy(humans, (human) => human.alive && isPlayerHuman(human));
}

export function occupancyMove(occupancy: ResidenceOccupancy, fromId: number | undefined, toId: number | undefined): void {
  if (fromId === toId) return;
  if (fromId != null) {
    const next = (occupancy.get(fromId) ?? 0) - 1;
    if (next <= 0) occupancy.delete(fromId);
    else occupancy.set(fromId, next);
  }
  if (toId != null) occupancy.set(toId, (occupancy.get(toId) ?? 0) + 1);
}

export function countResidentsInBuilding(humans: Entity[], buildingId: number, occupancy?: ResidenceOccupancy): number {
  if (occupancy) return occupancy.get(buildingId) ?? 0;
  return humans.filter((h) => isResidenceOccupantEntity(h) && h.residenceBuildingId === buildingId).length;
}

export function residenceRoomFor(human: Entity, residence: Building, humans: Entity[], occupancy?: ResidenceOccupancy): boolean {
  let count = countResidentsInBuilding(humans, residence.id, occupancy);
  if (human.residenceBuildingId === residence.id) count--;
  return count < getResidenceCapacity(residence);
}

// ——— Households, custody and kin ———

/** The age rule alone: an 18-year-old is adult even if a stale flag says otherwise. */
export function isMinor(human: Entity): boolean {
  return human.age < HUMAN_ADULT_MIN_AGE;
}

export function isAdult(human: Entity): boolean {
  return !isMinor(human);
}

export function isMinorChild(child: Entity): boolean {
  if (child.partnerId != null) return false;
  return child.isJuvenile || isMinor(child);
}

/** One adult-led home: settler + spouse + their children, not parents or siblings. */
export function collectOwnHousehold(seed: Entity, humans: Entity[]): Entity[] {
  const household: Entity[] = [];
  const add = (human?: Entity) => {
    if (human?.alive && !household.some((member) => member.id === human.id)) household.push(human);
  };
  add(seed);
  const partner = humans.find((human) => human.id === seed.partnerId && human.alive);
  add(partner);
  for (const childId of seed.childrenIds ?? []) add(humans.find((human) => human.id === childId && human.alive));
  if (partner) {
    for (const childId of partner.childrenIds ?? []) add(humans.find((human) => human.id === childId && human.alive));
  }
  return household;
}

/** The leader's entitled housing unit: partner and dependent minors, not grown descendants. */
export function collectLeaderDescendants(leader: Entity, humans: Entity[]): Entity[] {
  return collectMinorHousehold(leader, humans).filter(isResidenceOccupantEntity);
}

/** The same household, dependent children only: an adult child is its own housing unit. */
export function collectMinorHousehold(seed: Entity, humans: Entity[]): Entity[] {
  const partnerId = seed.partnerId;
  return collectOwnHousehold(seed, humans).filter(
    (member) => member.id === seed.id || member.id === partnerId || isMinorChild(member),
  );
}

/** Look up an alive human by id without applying housing or imprisonment eligibility. */
export function findLivingHuman(humans: Entity[], id: number | undefined): Entity | undefined {
  return id == null ? undefined : humans.find((human) => human.id === id && human.alive);
}

function livingHuman(
  humans: Entity[],
  id: number | undefined,
  entityById?: ReadonlyMap<number, Entity>,
): Entity | undefined {
  if (id == null) return undefined;
  if (entityById) {
    const indexed = entityById.get(id);
    return indexed && isResidenceOccupantEntity(indexed) && !isImprisoned(indexed) ? indexed : undefined;
  }
  return humans.find((human) => human.id === id && isResidenceOccupantEntity(human) && !isImprisoned(human));
}

function humanById(
  humans: Entity[],
  id: number | undefined,
  entityById?: ReadonlyMap<number, Entity>,
): Entity | undefined {
  if (id == null) return undefined;
  if (entityById) return entityById.get(id);
  return humans.find((human) => human.id === id);
}

/** Resolve a child’s natural or adoptive custodianship without changing residence state. */
export function getChildCustodian(
  child: Entity,
  humans: Entity[],
  entityById?: ReadonlyMap<number, Entity>,
  genealogy?: GenealogyRegistry,
): Entity | undefined {
  const mother = livingHuman(humans, child.motherId, entityById);
  const father = livingHuman(humans, child.fatherId, entityById);
  if (mother && father && mother.partnerId !== father.id && father.partnerId !== mother.id) {
    const endedAt = mother.pastPartnerTicks?.[father.id];
    if (endedAt != null && endedAt === father.pastPartnerTicks?.[mother.id]) {
      // One deterministic decision per divorced parental pair, shared by all their minors.
      const fatherSelected = ((mother.id * 31 + father.id * 17 + endedAt) >>> 0) % 2 === 1;
      return fatherSelected ? father : mother;
    }
  }
  if (mother) return mother;
  if (father) return father;
  for (const parentId of [child.motherId, child.fatherId]) {
    const parent = humanById(humans, parentId, entityById)
      ?? (parentId == null ? undefined : genealogy?.people[String(parentId)]);
    for (const grandparentId of [parent?.motherId, parent?.fatherId]) {
      const grandparent = livingHuman(humans, grandparentId, entityById);
      if (grandparent) return grandparent;
    }
  }
  const adoptiveMother = livingHuman(humans, child.adoptiveMotherId, entityById);
  return adoptiveMother ?? livingHuman(humans, child.adoptiveFatherId, entityById);
}
/** Build reusable family lookup indexes once for a housing group. */
export function indexFamilyRelations(humans: Entity[]): {
  byId: Map<number, Entity>;
  childrenByParentId: Map<number, Entity[]>;
} {
  const byId = new Map<number, Entity>();
  const childrenByParentId = new Map<number, Entity[]>();
  for (const human of humans) {
    byId.set(human.id, human);
    for (const id of new Set([human.motherId, human.fatherId])) {
      if (id == null) continue;
      const children = childrenByParentId.get(id);
      if (children) children.push(human);
      else childrenByParentId.set(id, [human]);
    }
  }
  return { byId, childrenByParentId };
}

/** Collect connected family members; callers processing groups can reuse the indexes. */
export function collectFamilyMembers(
  seed: Entity,
  humans: Entity[],
  visited: Set<number>,
  relations = indexFamilyRelations(humans),
): Entity[] {
  const family: Entity[] = [];
  const queue: Entity[] = [seed];
  const findLiving = (id: number | undefined): Entity | undefined => {
    if (id == null) return undefined;
    const found = relations.byId.get(id);
    return found?.alive ? found : undefined;
  };
  while (queue.length > 0) {
    const human = queue.pop()!;
    if (visited.has(human.id)) continue;
    visited.add(human.id);
    family.push(human);
    const partner = findLiving(human.partnerId);
    if (partner && !visited.has(partner.id)) queue.push(partner);
    const mother = findLiving(human.motherId);
    if (mother && !visited.has(mother.id)) queue.push(mother);
    const father = findLiving(human.fatherId);
    if (father && !visited.has(father.id)) queue.push(father);
    for (const childId of human.childrenIds ?? []) {
      const child = findLiving(childId);
      if (child && !visited.has(child.id)) queue.push(child);
    }
    for (const child of relations.childrenByParentId.get(human.id) ?? []) {
      if (!visited.has(child.id)) queue.push(child);
    }
  }
  return family;
}



export function isAdultChildAtHome(
  human: Entity,
  humans: Entity[],
  /**
   * Pre-built `id → entity` index for a caller testing many candidates against one list. Without it
   * each call scans `humans` twice (mother, father), which is O(humans²) when the caller is itself a
   * `humans.filter`.
   */
  byId?: ReadonlyMap<number, Entity>,
): boolean {
  if (!human.alive || !isPlayerHuman(human) || human.isJuvenile) return false;
  if (isMinor(human) || !hasResidenceAssignment(human)) return false;
  const findLivingParent = (id: number | undefined): Entity | undefined => {
    if (byId) {
      const found = id == null ? undefined : byId.get(id);
      return found?.alive ? found : undefined;
    }
    return livingHuman(humans, id);
  };
  const parents = [
    findLivingParent(human.motherId),
    findLivingParent(human.fatherId),
    findLivingParent(human.adoptiveMotherId),
    findLivingParent(human.adoptiveFatherId),
  ].filter((parent): parent is Entity => !!parent && hasResidenceAssignment(parent));
  return parents.some((parent) => parent.residenceBuildingId === human.residenceBuildingId);
}

/** A housing unit's member ids and their parents, built once per unit per pass. */
export interface UnitKinIndex {
  ids: Set<number>;
  parents: Set<number>;
}

const unitKinIndexCache = new WeakMap<Entity[], UnitKinIndex>();

export function unitKinIndex(unit: Entity[]): UnitKinIndex {
  const cached = unitKinIndexCache.get(unit);
  if (cached) return cached;
  const ids = new Set<number>();
  const parents = new Set<number>();
  for (const member of unit) {
    ids.add(member.id);
    if (member.motherId != null) parents.add(member.motherId);
    if (member.fatherId != null) parents.add(member.fatherId);
    if (member.adoptiveMotherId != null) parents.add(member.adoptiveMotherId);
    if (member.adoptiveFatherId != null) parents.add(member.adoptiveFatherId);
  }
  const index = { ids, parents };
  unitKinIndexCache.set(unit, index);
  return index;
}

/**
 * Close family living apart: some member is a parent of `other`, `other` is a parent of a member,
 * or they share a parent (siblings).
 */
export function unitIsKinOf(index: UnitKinIndex, other: Entity): boolean {
  if (index.ids.has(other.id) || index.parents.has(other.id)) return true;
  if (other.motherId != null && (index.ids.has(other.motherId) || index.parents.has(other.motherId))) return true;
  if (other.fatherId != null && (index.ids.has(other.fatherId) || index.parents.has(other.fatherId))) return true;
  if (other.adoptiveMotherId != null
    && (index.ids.has(other.adoptiveMotherId) || index.parents.has(other.adoptiveMotherId))) return true;
  if (other.adoptiveFatherId != null
    && (index.ids.has(other.adoptiveFatherId) || index.parents.has(other.adoptiveFatherId))) return true;
  return false;
}

// ——— Family groups (read-only projection for the Population tab) ———

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
