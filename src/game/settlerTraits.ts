/**
 * Settler personality traits — a small trait catalog that makes each villager
 * feel like an individual. Traits are assigned at creation (1–2 per settler),
 * inherited partly from parents, and feed subtle behavioral modifiers in
 * lifeSimulation / buildingActions.
 */
import type { Entity, SettlerTrait } from './gameTypes';
import { EntityType } from './gameTypes';

export type { SettlerTrait };

export interface TraitDef {
  id: SettlerTrait;
  label: string;
  emoji: string;
  /** Short player-facing description shown in the inspector. */
  description: string;
}

export const TRAIT_DEFS: Record<SettlerTrait, TraitDef> = {
  hardy: {
    id: 'hardy',
    label: 'Hardy',
    emoji: '💪',
    description: 'Loses energy 15% slower — works the frontier longer.',
  },
  brave: {
    id: 'brave',
    label: 'Brave',
    emoji: '🛡️',
    description: 'Ranges farther and chases game harder while hunting.',
  },
  gregarious: {
    id: 'gregarious',
    label: 'Gregarious',
    emoji: '🗣️',
    description: 'Courts faster and chats more around the village.',
  },
  timid: {
    id: 'timid',
    label: 'Timid',
    emoji: '🐇',
    description: 'Courts slower and flees sooner from predators.',
  },
  greenthumb: {
    id: 'greenthumb',
    label: 'Greenthumb',
    emoji: '🌿',
    description: 'Farms yield more and winters cost less.',
  },
  lucky: {
    id: 'lucky',
    label: 'Lucky',
    emoji: '🍀',
    description: 'Better hunt luck and a bit more likely to conceive.',
  },
};

const TRAIT_POOL: SettlerTrait[] = [
  'hardy',
  'brave',
  'gregarious',
  'timid',
  'greenthumb',
  'lucky',
];

/** Mutually exclusive pairs — a settler can't have both. */
const TRAIT_OPPOSITES: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = [
  ['brave', 'timid'],
  ['gregarious', 'timid'],
];

/** How many traits a fresh adult gets. */
const TRAIT_COUNT = 2;

/** Roll a single random trait that doesn't conflict with `existing`. */
function pickTrait(existing: SettlerTrait[]): SettlerTrait {
  const excluded = new Set(existing);
  for (const [a, b] of TRAIT_OPPOSITES) {
    if (existing.includes(a)) excluded.add(b);
    if (existing.includes(b)) excluded.add(a);
  }
  const pool = TRAIT_POOL.filter((t) => !excluded.has(t));
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Assign 1–2 random traits for a new settler. */
export function rollSettlerTraits(existing: SettlerTrait[] = []): SettlerTrait[] {
  const traits = [...existing];
  while (traits.length < TRAIT_COUNT) {
    traits.push(pickTrait(traits));
  }
  return traits;
}

/** A settler who is alive and carries at least one trait. */
export function hasTraits(entity: Entity): boolean {
  return entity.type === EntityType.Human && (entity.traits?.length ?? 0) > 0;
}

/** Modifier when the trait is present; otherwise 1.0. */
export function traitMultiplier(entity: Entity, trait: SettlerTrait, whenPresent: number): number {
  return entity.traits?.includes(trait) ? whenPresent : 1;
}

/** True when the entity carries the given trait. */
export function hasTrait(entity: Entity, trait: SettlerTrait): boolean {
  return entity.traits?.includes(trait) ?? false;
}
