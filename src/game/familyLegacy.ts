import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';

/**
 * Family legacy (Phase 7) — dynasties: surnames with multiple living generations.
 * Founders are generation 1; every birth bumps the child a generation, so a
 * family line that keeps living writes itself into the valley's history.
 */
export interface Dynasty {
  surname: string;
  generationsAlive: number;
  members: number;
}

export function computeDynasties(state: WorldState): Dynasty[] {
  const people = state.entities.filter(
    (e) => e.alive && e.type === EntityType.Human && !e.faction && e.surname,
  );
  const bySurname = new Map<string, Entity[]>();
  for (const p of people) {
    const arr = bySurname.get(p.surname!) ?? [];
    arr.push(p);
    bySurname.set(p.surname!, arr);
  }
  const out: Dynasty[] = [];
  for (const [surname, members] of bySurname) {
    const generationsAlive = new Set(members.map((m) => m.generation ?? 1)).size;
    out.push({ surname, generationsAlive, members: members.length });
  }
  return out.sort((a, b) => b.generationsAlive - a.generationsAlive || b.members - a.members);
}

/** A dynasty: three living generations of the same family, at least three members. */
export function hasDynasty(state: WorldState): boolean {
  return computeDynasties(state).some((d) => d.generationsAlive >= 3 && d.members >= 3);
}
