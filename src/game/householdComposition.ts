import type { Entity } from './gameTypes';
import type { GenealogyRegistry } from './genealogyTypes';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { hasResidenceAssignment, isResidenceOccupantEntity, isImprisoned } from './residencyOccupancy';
import { isPlayerHuman } from './playerHuman';
/** Married or partnered settlers are emancipated for housing. */
export function isMinorChild(child: Entity): boolean {
  if (child.partnerId != null) return false;
  return child.isJuvenile || child.age < HUMAN_ADULT_MIN_AGE;
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
  const members = collectMinorHousehold(leader, humans).filter(isResidenceOccupantEntity);
  const memberIds = new Set(members.map((person) => person.id));
  const parentIds = new Set([leader.id, leader.partnerId].filter((id): id is number => id != null));
  const directChildren = humans.filter((person) => person.alive && isResidenceOccupantEntity(person)
    && (parentIds.has(person.motherId ?? -1) || parentIds.has(person.fatherId ?? -1)
      || parentIds.has(person.adoptiveMotherId ?? -1) || parentIds.has(person.adoptiveFatherId ?? -1)));
  for (const child of directChildren) {
    const partner = humans.find((person) => person.id === child.partnerId
      && person.alive && isResidenceOccupantEntity(person));
    const hasDependentMinors = [child, partner].some((parent) => parent != null
      && humans.some((person) => person.alive && isResidenceOccupantEntity(person)
        && isMinorChild(person) && (person.motherId === parent.id || person.fatherId === parent.id
          || person.adoptiveMotherId === parent.id || person.adoptiveFatherId === parent.id)));
    // An established ordinary residence makes this a separate adult household.
    // Do not admit only its unhoused partner into the manor.
    const hasIndependentHome = [child, partner].some((adult) =>
      adult?.residenceBuildingId != null
      && humans.some((resident) => resident.alive && resident.id !== leader.id
        && resident.residenceBuildingId === adult.residenceBuildingId
        && resident.id === adult.id));
    if (hasDependentMinors || hasIndependentHome) continue;
    if (!memberIds.has(child.id)) {
      members.push(child);
      memberIds.add(child.id);
    }
    if (partner && !memberIds.has(partner.id)) {
      members.push(partner);
      memberIds.add(partner.id);
    }
  }
  return members;
}

/**
 * One adult-led home with only its *dependent* children.
 *
 * Adult children are emancipated for housing (`isMinorChild`), so a parent whose children
 * have all grown up must not form a housing unit that spans their own house and the adult
 * child's — that unit can never be satisfied, and the residency convergence loop responds by
 * re-homing everyone together, undoing the adult-child move-out.
 */
export function collectMinorHousehold(seed: Entity, humans: Entity[]): Entity[] {
  const household: Entity[] = [];
  const add = (human?: Entity) => {
    if (human?.alive && !household.some((member) => member.id === human.id)) household.push(human);
  };
  add(seed);
  const partner = humans.find((human) => human.id === seed.partnerId && human.alive);
  add(partner);
  const addMinorChild = (childId: number) => {
    const child = humans.find((human) => human.id === childId && human.alive);
    if (child && isMinorChild(child)) add(child);
  };
  for (const childId of seed.childrenIds ?? []) addMinorChild(childId);
  if (partner) {
    for (const childId of partner.childrenIds ?? []) addMinorChild(childId);
  }
  return household;
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
  if (human.age < HUMAN_ADULT_MIN_AGE || !hasResidenceAssignment(human)) return false;
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

/** Parent ids of a settler, biological and adoptive. */
function parentIdsOf(human: Entity): (number | undefined)[] {
  return [human.motherId, human.fatherId, human.adoptiveMotherId, human.adoptiveFatherId];
}

/** Close family living apart: a parent/child link or a shared parent (siblings). */
export function areCloseKin(a: Entity, b: Entity): boolean {
  const aParents = parentIdsOf(a);
  const bParents = parentIdsOf(b);
  if (aParents.includes(b.id) || bParents.includes(a.id)) return true;
  return aParents.some((parentId) => parentId != null && bParents.includes(parentId));
}