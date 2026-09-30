import { describe, expect, it } from 'vitest';
import { EntityType, type Entity } from '../src/game/gameTypes';
import {
  buildFamilyTree,
  buildFullFamilyTree,
  groupFamiliesByLineage,
  groupFamiliesBySurname,
  type FamilyTreePerson,
  type FullFamilyTree,
} from '../src/game/familyTree';

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

const drawnIds = (tree: FullFamilyTree): number[] =>
  tree.rows.flatMap((row) => row.members.map((member) => member.id));

const personIn = (tree: FullFamilyTree, id: number): FamilyTreePerson | undefined =>
  tree.rows.flatMap((row) => row.members).find((member) => member.id === id);

const relationOf = (tree: FullFamilyTree, id: number): string | undefined => personIn(tree, id)?.relation;

/** The family's shape as rows of ids, sorted inside each row so member order never matters. */
const rowsOf = (tree: FullFamilyTree): number[][] =>
  tree.rows.map((row) => row.members.map((member) => member.id).sort((a, b) => a - b));

describe('buildFullFamilyTree', () => {
  /** Four generations: grandparents, two children (one married in), grandchildren including a cousin, one great-grandchild. */
  function fourGenerations(): { all: Entity[]; focus: Entity; oma: Entity } {
    const oma = human({ id: 1, name: 'Oma', gender: 'female', partnerId: 2, childrenIds: [3, 4], generation: 1 });
    const opa = human({ id: 2, name: 'Opa', gender: 'male', partnerId: 1, childrenIds: [3, 4], generation: 1 });
    const mother = human({
      id: 3, name: 'Mother', gender: 'female', motherId: 1, fatherId: 2, partnerId: 6, childrenIds: [5, 7], generation: 2,
    });
    const uncle = human({
      id: 4, name: 'Uncle', gender: 'male', motherId: 1, fatherId: 2, partnerId: 10, childrenIds: [11], generation: 2,
    });
    const father = human({ id: 6, name: 'Father', gender: 'male', partnerId: 3, childrenIds: [5, 7], generation: 2 });
    const wife = human({ id: 10, name: 'Wife', gender: 'female', partnerId: 4, childrenIds: [11], generation: 2 });
    const focus = human({
      id: 5, name: 'Focus', gender: 'female', motherId: 3, fatherId: 6, partnerId: 9, childrenIds: [8], generation: 3,
    });
    const sister = human({ id: 7, name: 'Sister', gender: 'female', motherId: 3, fatherId: 6, generation: 3 });
    const cousin = human({ id: 11, name: 'Cousin', gender: 'female', motherId: 10, fatherId: 4, generation: 3 });
    const husband = human({ id: 9, name: 'Husband', gender: 'male', partnerId: 5, childrenIds: [8], generation: 3 });
    const grandchild = human({
      id: 8, name: 'Grandchild', gender: 'male', age: 4, isJuvenile: true, motherId: 5, fatherId: 9, generation: 4,
    });
    return { all: [oma, opa, mother, uncle, father, wife, focus, sister, cousin, husband, grandchild], focus, oma };
  }

  it('resolves the same family read from a grandchild and from their grandmother', () => {
    const { all, focus, oma } = fourGenerations();
    const fromFocus = buildFullFamilyTree(focus, all);
    const fromOma = buildFullFamilyTree(oma, all);

    // Same people in the same generations, because membership is resolved from the graph and not from
    // whoever was clicked.
    expect(rowsOf(fromFocus)).toEqual(rowsOf(fromOma));
    expect(drawnIds(fromFocus).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(fromFocus.memberCount).toBe(11);
    expect(fromFocus.truncated).toBe(false);

    // The clicked settler is the highlighted one, and leads their own row.
    expect(personIn(fromFocus, 5)?.isFocus).toBe(true);
    expect(personIn(fromOma, 5)?.isFocus).toBe(false);
    expect(personIn(fromOma, 1)?.isFocus).toBe(true);
    expect(fromFocus.rows.find((row) => row.delta === 0)?.members[0].id).toBe(5);
    expect(fromOma.rows.find((row) => row.delta === 0)?.members[0].id).toBe(1);

    // Ancestors, collaterals and married-in relatives are named from the clicked settler's side.
    expect(relationOf(fromFocus, 1)).toBe('Grandmother');
    expect(relationOf(fromFocus, 3)).toBe('Mother');
    expect(relationOf(fromFocus, 6)).toBe('Father');
    expect(relationOf(fromFocus, 4)).toBe('Uncle');
    expect(relationOf(fromFocus, 10)).toBe('In-law');
    expect(relationOf(fromFocus, 9)).toBe('Spouse');
    expect(relationOf(fromFocus, 7)).toBe('Sibling');
    expect(relationOf(fromFocus, 11)).toBe('Cousin');
    expect(relationOf(fromFocus, 8)).toBe('Child');
    expect(relationOf(fromOma, 3)).toBe('Adult child');
    expect(relationOf(fromOma, 6)).toBe('In-law');
    expect(relationOf(fromOma, 5)).toBe('Grandchild');
    expect(relationOf(fromOma, 8)).toBe('Great-grandchild');
  });

  it('draws each person once and terminates when the kinship records form a parent/child cycle', () => {
    const oma = human({ id: 1, name: 'Oma', gender: 'female', partnerId: 2, fatherId: 3 });
    const opa = human({ id: 2, name: 'Opa', gender: 'male', partnerId: 1 });
    const child = human({ id: 3, name: 'Child', gender: 'male', motherId: 1, fatherId: 2 });
    // Contradictory records: the child is also the grandmother's father, which is a cycle in the graph.
    const all = [oma, opa, child];
    const tree = buildFullFamilyTree(oma, all);

    expect(tree.memberCount).toBe(3);
    expect(drawnIds(tree).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(new Set(drawnIds(tree)).size).toBe(3);
  });

  it('names the other parent of an earlier marriage, marks a child born outside wedlock, and marks an adoptive father', () => {
    const father = human({ id: 1, name: 'Sire', gender: 'male', partnerId: 3, childrenIds: [4, 5, 6], generation: 1 });
    const firstWife = human({ id: 2, name: 'Margery', gender: 'female', childrenIds: [4], generation: 1 });
    const secondWife = human({ id: 3, name: 'Joan', gender: 'female', partnerId: 1, childrenIds: [5, 6], generation: 1 });
    const earlierChild = human({ id: 4, name: 'Earliest', gender: 'male', age: 20, motherId: 2, fatherId: 1, generation: 2 });
    const currentChild = human({
      id: 5, name: 'Current', gender: 'male', age: 9, isJuvenile: true, motherId: 3, fatherId: 1, generation: 2,
    });
    const bastard = human({
      id: 6, name: 'Bastard', gender: 'female', age: 9, isJuvenile: true, isBastard: true, motherId: 3, fatherId: 1, generation: 2,
    });
    const adopted = human({ id: 7, name: 'Adopted', gender: 'male', age: 25, adoptiveFatherId: 1, generation: 2 });
    const all = [father, firstWife, secondWife, earlierChild, currentChild, bastard, adopted];

    const tree = buildFullFamilyTree(father, all);
    // The earlier marriage is named; the child of the current one is not.
    expect(personIn(tree, 4)?.detail).toBe('20y · with Margery');
    expect(personIn(tree, 5)?.detail).toBe('9y');
    expect(relationOf(tree, 4)).toBe('Adult child');
    expect(relationOf(tree, 6)).toBe('Child · outside wedlock');

    // The same record reads as an adoptive father from the adopted settler's side.
    const adoptedTree = buildFullFamilyTree(adopted, all);
    expect(relationOf(adoptedTree, 1)).toBe('Adoptive father');
    expect(relationOf(adoptedTree, 4)).toBe('Sibling');
  });
});

describe('groupFamiliesByLineage', () => {
  it('separates two unrelated lines that happen to share a surname', () => {
    // The failure this replaces: a surname index read same-named strangers as one family. A surname
    // also arrives by marriage, by adoption and from a random pool, so it cannot carry kinship.
    const ashFounder = human({ id: 1, name: 'Anselm', surname: 'Ash', gender: 'male', generation: 1 });
    const ashChild = human({ id: 2, name: 'Bram', surname: 'Ash', gender: 'male', fatherId: 1, generation: 2 });
    const ashGrandchild = human({ id: 3, name: 'Cedric', surname: 'Ash', gender: 'male', fatherId: 2, generation: 3 });
    const otherRoot = human({ id: 4, name: 'Dunstan', surname: 'Ash', gender: 'male', generation: 1 });
    const otherChild = human({ id: 5, name: 'Edric', surname: 'Ash', gender: 'male', fatherId: 4, generation: 2 });

    const groups = groupFamiliesByLineage([ashFounder, ashChild, ashGrandchild, otherRoot, otherChild]);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.rootId).toBe(1);
    expect(groups[0]!.rootName).toBe('Anselm Ash');
    expect(groups[0]!.members.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(groups[0]!.generations).toBe(3);
    expect(groups[1]!.rootId).toBe(4);
    expect(groups[1]!.members.map((m) => m.id)).toEqual([4, 5]);
  });

  it("keeps a married-in spouse in her own father's line, not her husband's", () => {
    // Exactly why the surname lied: on marriage she takes the household surname, but she does not
    // descend from his line.
    const herFather = human({ id: 1, name: 'Osric', surname: 'Wold', gender: 'male', generation: 1 });
    const wife = human({
      id: 2, name: 'Hilda', surname: 'Ash', maidenSurname: 'Wold', gender: 'female',
      fatherId: 1, partnerId: 3, generation: 2,
    });
    const husband = human({ id: 3, name: 'Anselm', surname: 'Ash', gender: 'male', partnerId: 2, generation: 1 });
    const child = human({ id: 4, name: 'Bram', surname: 'Ash', gender: 'male', motherId: 2, fatherId: 3, generation: 2 });

    const groups = groupFamiliesByLineage([herFather, wife, husband, child]);

    expect(groups.map((g) => g.rootId).sort((a, b) => a - b)).toEqual([1, 3]);
    expect(groups.find((g) => g.rootId === 1)!.members.map((m) => m.id)).toEqual([1, 2]);
    expect(groups.find((g) => g.rootId === 3)!.members.map((m) => m.id)).toEqual([3, 4]);
  });

  it('keeps a line rooted in a founder who has died', () => {
    // Members are the living, the root is not: a line must outlive its first generation.
    const deadFounder = human({ id: 1, name: 'Anselm', surname: 'Ash', gender: 'male', alive: false, generation: 1 });
    const son = human({ id: 2, name: 'Bram', surname: 'Ash', gender: 'male', fatherId: 1, generation: 2 });

    const groups = groupFamiliesByLineage([deadFounder, son]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.rootId).toBe(1);
    expect(groups[0]!.rootName).toBe('Anselm Ash');
    expect(groups[0]!.members.map((m) => m.id)).toEqual([2]);
  });

  it('orders a line by descent, then birth order', () => {
    // Name order read as arbitrary on a family tree; the eldest of a generation comes first.
    const root = human({ id: 1, name: 'Zyra', gender: 'female', generation: 1 });
    const younger = human({ id: 2, name: 'Aaa', motherId: 1, generation: 2, age: 20 });
    const older = human({ id: 3, name: 'Zzz', motherId: 1, generation: 2, age: 40 });

    const groups = groupFamiliesByLineage([root, younger, older]);

    expect(groups[0]!.members.map((m) => m.name)).toEqual(['Zyra', 'Zzz', 'Aaa']);
  });

  it('heads one line for a founding couple, not two', () => {
    // A founding household is a pair, so both partners must key the same line.
    const husband = human({ id: 1, name: 'Anselm', gender: 'male', partnerId: 2, generation: 1 });
    const wife = human({ id: 2, name: 'Hilda', gender: 'female', partnerId: 1, generation: 1 });
    const child = human({ id: 3, name: 'Bram', gender: 'male', motherId: 2, fatherId: 1, generation: 2 });

    const groups = groupFamiliesByLineage([husband, wife, child]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.rootId).toBe(1);
    expect(groups[0]!.rootName).toBe('Anselm & Hilda Ash');
    expect(groups[0]!.members.map((m) => m.id)).toEqual([1, 2, 3]);
  });
});
