import type { Entity } from './gameTypes';
import { HUMAN_MOVE_OUT_MIN_AGE } from './dayCycleConstants';

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
