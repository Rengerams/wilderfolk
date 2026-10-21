import type { Entity } from './gameTypes';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { hasResidenceAssignment } from './residencyOccupancy';
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

/**
 * Leader, their spouse and their children/grandchildren of any age.
 * Excludes collateral relatives and descendants' partners, so a large village's
 * connected family tree cannot fill the manor indiscriminately.
 */
export function collectLeaderDescendants(leader: Entity, humans: Entity[]): Entity[] {
  const byId = new Map(humans.map((human) => [human.id, human]));
  const childrenByParent = new Map<number, Entity[]>();
  for (const human of humans) {
    for (const parentId of new Set([
      human.motherId, human.fatherId, human.adoptiveMotherId, human.adoptiveFatherId,
    ])) {
      if (parentId == null) continue;
      const children = childrenByParent.get(parentId);
      if (children) children.push(human);
      else childrenByParent.set(parentId, [human]);
    }
  }
  const family: Entity[] = [];
  const included = new Set<number>();
  const add = (human?: Entity): Entity | undefined => {
    if (!human?.alive || !isPlayerHuman(human)) return undefined;
    if (!included.has(human.id)) {
      included.add(human.id);
      family.push(human);
    }
    return human;
  };
  const childrenOf = (parent: Entity): Entity[] => {
    const found = new Map<number, Entity>();
    for (const child of childrenByParent.get(parent.id) ?? []) found.set(child.id, child);
    for (const childId of parent.childrenIds ?? []) {
      const child = byId.get(childId);
      if (child) found.set(child.id, child);
    }
    return [...found.values()];
  };
  add(leader);
  const spouse = add(byId.get(leader.partnerId ?? -1));
  const firstGeneration = new Map<number, Entity>();
  for (const root of [leader, spouse].filter((e): e is Entity => !!e)) {
    for (const child of childrenOf(root)) {
      // Married adult descendants form a separate household with their partner.
      if (child.partnerId != null && !child.isJuvenile && child.age >= HUMAN_ADULT_MIN_AGE) continue;
      const added = add(child);
      if (added) firstGeneration.set(added.id, added);
    }
  }
  for (const child of firstGeneration.values()) {
    for (const grandchild of childrenOf(child)) {
      if (grandchild.partnerId != null && !grandchild.isJuvenile && grandchild.age >= HUMAN_ADULT_MIN_AGE) continue;
      add(grandchild);
    }
  }
  return family;
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

function livingHuman(
  humans: Entity[],
  id: number | undefined,
  entityById?: ReadonlyMap<number, Entity>,
): Entity | undefined {
  if (id == null) return undefined;
  if (entityById) {
    const indexed = entityById.get(id);
    return indexed?.alive ? indexed : undefined;
  }
  return humans.find((human) => human.id === id && human.alive);
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
): Entity | undefined {
  const mother = livingHuman(humans, child.motherId, entityById);
  if (mother) return mother;
  const father = livingHuman(humans, child.fatherId, entityById);
  if (father) return father;
  if (child.isBastard) {
    const motherRecord = humanById(humans, child.motherId, entityById);
    if (motherRecord?.motherId != null) {
      const grandmother = livingHuman(humans, motherRecord.motherId, entityById);
      if (grandmother) return grandmother;
    }
    const fatherRecord = humanById(humans, child.fatherId, entityById);
    if (fatherRecord?.motherId != null) {
      const grandmother = livingHuman(humans, fatherRecord.motherId, entityById);
      if (grandmother) return grandmother;
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