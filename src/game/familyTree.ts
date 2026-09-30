
/**
 * Living kinship for the Valley overview stamboom — grandparents, aunts/uncles,
 * parents, spouse, siblings, children, nephews/nieces, grandchildren.
 * Pure reads of motherId / fatherId / partnerId / childrenIds.
 */
import { humanDisplayName } from './citizenId';
import { EntityType, type Entity } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { isMarriedOrExpecting } from './civilStatus';
import { HUMAN_ADULT_MIN_AGE } from './dayCycleConstants';

export type KinRelation =
  | 'grandmother'
  | 'grandfather'
  | 'aunt'
  | 'uncle'
  | 'mother'
  | 'father'
  | 'spouse'
  | 'sibling'
  | 'child'
  | 'adult_child'
  | 'bastard_child'
  | 'nephew'
  | 'niece'
  | 'grandchild';

export interface KinMember {
  id: number;
  name: string;
  relation: KinRelation;
  /** Short English label for UI. */
  relationLabel: string;
  icon: string;
  generation: number;
  isJuvenile: boolean;
  gender?: 'male' | 'female';
}

export interface FamilyTree {
  focusId: number;
  focusName: string;
  /** Ordered for display: older generations first. */
  members: KinMember[];
  counts: {
    grandparents: number;
    auntsUncles: number;
    parents: number;
    siblings: number;
    children: number;
    nephewsNieces: number;
    grandchildren: number;
  };
}

export interface FamilySurnameGroup {
  surname: string;
  members: Entity[];
  adults: number;
  children: number;
  generations: number;
}

const RELATION_LABEL: Record<KinRelation, string> = {
  grandmother: 'Grandmother',
  grandfather: 'Grandfather',
  aunt: 'Aunt',
  uncle: 'Uncle',
  mother: 'Mother',
  father: 'Father',
  spouse: 'Spouse',
  sibling: 'Sibling',
  child: 'Child',
  adult_child: 'Adult child',
  bastard_child: 'Bastard child',
  nephew: 'Nephew',
  niece: 'Niece',
  grandchild: 'Grandchild',
};

function livingHumans(all: readonly Entity[]): Entity[] {
  return all.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));
}

function byId(all: readonly Entity[], id: number | undefined): Entity | undefined {
  if (id == null) return undefined;
  return all.find((e) => e.id === id && e.alive && e.type === EntityType.Human);
}

function isChildOf(child: Entity, parent: Entity): boolean {
  return (
    child.motherId === parent.id
    || child.fatherId === parent.id
    || child.adoptiveMotherId === parent.id
    || child.adoptiveFatherId === parent.id
    || (parent.childrenIds ?? []).includes(child.id)
  );
}

function childRelation(child: Entity): KinRelation {
  if (child.isBastard) return 'bastard_child';
  // Age, not `isJuvenile`. `isJuvenile` is recomputed from `HUMAN_CHILDHOOD_DAYS` (12), which is the
  // *graduation* age, while the documented adult floor is `HUMAN_ADULT_MIN_AGE` (18). Between the two a
  // settler is neither — and reading `isJuvenile` labelled a 16-year-old an "Adult child" (owner:
  // *"16 years it not an adult?"*). The age ladder has one owner; this asks it instead of the flag.
  return child.age >= HUMAN_ADULT_MIN_AGE ? 'adult_child' : 'child';
}

function iconFor(relation: KinRelation, gender?: 'male' | 'female'): string {
  switch (relation) {
    case 'grandmother':
    case 'mother':
      return '👩';
    case 'grandfather':
    case 'father':
      return '👨';
    case 'aunt':
      return '👩';
    case 'uncle':
      return '👨';
    case 'spouse':
      return gender === 'male' ? '👨' : '👩';
    case 'sibling':
    case 'child':
    case 'adult_child':
    case 'bastard_child':
    case 'nephew':
    case 'niece':
    case 'grandchild':
      return gender === 'male' ? '👦' : '👧';
    default:
      return '👤';
  }
}

function generationRank(relation: KinRelation): number {
  switch (relation) {
    case 'grandmother':
    case 'grandfather':
      return 0;
    case 'aunt':
    case 'uncle':
    case 'mother':
    case 'father':
      return 1;
    case 'spouse':
    case 'sibling':
      return 2;
    case 'child':
    case 'adult_child':
    case 'bastard_child':
    case 'nephew':
    case 'niece':
      return 3;
    case 'grandchild':
      return 4;
    default:
      return 5;
  }
}

/**
 * Build the living kinship view for one settler (stamboom slice).
 */
