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

function livingHuman(humans: Entity[], id: number | undefined): Entity | undefined {
  if (id == null) return undefined;
  return humans.find((human) => human.id === id && human.alive);
}

function humanById(humans: Entity[], id: number | undefined): Entity | undefined {
  if (id == null) return undefined;
  return humans.find((human) => human.id === id);
}

/** Resolve a child’s natural or adoptive custodianship without changing residence state. */
export function getChildCustodian(child: Entity, humans: Entity[]): Entity | undefined {
  const mother = livingHuman(humans, child.motherId);
  if (mother) return mother;
  const father = livingHuman(humans, child.fatherId);
  if (father) return father;
  if (child.isBastard) {
    const motherRecord = humanById(humans, child.motherId);
    if (motherRecord?.motherId != null) {
      const grandmother = livingHuman(humans, motherRecord.motherId);
      if (grandmother) return grandmother;
    }
    const fatherRecord = humanById(humans, child.fatherId);
    if (fatherRecord?.motherId != null) {
      const grandmother = livingHuman(humans, fatherRecord.motherId);
      if (grandmother) return grandmother;
    }
  }
  const adoptiveMother = livingHuman(humans, child.adoptiveMotherId);
  return adoptiveMother ?? livingHuman(humans, child.adoptiveFatherId);
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

export function isAdultChildAtHome(human: Entity, humans: Entity[]): boolean {
  if (!human.alive || human.faction || human.isJuvenile) return false;
  if (human.age < HUMAN_MOVE_OUT_MIN_AGE || !hasResidenceAssignment(human)) return false;
  const parents = [
    humans.find((candidate) => candidate.id === human.motherId && candidate.alive),
    humans.find((candidate) => candidate.id === human.fatherId && candidate.alive),
  ].filter((parent): parent is Entity => !!parent && hasResidenceAssignment(parent));
  return parents.some((parent) => parent.residenceBuildingId === human.residenceBuildingId);
}
