/**
 * Housing units: one person, one unit; and only dependent children share a parent's home.
 *
 * Two defects in `buildHousingUnits`:
 *
 * 1. **Duplicate claim.** The custodian loop had a `visited` guard for the partner and the
 *    children but not for the custodian itself, so a settler who was the custodian of one
 *    child *and* the partner of another custodian ended up in two units. Each unit's
 *    reassignment invalidated the other, so the residency convergence loop never reached
 *    `reassigned === 0` and burned all its passes 4×/day, leaving the settler housed away
 *    from half of the family.
 * 2. **Adult children merged back in.** The fallback unit came from `collectOwnHousehold`,
 *    which walks `childrenIds` with no age filter. For a parent whose children had all grown
 *    up, the unit spanned the parents' house and the adult child's house, which can never be
 *    valid — so the convergence loop re-homed the whole unit together and silently undid the
 *    adult-child move-out on every pass.
 *
 * `buildHousingUnits` is pure, so these tests build plain settlers and read the units.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { buildHousingUnits } from '../src/game/residencySelection';

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
