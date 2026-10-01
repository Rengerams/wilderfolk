
/**
 * Living kinship for the Valley overview stamboom — grandparents, aunts/uncles,
 * parents, spouse, siblings, children, nephews/nieces, grandchildren.
 * Pure reads of motherId / fatherId / partnerId / childrenIds.
 */
import { citizenGivenName, humanDisplayName } from './citizenId';
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

/**
 * One family line: everyone descending from the same settler who has no recorded parent.
 *
 * Descent, not a surname. A surname is a label the sim also gives out by marriage, by adoption and
 * from a random pool, so two unrelated settlers can share one; a parent link cannot be acquired by
 * accident. The root is a founding household, or the household a later arrival came as.
 */
export interface FamilyLineageGroup {
  /** The parentless settler heading this line, or the lower id of a founding couple. */
  rootId: number;
  /** The root household, for the group's label: one founder's name, or a couple's two. */
  rootName: string;
  /** Living members of this line. */
  members: Entity[];
  adults: number;
  children: number;
  /** Distinct `Entity.generation` values among the living members. */
  generations: number;
}

const LINEAGE_PARENT_KEYS = ['fatherId', 'motherId', 'adoptiveFatherId', 'adoptiveMotherId'] as const;

/** A settler's recorded parents, present in `all` and not themselves. Father's line first. */
function lineageParentIds(person: Entity, all: ReadonlyMap<number, Entity>): number[] {
  const ids: number[] = [];
  for (const key of LINEAGE_PARENT_KEYS) {
    const id = person[key];
    if (id == null || id === person.id || !all.has(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}

/** Living player humans grouped by the family line they descend from. */
export function groupFamiliesByLineage(allEntities: readonly Entity[]): FamilyLineageGroup[] {
  // Built over *every* entity, the dead included: a founder who died still heads their line, which
  // is what makes a line outlive its first generation.
  const all = new Map<number, Entity>();
  for (const e of allEntities) {
    if (e.type === EntityType.Human && isPlayerHuman(e)) all.set(e.id, e);
  }

  const rootCache = new Map<number, number>();
  const rootOf = (startId: number): number => {
    const cached = rootCache.get(startId);
    if (cached != null) return cached;
    let current = startId;
    const walked: number[] = [];
    const seen = new Set<number>([startId]);
    for (;;) {
      const person = all.get(current);
      const next = person ? lineageParentIds(person, all)[0] : undefined;
      // `seen` guards a parent/child cycle, which would otherwise never terminate.
      if (next == null || seen.has(next)) break;
      seen.add(next);
      walked.push(next);
      current = next;
    }
    // A founding couple heads one line, so the pair keys on its lower id rather than splitting.
    const top = all.get(current);
    const partnerId = top?.partnerId;
    if (partnerId != null && all.has(partnerId) && lineageParentIds(all.get(partnerId)!, all).length === 0) {
      current = Math.min(current, partnerId);
    }
    for (const id of walked) rootCache.set(id, current);
    rootCache.set(startId, current);
    return current;
  };

  const byRoot = new Map<number, Entity[]>();
  for (const person of livingHumans(allEntities)) {
    const root = rootOf(person.id);
    const list = byRoot.get(root);
    if (list) list.push(person);
    else byRoot.set(root, [person]);
  }

  const groups: FamilyLineageGroup[] = [];
  for (const [rootId, members] of byRoot) {
    const root = all.get(rootId);
    const partner = root?.partnerId != null ? all.get(root.partnerId) : undefined;
    groups.push({
      rootId,
      rootName: lineageLabel(root, partner, rootId),
      members: members.slice().sort((a, b) =>
        (a.generation ?? 1) - (b.generation ?? 1)
        // Birth order: the eldest of a generation reads first.
        || b.age - a.age
        || humanDisplayName(a).localeCompare(humanDisplayName(b))
      ),
      adults: members.filter((m) => !m.isJuvenile).length,
      children: members.filter((m) => !!m.isJuvenile).length,
      generations: new Set(members.map((m) => m.generation ?? 1)).size,
    });
  }
  return groups.sort((a, b) => b.members.length - a.members.length || a.rootName.localeCompare(b.rootName));
}

/** The root household's label: one founder's name, or a couple's — "Anselm & Hilda Ash". */
function lineageLabel(root: Entity | undefined, partner: Entity | undefined, rootId: number): string {
  if (!root) return `Line ${rootId}`;
  if (!partner || partner.id === root.id) return humanDisplayName(root);
  const surname = root.surname?.trim();
  // Sharing the household surname is the normal case after marriage, and repeating it reads badly.
  if (surname && surname === partner.surname?.trim()) {
    return `${citizenGivenName(root)} & ${humanDisplayName(partner)}`;
  }
  return `${humanDisplayName(root)} & ${humanDisplayName(partner)}`;
}

/* ---- The whole connected family ---- */

/** Generations drawn above and below the focused settler; a spouse sits on the focus's own row. */
const MAX_ANCESTOR_GENERATIONS = 2;
const MAX_DESCENDANT_GENERATIONS = 2;

/** Hard people cap after the generation bound. The walk is breadth-first, so it cuts the farthest kin. */
const MAX_FAMILY_MEMBERS = 200;

/** `great-` steps a relation word carries before it falls back to `Ancestor`, `Descendant` or `Kin`. */
const MAX_GREAT_STEPS = 3;

/** One member of the connected family, on the generation row they belong to. */
export interface FamilyTreePerson {
  id: number;
  /** The settler's display name, from `humanDisplayName`. */
  name: string;
  /** How they are related to the focused settler: `Mother`, `Grandchild`, `Aunt`, `In-law`; empty for the focus. */
  relation: string;
  icon: string;
  /** Age, plus the co-parent's name for a child of the focused settler who is not their spouse's. */
  detail: string;
  /** True for the settler the window was opened on. */
  isFocus: boolean;
  isJuvenile: boolean;
  gender?: 'male' | 'female';
}

/** One generation of the family, `delta` rows from the focused settler's own row. */
export interface FamilyTreeRow {
  /** Row offset from the focused settler: negative is older, `0` is their own generation. */
  delta: number;
  label: string;
  members: FamilyTreePerson[];
}

/** The whole connected family of one settler, oldest generation first. */
export interface FullFamilyTree {
  focusId: number;
  focusName: string;
  rows: FamilyTreeRow[];
  /** Everyone drawn, the focused settler included. */
  memberCount: number;
  /** True when `MAX_FAMILY_MEMBERS` cut the family short. */
  truncated: boolean;
  /** Member id → the ids of their parents inside this tree: the edges a drawing needs to branch. */
  parentLinks: ReadonlyMap<number, readonly number[]>;
}

/** Adds `to` to `from`'s own link list, ignoring a repeat. */
function pushLink(links: Map<number, number[]>, from: number, to: number): void {
  const list = links.get(from);
  if (!list) {
    links.set(from, [to]);
    return;
  }
  if (!list.includes(to)) list.push(to);
}

/** Every parent id a settler's record names, birth and adoptive, so a sibling test counts both. */
function parentIdSet(person: Entity): Set<number> {
  const ids = new Set<number>();
  for (const id of [person.motherId, person.fatherId, person.adoptiveMotherId, person.adoptiveFatherId]) {
    if (id != null) ids.add(id);
  }
  return ids;
}

/**
 * Every id reachable from `start` through `step`, `start` excluded. The visited set is the cycle guard,
 * so a parent/child cycle stops at the second visit instead of recurring without end.
 */
function reachableFrom(start: number, step: (id: number) => readonly number[]): Set<number> {
  const found = new Set<number>();
  const stack: number[] = [start];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined) break;
    for (const next of step(id)) {
      if (next === start || found.has(next)) continue;
      found.add(next);
      stack.push(next);
    }
  }
  return found;
}

/** `seeds` plus everything reachable from them through `step`, with the same cycle guard. */
function closureOf(seeds: Iterable<number>, step: (id: number) => readonly number[]): Set<number> {
  const found = new Set<number>();
  const stack: number[] = [];
  for (const seed of seeds) {
    if (found.has(seed)) continue;
    found.add(seed);
    stack.push(seed);
  }
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined) break;
    for (const next of step(id)) {
      if (found.has(next)) continue;
      found.add(next);
      stack.push(next);
    }
  }
  return found;
}

