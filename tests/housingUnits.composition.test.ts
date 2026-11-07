/**
 * Housing units: one person, one unit; only dependent children share a parent's home. An adult
 * child keeps their own unit, and a settler is never claimed as custodian twice.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { getChildCustodian } from '../src/game/housingModel';
import { buildHousingUnits } from '../src/game/housingPipeline';

/** A cohabiting couple: partners, each a legal custodian of their own child. */
const MOTHER_ID = 1;
const FATHER_ID = 2;
const MOTHER_CHILD_ID = 3;
const FATHER_CHILD_ID = 4;
const ABSENT_PARENT_ID = 99;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 200,
    maxEnergy: 200,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender: id % 2 === 1 ? 'female' : 'male',
    name: `H${id}`,
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    childrenIds: [],
    reproductionCooldown: 0,
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

function unitContaining(units: Entity[][], id: number): Entity[][] {
  return units.filter((unit) => unit.some((member) => member.id === id));
}

describe('buildHousingUnits puts every settler in exactly one unit', () => {
  it('resolves a child custodian from the entity index when one is available', () => {
    const mother = human(MOTHER_ID);
    const child = human(MOTHER_CHILD_ID, { age: 4, isJuvenile: true, motherId: MOTHER_ID });
    const humans = [mother, child];
    const entityById = new Map(humans.map((entity) => [entity.id, entity]));

    expect(getChildCustodian(child, humans)).toBe(mother);
    expect(getChildCustodian(child, humans, entityById)).toBe(mother);
  });

  it('does not claim a custodian twice when both partners have their own minor child', () => {
    const mother = human(MOTHER_ID, {
      partnerId: FATHER_ID,
      childrenIds: [MOTHER_CHILD_ID],
      relationshipStatus: 'married',
    });
    const father = human(FATHER_ID, {
      partnerId: MOTHER_ID,
      childrenIds: [FATHER_CHILD_ID],
      relationshipStatus: 'married',
    });
    // Each child has only one living parent, so the two custodians are different people.
    const motherChild = human(MOTHER_CHILD_ID, { age: 4, isJuvenile: true, motherId: MOTHER_ID, fatherId: ABSENT_PARENT_ID });
    const fatherChild = human(FATHER_CHILD_ID, { age: 4, isJuvenile: true, motherId: ABSENT_PARENT_ID, fatherId: FATHER_ID });

    const units = buildHousingUnits([mother, father, motherChild, fatherChild]);

    expect(unitContaining(units, MOTHER_ID)).toHaveLength(1);
    expect(unitContaining(units, FATHER_ID)).toHaveLength(1);
    // Both children belong to their custodian's household, and everyone appears once.
    expect(unitContaining(units, MOTHER_CHILD_ID)).toHaveLength(1);
    expect(unitContaining(units, FATHER_CHILD_ID)).toHaveLength(1);
    expect(units.flat().map((member) => member.id).sort()).toEqual([1, 2, 3, 4]);
    expect(new Set(units.flat().map((member) => member.id)).size).toBe(4);
  });

  it('keeps an adult child out of the parents\' unit so a move-out can persist', () => {
    const parent = human(MOTHER_ID, { childrenIds: [MOTHER_CHILD_ID] });
    const grownChild = human(MOTHER_CHILD_ID, {
      age: 25,
      isJuvenile: false,
      motherId: MOTHER_ID,
      fatherId: ABSENT_PARENT_ID,
    });

    const units = buildHousingUnits([parent, grownChild]);

    const parentUnit = unitContaining(units, MOTHER_ID)[0];
    expect(parentUnit.map((member) => member.id)).toEqual([MOTHER_ID]);
    expect(unitContaining(units, MOTHER_CHILD_ID)[0].map((member) => member.id)).toEqual([MOTHER_CHILD_ID]);
  });

  it('still keeps a minor child with the parent', () => {
    const parent = human(MOTHER_ID, { childrenIds: [MOTHER_CHILD_ID] });
    const minor = human(MOTHER_CHILD_ID, { age: 6, isJuvenile: true, motherId: MOTHER_ID, fatherId: ABSENT_PARENT_ID });

    const units = buildHousingUnits([parent, minor]);

    expect(unitContaining(units, MOTHER_ID)).toHaveLength(1);
    expect(unitContaining(units, MOTHER_ID)[0].map((member) => member.id).sort()).toEqual([MOTHER_ID, MOTHER_CHILD_ID]);
  });
});
