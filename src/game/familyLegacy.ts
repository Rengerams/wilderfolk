import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';

/**
 * Family legacy (Phase 7) — dynasties: surnames with multiple living generations.
 * Founders are generation 1; every birth bumps the child a generation, so a
 * family line that keeps living writes itself into the valley's history.
 */
export interface Dynasty {
  surname: string;
  generationsAlive: number;
  members: number;
  minGeneration?: number;
  maxGeneration?: number;
}

export function computeDynasties(state: WorldState): Dynasty[] {
  const people = state.entities.filter(
    (e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e) && e.surname?.trim(),
  );

  const bySurname = new Map<string, Entity[]>();
  for (const p of people) {
    const surname = p.surname!.trim();
    if (!surname) continue;
    const arr = bySurname.get(surname) ?? [];
    arr.push(p);
    bySurname.set(surname, arr);
  }

  const out: Dynasty[] = [];
  for (const [surname, members] of bySurname) {
    const generationSet = new Set(members.map((m) => m.generation ?? 1));
    const generationsAlive = generationSet.size;
    const genList = Array.from(generationSet);
    const minGeneration = genList.length > 0 ? Math.min(...genList) : 1;
    const maxGeneration = genList.length > 0 ? Math.max(...genList) : 1;

    out.push({
      surname,
      generationsAlive,
      members: members.length,
      minGeneration,
      maxGeneration,
    });
  }

  return out.sort(
    (a, b) => b.generationsAlive - a.generationsAlive || b.members - a.members,
  );
}

/**
 * Whether one family line counts as a dynasty.
 *
 * Single definition of the "three living generations of the same family, at least three members"
 * rule: `hasDynasty` gates the 200-gold chronicle chapter on it, and `DynastyPanel` lists and counts
 * families with it. The panel used to filter on `generationsAlive >= 2` alone, so it advertised
 * two-generation families as dynasties — contradicting both its own sentence and the reward gate
 * (audit C2 "Dynasty definition", R12).
 */
export function isDynasty(dynasty: Pick<Dynasty, 'generationsAlive' | 'members'>): boolean {
  return dynasty.generationsAlive >= 3 && dynasty.members >= 3;
}

/** A dynasty: three living generations of the same family, at least three members. */
export function hasDynasty(state: WorldState): boolean {
  return computeDynasties(state).some(isDynasty);
}