/** The `great-` ladder for a generation `steps` beyond a base word, capped so the word stays readable. */
function generationPrefix(steps: number): string {
  const capped = Math.min(steps, MAX_GREAT_STEPS);
  if (capped <= 0) return '';
  const parts = ['Great-'];
  for (let step = 1; step < capped; step += 1) parts.push('great-');
  return parts.join('');
}

/** `Child` / `Adult child`, marked when born outside wedlock. Age decides "adult" — see `childRelation`. */
function childLabel(person: Entity): string {
  const relation = childRelation(person);
  if (relation === 'child') return RELATION_LABEL.child;
  if (relation === 'adult_child') return RELATION_LABEL.adult_child;
  return person.age >= HUMAN_ADULT_MIN_AGE ? 'Adult child · outside wedlock' : 'Child · outside wedlock';
}

/** The small portrait glyph for one person on the tree, from their own life stage. */
function iconForPerson(person: Entity): string {
  if (person.isJuvenile) return person.gender === 'male' ? '👦' : '👧';
  return person.gender === 'male' ? '👨' : '👩';
}

interface RelationFlags {
  isPartner: boolean;
  isSibling: boolean;
  isAncestor: boolean;
  isDescendant: boolean;
  /** Descends from the focus's own line, i.e. a blood or adoptive relative rather than a married-in one. */
  isBlood: boolean;
  /** Married to one of the focus's parents, so a step-parent rather than an in-law. */
  isParentSpouse: boolean;
  /** The other parent of one of the focus's children. */
  isCoParent: boolean;
  /** A co-parent whose shared child was born in wedlock: the marriage existed, then ended. */
  wasSpouse: boolean;
}

