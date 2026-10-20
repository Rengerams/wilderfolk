import type { Entity } from './gameTypes';
import { HUMAN_MOVE_OUT_MIN_AGE } from './residencyOccupancy';

/** Married or partnered settlers are emancipated for housing. */
export function isMinorChild(child: Entity): boolean {
  if (child.partnerId != null) return false;
  return child.isJuvenile || child.age < HUMAN_MOVE_OUT_MIN_AGE;
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

/** The leader's household through grandchildren, including their spouses.
 * This is a two-generation descendant entitlement, not an unbounded genealogy search.
 */
export function collectLeaderExtendedHousehold(leader: Entity, humans: Entity[]): Entity[] {
  const byId = new Map(humans.map((human) => [human.id, human]));
  const family: Entity[] = [];
  const included = new Set<number>();
  const add = (id: number | undefined): Entity | undefined => {
    const human = id == null ? undefined : byId.get(id);
    if (!human?.alive) return undefined;
    if (!included.has(human.id)) {
      included.add(human.id);
      family.push(human);
    }
    return human;
  };

  const spouse = add(leader.partnerId);
  add(leader.id);
  const children = new Set([...(leader.childrenIds ?? []), ...(spouse?.childrenIds ?? [])]);
  for (const childId of children) {
    const child = add(childId);
    if (!child) continue;
    const childSpouse = add(child.partnerId);
    const grandchildren = new Set([...(child.childrenIds ?? []), ...(childSpouse?.childrenIds ?? [])]);
    for (const grandchildId of grandchildren) add(grandchildId);
  }
  return family;
}

/**
 * The leader's and their spouse's dynastic clan (two descendant generations,
 * two ancestor generations, siblings/nieces/nephews and aunts/uncles/cousins).
 * Blood and adoptive links are included, as are spouses of descendants and
 * collateral relatives. This is deliberately bounded: it cannot spread
 * indefinitely through every in-law's wider family.
 */
export function collectLeaderClan(leader: Entity, humans: Entity[]): Entity[] {
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
  const clan: Entity[] = [];
  const included = new Set<number>();
  const get = (id: number | undefined): Entity | undefined => id == null ? undefined : byId.get(id);
  const add = (member: Entity | undefined): Entity | undefined => {
    if (!member?.alive || member.faction) return undefined;
    if (!included.has(member.id)) {
      included.add(member.id);
      clan.push(member);
    }
    return member;
  };
  const partner = (member: Entity | undefined): Entity | undefined => add(get(member?.partnerId));
  const parents = (member: Entity): Entity[] =>
    [...new Set([
      member.motherId, member.fatherId, member.adoptiveMotherId, member.adoptiveFatherId,
    ])].map(get).filter((parent): parent is Entity => !!parent);
  const children = (member: Entity): Entity[] => {
    const found = new Map<number, Entity>();
    for (const childId of member.childrenIds ?? []) {
      const child = get(childId);
      if (child) found.set(child.id, child);
    }
    for (const child of childrenByParent.get(member.id) ?? []) found.set(child.id, child);
    return [...found.values()];
  };
  const roots = [add(leader), partner(leader)].filter((root): root is Entity => !!root);
  for (const root of roots) {
    // Descendants and their spouses, with no adult-child exclusion.
    for (const child of children(root)) {
      const addedChild = add(child);
      if (!addedChild) continue;
      partner(addedChild);
      for (const grandchild of children(addedChild)) {
        const addedGrandchild = add(grandchild);
        if (addedGrandchild) partner(addedGrandchild);
      }
    }

    for (const parent of parents(root)) {
      add(parent);
      partner(parent);
      for (const grandparent of parents(parent)) add(grandparent);
      // Brothers and sisters of the leader/spouse, and nieces and nephews.
      for (const sibling of children(parent)) {
        if (sibling.id === root.id) continue;
        const addedSibling = add(sibling);
        if (!addedSibling) continue;
        partner(addedSibling);
        for (const nieceOrNephew of children(addedSibling)) add(nieceOrNephew);
      }
      // Grandparents' other children are aunts and uncles; their children are cousins.
      for (const grandparent of parents(parent)) {
        for (const auntOrUncle of children(grandparent)) {
          if (auntOrUncle.id === parent.id) continue;
          const addedRelative = add(auntOrUncle);
          if (!addedRelative) continue;
          partner(addedRelative);
          for (const cousin of children(addedRelative)) add(cousin);
        }
      }
    }
  }
  return clan;
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
/** Collect a connected family graph for household-unit formation. */
export function collectFamilyMembers(seed: Entity, humans: Entity[], visited: Set<number>): Entity[] {
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
      if ((other.motherId === human.id || other.fatherId === human.id) && !visited.has(other.id)) {
        queue.push(other);
      }
    }
  }
  return family;
}

import { hasResidenceAssignment } from './residencyOccupancy';

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
  if (!human.alive || human.faction || human.isJuvenile) return false;
  if (human.age < HUMAN_MOVE_OUT_MIN_AGE || !hasResidenceAssignment(human)) return false;
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
  ].filter((parent): parent is Entity => !!parent && hasResidenceAssignment(parent));
  return parents.some((parent) => parent.residenceBuildingId === human.residenceBuildingId);
}