export function buildFamilyTree(focus: Entity, allEntities: readonly Entity[]): FamilyTree {
  const people = livingHumans(allEntities);
  const members: KinMember[] = [];
  const seen = new Set<number>();

  const add = (person: Entity | undefined, relation: KinRelation) => {
    if (!person || person.id === focus.id || seen.has(person.id)) return;
    seen.add(person.id);
    members.push({
      id: person.id,
      name: humanDisplayName(person),
      relation,
      relationLabel: RELATION_LABEL[relation],
      icon: iconFor(relation, person.gender),
      generation: generationRank(relation),
      isJuvenile: !!person.isJuvenile,
      gender: person.gender,
    });
  };

  const mother = byId(people, focus.motherId) ?? byId(people, focus.adoptiveMotherId);
  const father = byId(people, focus.fatherId) ?? byId(people, focus.adoptiveFatherId);
  add(mother, 'mother');
  add(father, 'father');

  // Grandparents
  if (mother) {
    add(byId(people, mother.motherId) ?? byId(people, mother.adoptiveMotherId), 'grandmother');
    add(byId(people, mother.fatherId) ?? byId(people, mother.adoptiveFatherId), 'grandfather');
  }
  if (father) {
    add(byId(people, father.motherId) ?? byId(people, father.adoptiveMotherId), 'grandmother');
    add(byId(people, father.fatherId) ?? byId(people, father.adoptiveFatherId), 'grandfather');
  }

  // Aunts / uncles — siblings of parents
  const parentIds = new Set<number>();
  if (mother) parentIds.add(mother.id);
  if (father) parentIds.add(father.id);

  for (const parent of [mother, father]) {
    if (!parent) continue;
    for (const person of people) {
      if (person.id === parent.id || person.id === focus.id) continue;
      if (parentIds.has(person.id)) continue;
      const sharesMother = parent.motherId != null && person.motherId === parent.motherId;
      const sharesFather = parent.fatherId != null && person.fatherId === parent.fatherId;
      if (!sharesMother && !sharesFather) continue;
      add(person, person.gender === 'male' ? 'uncle' : 'aunt');
    }
  }

  // Active Spouse only — divorced ex-partners never display as active spouse
  if (isMarriedOrExpecting(focus)) {
    const spouse = byId(people, focus.partnerId)
      ?? people.find((p) => p.partnerId === focus.id && isMarriedOrExpecting(p));
    if (spouse) add(spouse, 'spouse');
  }

  // Siblings (including half-siblings)
  const siblings: Entity[] = [];
  for (const person of people) {
    if (person.id === focus.id) continue;
    const shareMother = focus.motherId != null && person.motherId === focus.motherId;
    const shareFather = focus.fatherId != null && person.fatherId === focus.fatherId;
    if (shareMother || shareFather) {
      siblings.push(person);
      add(person, 'sibling');
    }
  }

  // Children
  const children: Entity[] = [];
  for (const person of people) {
    if (isChildOf(person, focus)) {
      children.push(person);
      add(person, childRelation(person));
    }
  }

  // Nephews / nieces — siblings' children
  for (const sibling of siblings) {
    for (const person of people) {
      if (isChildOf(person, sibling)) {
        add(person, person.gender === 'male' ? 'nephew' : 'niece');
      }
    }
  }

  // Grandchildren
  for (const child of children) {
    for (const person of people) {
      if (isChildOf(person, child)) {
        add(person, 'grandchild');
      }
    }
  }

  members.sort(
    (a, b) =>
      a.generation - b.generation
      || a.relationLabel.localeCompare(b.relationLabel)
      || a.name.localeCompare(b.name),
  );

  return {
    focusId: focus.id,
    focusName: humanDisplayName(focus),
    members,
    counts: {
      grandparents: members.filter((m) => m.relation === 'grandmother' || m.relation === 'grandfather').length,
      auntsUncles: members.filter((m) => m.relation === 'aunt' || m.relation === 'uncle').length,
      parents: members.filter((m) => m.relation === 'mother' || m.relation === 'father').length,
      siblings: members.filter((m) => m.relation === 'sibling').length,
      children: members.filter((m) =>
        m.relation === 'child' || m.relation === 'adult_child' || m.relation === 'bastard_child'
      ).length,
      nephewsNieces: members.filter((m) => m.relation === 'nephew' || m.relation === 'niece').length,
      grandchildren: members.filter((m) => m.relation === 'grandchild').length,
    },
  };
}

/** Living player humans grouped by surname for the Families browser. */
export function groupFamiliesBySurname(allEntities: readonly Entity[]): FamilySurnameGroup[] {
  const people = livingHumans(allEntities);
  const bySurname = new Map<string, Entity[]>();
  for (const person of people) {
    const key = (person.surname ?? 'Unknown').trim() || 'Unknown';
    const list = bySurname.get(key) ?? [];
    list.push(person);
    bySurname.set(key, list);
  }
  const groups: FamilySurnameGroup[] = [];
  for (const [surname, members] of bySurname) {
    groups.push({
      surname,
      members: members.slice().sort((a, b) =>
        (a.generation ?? 1) - (b.generation ?? 1)
        || humanDisplayName(a).localeCompare(humanDisplayName(b))
      ),
      adults: members.filter((m) => !m.isJuvenile).length,
      children: members.filter((m) => !!m.isJuvenile).length,
      generations: new Set(members.map((m) => m.generation ?? 1)).size,
    });
  }
  return groups.sort((a, b) => b.members.length - a.members.length || a.surname.localeCompare(b.surname));
}