/** How `person` is related to the focus, from their row offset and the edges that reach them. */
function relationLabelOf(focus: Entity, person: Entity, delta: number, flags: RelationFlags): string {
  const male = person.gender === 'male';
  // An ancestor cycle can put them on or below the focus's row, where the word has no depth to read.
  if (flags.isAncestor) {
    if (delta >= 0) return 'Ancestor';
    if (delta === -1) {
      const adoptiveId = male ? focus.adoptiveFatherId : focus.adoptiveMotherId;
      const birthId = male ? focus.fatherId : focus.motherId;
      const adoptiveOnly = person.id === adoptiveId && person.id !== birthId;
      if (adoptiveOnly) return male ? 'Adoptive father' : 'Adoptive mother';
      return male ? 'Father' : 'Mother';
    }
    const depth = -delta;
    if (depth === 2) return male ? 'Grandfather' : 'Grandmother';
    if (depth <= 2 + MAX_GREAT_STEPS) {
      return `${generationPrefix(depth - 2)}${male ? 'grandfather' : 'grandmother'}`;
    }
    return 'Ancestor';
  }
  if (flags.isDescendant) {
    if (delta <= 0) return 'Descendant';
    if (delta === 1) return childLabel(person);
    if (delta === 2) return 'Grandchild';
    if (delta <= 2 + MAX_GREAT_STEPS) return `${generationPrefix(delta - 2)}grandchild`;
    return 'Descendant';
  }
  if (delta === 0) {
    if (flags.isPartner) return 'Spouse';
    if (flags.isSibling) return 'Sibling';
    // A divorce clears both `partnerId` links, so a former spouse arrives here as a co-parent: the
    // children they share are what still ties them to the focus. Blood keeps its own word — a relative
    // who raised the child is still a relative.
    if (flags.isCoParent && !flags.isBlood) return flags.wasSpouse ? 'Former spouse' : 'Co-parent';
    return flags.isBlood ? 'Cousin' : 'In-law';
  }
  if (!flags.isBlood) {
    if (flags.isParentSpouse) return male ? 'Stepfather' : 'Stepmother';
    return 'In-law';
  }
  const steps = Math.abs(delta);
  if (delta < 0) {
    if (steps === 1) return male ? 'Uncle' : 'Aunt';
    if (steps <= 1 + MAX_GREAT_STEPS) return `${generationPrefix(steps - 1)}${male ? 'uncle' : 'aunt'}`;
    return 'Kin';
  }
  if (steps === 1) return male ? 'Nephew' : 'Niece';
  if (steps <= 1 + MAX_GREAT_STEPS) return `${generationPrefix(steps - 1)}grand-${male ? 'nephew' : 'niece'}`;
  return 'Kin';
}

