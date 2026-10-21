import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';

/** Compact historical record, independent of removable simulation entities. */
export interface GenealogyPerson {
  id: number;
  name: string;
  birthSurname: string;
  surname: string;
  gender?: 'male' | 'female';
  bornYear?: number;
  bornDay?: number;
  diedYear?: number;
  diedDay?: number;
  alive: boolean;
  motherId?: number;
  fatherId?: number;
  adoptiveMotherId?: number;
  adoptiveFatherId?: number;
  partners: number[];
  childrenIds: number[];
}

export interface GenealogyRegistry {
  people: Record<string, GenealogyPerson>;
}

function recordedHuman(entity: Entity): boolean {
  return entity.type === EntityType.Human && isPlayerHuman(entity);
}

/** Idempotent census: track new births, new relationships and disappearances.
 * Call from a daily simulation boundary and before serialization. Never scan per tick.
 */
export function syncGenealogyRegistry(state: WorldState): GenealogyRegistry {
  const registry = state.genealogyRegistry ??= { people: {} };
  const aliveIds = new Set<number>();
  for (const e of state.entities) {
    if (!recordedHuman(e)) continue;
    if (e.alive) aliveIds.add(e.id);
    const key = String(e.id);
    const existing = registry.people[key];
    const partnerIds = new Set(existing?.partners ?? []);
    if (e.partnerId != null) partnerIds.add(e.partnerId);
    const childrenIds = new Set(existing?.childrenIds ?? []);
    for (const childId of e.childrenIds ?? []) childrenIds.add(childId);
    registry.people[key] = {
      id: e.id,
      name: e.name ?? existing?.name ?? 'Unknown settler',
      birthSurname: existing?.birthSurname ?? e.surname ?? '',
      surname: e.surname ?? existing?.surname ?? '',
      gender: e.gender ?? existing?.gender,
      bornYear: e.birthYear ?? existing?.bornYear,
      bornDay: e.birthDay ?? existing?.bornDay,
      diedYear: e.alive ? undefined : (existing?.diedYear ?? state.year),
      diedDay: e.alive ? undefined : (existing?.diedDay ?? state.dayInYear),
      alive: e.alive,
      motherId: e.motherId ?? existing?.motherId,
      fatherId: e.fatherId ?? existing?.fatherId,
      adoptiveMotherId: e.adoptiveMotherId ?? existing?.adoptiveMotherId,
      adoptiveFatherId: e.adoptiveFatherId ?? existing?.adoptiveFatherId,
      partners: [...partnerIds],
      childrenIds: [...childrenIds],
    };
  }
  for (const person of Object.values(registry.people)) {
    if (!aliveIds.has(person.id) && person.alive) {
      person.alive = false;
      person.diedYear ??= state.year;
      person.diedDay ??= state.dayInYear;
    }
  }
  // Child parent links take priority over older, potentially incomplete childrenIds.
  for (const child of Object.values(registry.people)) {
    for (const parentId of [child.motherId, child.fatherId, child.adoptiveMotherId, child.adoptiveFatherId]) {
      if (parentId == null || parentId === child.id) continue;
      const parent = registry.people[String(parentId)];
      if (parent && !parent.childrenIds.includes(child.id)) parent.childrenIds.push(child.id);
    }
  }
  return registry;
}

export function descendantsOf(registry: GenealogyRegistry, ancestorId: number, livingOnly = false): GenealogyPerson[] {
  const result: GenealogyPerson[] = [];
  const visited = new Set<number>([ancestorId]);
  const queue = [...(registry.people[String(ancestorId)]?.childrenIds ?? [])];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (visited.has(id)) continue;
    visited.add(id);
    const person = registry.people[String(id)];
    if (!person) continue;
    if (!livingOnly || person.alive) result.push(person);
    queue.push(...person.childrenIds);
  }
  return result;
}

export function largestBloodlines(registry: GenealogyRegistry, limit = 10): Array<{ ancestor: GenealogyPerson; livingDescendants: number; totalDescendants: number }> {
  return Object.values(registry.people)
    .map(ancestor => ({
      ancestor,
      livingDescendants: descendantsOf(registry, ancestor.id, true).length,
      totalDescendants: descendantsOf(registry, ancestor.id).length,
    }))
    .sort((a, b) => b.livingDescendants - a.livingDescendants || b.totalDescendants - a.totalDescendants || a.ancestor.id - b.ancestor.id)
    .slice(0, limit);
}

/** Record a newborn before its entity is merged into the main world array. */
export function recordGenealogyBirth(state: WorldState, child: Entity): void {
  const registry = state.genealogyRegistry ??= { people: {} };
  const key = String(child.id);
  if (registry.people[key]) return;
  registry.people[key] = {
    id: child.id,
    name: child.name ?? 'Unknown settler',
    birthSurname: child.surname ?? '',
    surname: child.surname ?? '',
    gender: child.gender,
    bornYear: child.birthYear,
    bornDay: child.birthDay,
    alive: true,
    motherId: child.motherId,
    fatherId: child.fatherId,
    adoptiveMotherId: child.adoptiveMotherId,
    adoptiveFatherId: child.adoptiveFatherId,
    partners: [],
    childrenIds: [],
  };
  for (const parentId of [child.motherId, child.fatherId, child.adoptiveMotherId, child.adoptiveFatherId]) {
    const parent = parentId == null ? undefined : registry.people[String(parentId)];
    if (parent && !parent.childrenIds.includes(child.id)) parent.childrenIds.push(child.id);
  }
}

/** Capture a death while the entity still has its identity and family links. */
export function recordGenealogyDeath(state: WorldState, entity: Entity): void {
  if (!recordedHuman(entity)) return;
  const registry = state.genealogyRegistry ??= { people: {} };
  if (!registry.people[String(entity.id)]) {
    registry.people[String(entity.id)] = {
      id: entity.id, name: entity.name ?? 'Unknown settler',
      birthSurname: entity.surname ?? '', surname: entity.surname ?? '', gender: entity.gender,
      bornYear: entity.birthYear, bornDay: entity.birthDay, alive: true,
      motherId: entity.motherId, fatherId: entity.fatherId,
      adoptiveMotherId: entity.adoptiveMotherId, adoptiveFatherId: entity.adoptiveFatherId,
      partners: entity.partnerId == null ? [] : [entity.partnerId],
      childrenIds: [...(entity.childrenIds ?? [])],
    };
  }
  const person = registry.people[String(entity.id)];
  person.alive = false;
  person.diedYear ??= state.year;
  person.diedDay ??= state.dayInYear;
}
