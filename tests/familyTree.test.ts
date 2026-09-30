import { describe, expect, it } from 'vitest';
import { EntityType, type Entity } from '../src/game/gameTypes';
import { buildFamilyTree, groupFamiliesBySurname } from '../src/game/familyTree';

function human(partial: Partial<Entity> & { id: number; name: string }): Entity {
  return {
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    gender: 'female',
    isJuvenile: false,
    surname: 'Ash',
    childrenIds: [],
    ...partial,
  } as Entity;
}

describe('familyTree', () => {
  it('labels grandparents, aunts/uncles, nephews/nieces, and children', () => {
    const oma = human({ id: 1, name: 'Oma', gender: 'female', generation: 1 });
    const opa = human({ id: 2, name: 'Opa', gender: 'male', generation: 1 });
    const mother = human({
      id: 3,
      name: 'Mother',
      gender: 'female',
      motherId: 1,
      fatherId: 2,
      generation: 2,
    });
    const uncle = human({
      id: 4,
      name: 'Uncle',
      gender: 'male',
      motherId: 1,
      fatherId: 2,
      generation: 2,
    });
    const focus = human({
      id: 5,
      name: 'Focus',
      gender: 'female',
      motherId: 3,
      fatherId: 6,
      generation: 3,
    });
    const father = human({
      id: 6,
      name: 'Father',
      gender: 'male',
      partnerId: 3,
      generation: 2,
    });
    mother.partnerId = 6;
    const sibling = human({
      id: 7,
      name: 'Sibling',
      gender: 'male',
      motherId: 3,
      fatherId: 6,
      isJuvenile: false,
      generation: 3,
    });
    const child = human({
      id: 8,
      name: 'Kid',
      // A minor: `childRelation` classifies by **age** against `HUMAN_ADULT_MIN_AGE` (18), not by the
      // `isJuvenile` flag — that flag flips at `HUMAN_CHILDHOOD_DAYS` (12), so relying on it labelled a
      // 16-year-old an "Adult child" (owner: *"16 years it not an adult?"*). This fixture previously
      // omitted an age entirely and inherited the factory default of 30, so it was an adult by the real
      // rule while the test still called it a Child.
      age: 8,
      isJuvenile: true,
      gender: 'female',
      motherId: 5,
      generation: 4,
    });
    const nephew = human({
      id: 9,
      name: 'Nephew',
      gender: 'male',
      fatherId: 7,
      isJuvenile: true,
      generation: 4,
    });
    focus.childrenIds = [8];
    sibling.childrenIds = [9];
    mother.childrenIds = [5, 7];
    uncle.childrenIds = [];
    oma.childrenIds = [3, 4];
    opa.childrenIds = [3, 4];

    const all = [oma, opa, mother, uncle, focus, father, sibling, child, nephew];
    const tree = buildFamilyTree(focus, all);
    const byRelation = Object.fromEntries(
      tree.members.map((m) => [m.id, m.relationLabel]),
    );

    expect(byRelation[1]).toBe('Grandmother');
    expect(byRelation[2]).toBe('Grandfather');
    expect(byRelation[4]).toBe('Uncle');
    expect(byRelation[3]).toBe('Mother');
    expect(byRelation[6]).toBe('Father');
    expect(byRelation[7]).toBe('Sibling');
    expect(byRelation[8]).toBe('Child');
    expect(byRelation[9]).toBe('Nephew');
    expect(tree.counts.grandparents).toBe(2);
    expect(tree.counts.auntsUncles).toBe(1);
    expect(tree.counts.nephewsNieces).toBe(1);
  });

  it('groups living settlers by surname with child counts', () => {
    const people = [
      human({ id: 1, name: 'Ada', surname: 'Bell', gender: 'female' }),
      human({ id: 2, name: 'Bo', surname: 'Bell', gender: 'male', isJuvenile: true }),
      human({ id: 3, name: 'Cy', surname: 'Dale', gender: 'male' }),
    ];
    const groups = groupFamiliesBySurname(people);
    expect(groups[0].surname).toBe('Bell');
    expect(groups[0].children).toBe(1);
    expect(groups[0].adults).toBe(1);
  });
});