/** Row heading `delta` generations from the focus; the middle rows hold collateral relatives too. */
function familyRowLabel(delta: number): string {
  if (delta === 0) return 'Spouse & siblings';
  if (delta === -1) return 'Parents & aunts / uncles';
  if (delta === -2) return 'Grandparents';
  if (delta <= -3) return `${generationPrefix(-delta - 2)}grandparents`;
  if (delta === 1) return 'Children & nephews / nieces';
  if (delta === 2) return 'Grandchildren';
  return `${generationPrefix(delta - 2)}grandchildren`;
}

/**
 * One settler's kin as generation rows, **anchored on that settler**: ancestors up, descendants down, a
 * spouse on their own row. A marriage links two branches, so an unbounded walk crosses into every
 * in-law in the colony and the tree stops being about the settler it was opened on.
 */
export function buildFullFamilyTree(focus: Entity, allEntities: readonly Entity[]): FullFamilyTree {
  const people = livingHumans(allEntities);
  const byId = new Map<number, Entity>();
  for (const person of people) byId.set(person.id, person);
  // The focus is normally one of `people`; drawing its tree anyway beats an empty window.
  if (!byId.has(focus.id)) byId.set(focus.id, focus);

  const parentLinks = new Map<number, number[]>();
  const childLinks = new Map<number, number[]>();
  const partnerLinks = new Map<number, number[]>();
  for (const person of byId.values()) {
    const parentIds = [person.motherId, person.fatherId, person.adoptiveMotherId, person.adoptiveFatherId];
    for (const parentId of parentIds) {
      if (parentId == null || parentId === person.id || !byId.has(parentId)) continue;
      pushLink(parentLinks, person.id, parentId);
      pushLink(childLinks, parentId, person.id);
    }
    for (const childId of person.childrenIds ?? []) {
      if (childId === person.id || !byId.has(childId)) continue;
      pushLink(childLinks, person.id, childId);
      pushLink(parentLinks, childId, person.id);
    }
    const partnerId = person.partnerId;
    if (partnerId == null || partnerId === person.id || !byId.has(partnerId)) continue;
    pushLink(partnerLinks, person.id, partnerId);
    // A marriage joins two branches even when only one side still carries the id.
    pushLink(partnerLinks, partnerId, person.id);
  }

  // Breadth-first by kinship distance, so the people cap always spends itself on the farthest kin:
  // depth-first filled the cap from one deep branch and could drop the focus's own children.
  type Step = { id: number; up: number; down: number };
  const seen = new Set<number>([focus.id]);
  const bestBy = new Map<number, Array<{ up: number; down: number }>>([[focus.id, [{ up: 0, down: 0 }]]]);
  const queue: Step[] = [{ id: focus.id, up: 0, down: 0 }];
  let truncated = false;
  const atLeastAsClose = (a: { up: number; down: number }, b: { up: number; down: number }): boolean =>
    a.up <= b.up && a.down <= b.down;

  let queueHead = 0;
  while (queueHead < queue.length) {
    const current = queue[queueHead];
    queueHead += 1;
    if (current === undefined) break;
    const steps: Step[] = [
      ...(parentLinks.get(current.id) ?? []).map((id) => ({ id, up: current.up + 1, down: current.down })),
      ...(childLinks.get(current.id) ?? []).map((id) => ({ id, up: current.up, down: current.down + 1 })),
      ...(partnerLinks.get(current.id) ?? []).map((id) => ({ id, up: current.up, down: current.down })),
    ];
    for (const step of steps) {
      // Beyond the window is not truncation: the generation bound is what the tree *is*, so only the
      // people cap below may set `truncated`.
      if (step.up > MAX_ANCESTOR_GENERATIONS || step.down > MAX_DESCENDANT_GENERATIONS) continue;
      const known = bestBy.get(step.id) ?? [];
      if (known.some((earlier) => atLeastAsClose(earlier, step))) continue;
      if (!seen.has(step.id)) {
        if (seen.size >= MAX_FAMILY_MEMBERS) {
          truncated = true;
          continue;
        }
        seen.add(step.id);
      }
      bestBy.set(step.id, [
        ...known.filter((earlier) => !atLeastAsClose(step, earlier)),
        { up: step.up, down: step.down },
      ]);
      queue.push(step);
    }
  }

  // Partners share one group, so a couple sits on one row wherever their own lines sit.
  const groupParent = new Map<number, number>();
  for (const id of seen) groupParent.set(id, id);
  const groupOf = (id: number): number => {
    let root = id;
    let parent = groupParent.get(root);
    while (parent !== undefined && parent !== root) {
      root = parent;
      parent = groupParent.get(root);
    }
    let walk = id;
    while (walk !== root) {
      const next = groupParent.get(walk);
      if (next === undefined) break;
      groupParent.set(walk, root);
      walk = next;
    }
    return root;
  };
  const mergeGroups = (a: number, b: number): void => {
    const rootA = groupOf(a);
    const rootB = groupOf(b);
    if (rootA !== rootB) groupParent.set(rootB, rootA);
  };
  for (const [id, partners] of partnerLinks) {
    if (!seen.has(id)) continue;
    for (const partnerId of partners) {
      if (seen.has(partnerId)) mergeGroups(id, partnerId);
    }
  }

  // Longest descent path from the oldest recorded generation; Kahn's order ranks each group once.
  const childGroups = new Map<number, number[]>();
  const groupInDegree = new Map<number, number>();
  for (const id of seen) groupInDegree.set(groupOf(id), 0);
  for (const [childId, parentIds] of parentLinks) {
    if (!seen.has(childId)) continue;
    const childGroup = groupOf(childId);
    for (const parentId of parentIds) {
      if (!seen.has(parentId)) continue;
      const parentGroup = groupOf(parentId);
      // Partners who are also parent and child share one row; that edge would be a cycle of its own.
      if (parentGroup === childGroup) continue;
      const childrenOfGroup = childGroups.get(parentGroup);
      if (childrenOfGroup) {
        if (childrenOfGroup.includes(childGroup)) continue;
        childrenOfGroup.push(childGroup);
      } else {
        childGroups.set(parentGroup, [childGroup]);
      }
      groupInDegree.set(childGroup, (groupInDegree.get(childGroup) ?? 0) + 1);
    }
  }

  const groupRank = new Map<number, number>();
  const ranked: number[] = [];
  for (const [group, inDegree] of groupInDegree) {
    if (inDegree !== 0) continue;
    groupRank.set(group, 0);
    ranked.push(group);
  }
  let head = 0;
  while (head < ranked.length) {
    const group = ranked[head];
    head += 1;
    if (group === undefined) break;
    const rank = groupRank.get(group) ?? 0;
    for (const childGroup of childGroups.get(group) ?? []) {
      groupRank.set(childGroup, Math.max(groupRank.get(childGroup) ?? 0, rank + 1));
      const remaining = (groupInDegree.get(childGroup) ?? 0) - 1;
      groupInDegree.set(childGroup, remaining);
      if (remaining === 0) ranked.push(childGroup);
    }
  }
  // A group left unranked sits in a parent/child cycle and has no consistent generation: it takes the
  // row below its deepest ranked parent, or the oldest row when it has none.
  for (const group of groupInDegree.keys()) {
    if (groupRank.has(group)) continue;
    let rank = 0;
    for (const [parentGroup, childrenOfGroup] of childGroups) {
      if (!childrenOfGroup.includes(group)) continue;
      const parentRank = groupRank.get(parentGroup);
      if (parentRank !== undefined) rank = Math.max(rank, parentRank + 1);
    }
    groupRank.set(group, rank);
  }

  const rowOf = new Map<number, number>();
  for (const id of seen) rowOf.set(id, groupRank.get(groupOf(id)) ?? 0);
  const focusRow = rowOf.get(focus.id) ?? 0;

  const ancestorsOfFocus = reachableFrom(focus.id, (id) => parentLinks.get(id) ?? []);
  const descendantsOfFocus = reachableFrom(focus.id, (id) => childLinks.get(id) ?? []);
  // Blood means "descends from the focus's own line": one downward closure from the focus and every
  // ancestor, which is what keeps a married-in spouse an in-law rather than a cousin.
  const bloodLine = closureOf([focus.id, ...ancestorsOfFocus], (id) => childLinks.get(id) ?? []);
  const partnersOfFocus = new Set<number>(partnerLinks.get(focus.id) ?? []);
  const parentsOfFocus = parentIdSet(focus);
  // A parent's spouse is the focus's step-parent: a married-in relation, but not the generic in-law
  // a sibling's or uncle's spouse is, and the difference is the word on their row.
  const parentSpouseIds = new Set<number>();
  for (const parentId of parentsOfFocus) {
    for (const spouseId of partnerLinks.get(parentId) ?? []) {
      if (spouseId !== focus.id) parentSpouseIds.add(spouseId);
    }
  }
  const siblingsOfFocus = new Set<number>();
  for (const id of seen) {
    const person = byId.get(id);
    if (!person) continue;
    // A sibling shares any parent with the focus — birth or adoptive, from either side of the record.
    for (const parentId of parentIdSet(person)) {
      if (!parentsOfFocus.has(parentId)) continue;
      siblingsOfFocus.add(id);
      break;
    }
  }

  const detailOf = (person: Entity): string => {
    const age = `${Math.floor(person.age)}y`;
    if (person.id === focus.id) return age;
    const isChildOfFocus =
      person.motherId === focus.id
      || person.fatherId === focus.id
      || person.adoptiveMotherId === focus.id
      || person.adoptiveFatherId === focus.id
      || (focus.childrenIds ?? []).includes(person.id);
    if (!isChildOfFocus) return age;
    // Name the other parent when it is NOT this settler's spouse, so a child from an earlier marriage
    // is never attributed to the current one.
    const otherParentId =
      person.motherId === focus.id || person.adoptiveMotherId === focus.id
        ? person.fatherId ?? person.adoptiveFatherId
        : person.motherId ?? person.adoptiveMotherId;
    if (otherParentId == null || otherParentId === focus.partnerId || otherParentId === focus.id) return age;
    const otherParent = byId.get(otherParentId);
    return otherParent ? `${age} · with ${citizenGivenName(otherParent)}` : age;
  };

  // The other parent of one of the focus's children. A divorced couple keeps no link to each other, so
  // this shared child is the only remaining trace of the marriage — and whether that child was born in
  // wedlock is what says the marriage existed before it ended.
  const coParentIds = new Set<number>();
  const marriedCoParentIds = new Set<number>();
  for (const person of people) {
    const isChildOfFocus =
      person.motherId === focus.id
      || person.fatherId === focus.id
      || person.adoptiveMotherId === focus.id
      || person.adoptiveFatherId === focus.id
      || (focus.childrenIds ?? []).includes(person.id);
    if (!isChildOfFocus) continue;
    const otherParentId =
      person.motherId === focus.id || person.adoptiveMotherId === focus.id
        ? person.fatherId ?? person.adoptiveFatherId
        : person.motherId ?? person.adoptiveMotherId;
    if (otherParentId == null || otherParentId === focus.id) continue;
    coParentIds.add(otherParentId);
    if (!person.isBastard) marriedCoParentIds.add(otherParentId);
  }

  const idsByRow = new Map<number, Entity[]>();
  for (const id of seen) {
    const person = byId.get(id);
    if (!person) continue;
    const row = rowOf.get(id) ?? 0;
    const list = idsByRow.get(row);
    if (list) list.push(person);
    else idsByRow.set(row, [person]);
  }

  const rows: FamilyTreeRow[] = [...idsByRow.keys()]
    .sort((a, b) => a - b)
    .map((row) => {
      const delta = row - focusRow;
      const members = (idsByRow.get(row) ?? [])
        // The focus leads their own row; the rest read in name order on every render.
        .sort((a, b) =>
          Number(b.id === focus.id) - Number(a.id === focus.id)
          || humanDisplayName(a).localeCompare(humanDisplayName(b))
          || a.id - b.id
        )
        .map((person): FamilyTreePerson => {
          const isFocus = person.id === focus.id;
          return {
            id: person.id,
            name: humanDisplayName(person),
            relation: isFocus
              ? ''
              : relationLabelOf(focus, person, delta, {
                isPartner: partnersOfFocus.has(person.id),
                isSibling: siblingsOfFocus.has(person.id),
                isAncestor: ancestorsOfFocus.has(person.id),
                isDescendant: descendantsOfFocus.has(person.id),
                isBlood: bloodLine.has(person.id),
                isParentSpouse: parentSpouseIds.has(person.id),
                isCoParent: coParentIds.has(person.id),
                wasSpouse: marriedCoParentIds.has(person.id),
              }),
            icon: iconForPerson(person),
            detail: detailOf(person),
            isFocus,
            isJuvenile: person.isJuvenile,
            gender: person.gender,
          };
        });
      return { delta, label: familyRowLabel(delta), members };
    });

  return {
    focusId: focus.id,
    focusName: humanDisplayName(focus),
    rows,
    memberCount: seen.size,
    truncated,
    parentLinks,
  };
}