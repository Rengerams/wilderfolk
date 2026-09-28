/**
 * Settler personality traits — a trait catalog that makes each villager
 * feel like an individual. Traits are assigned at creation (1–3 per settler),
 * inherited partly from parents, and feed subtle behavioral modifiers in
 * lifeSimulation / buildingActions / education / research.
 */
import type { Entity, SettlerTrait } from './gameTypes';
import { getSimRng } from './simRng';

export type { SettlerTrait };

export interface TraitDef {
  readonly id: SettlerTrait;
  readonly label: string;
  readonly emoji: string;
  /** Short player-facing description shown in the inspector. */
  readonly description: string;
}

export const TRAIT_DEFS: Readonly<Record<SettlerTrait, TraitDef>> = {
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
  nurturing: {
    id: 'nurturing',
    label: 'Nurturing',
    emoji: '💗',
    description: 'Children mature faster while they live in the village.',
  },
  insightful: {
    id: 'insightful',
    label: 'Insightful',
    emoji: '🔮',
    description: 'A sharp mind — the village researches a little faster.',
  },
  chivalrous: {
    id: 'chivalrous',
    label: 'Chivalrous',
    emoji: '🦁',
    description: 'Gallant and protective — adds militia strength in a raid.',
  },
  resourceful: {
    id: 'resourceful',
    label: 'Resourceful',
    emoji: '🔨',
    description: 'Solves practical problems fast — builds quicker on site.',
  },
  stoic: {
    id: 'stoic',
    label: 'Stoic',
    emoji: '🏔️',
    description: 'Calm and steady — mourns loss and recovers sooner.',
  },
  graceful: {
    id: 'graceful',
    label: 'Graceful',
    emoji: '✨',
    description: 'Poised and elegant — courts and charms a little faster.',
  },
  intuitive: {
    id: 'intuitive',
    label: 'Intuitive',
    emoji: '🦉',
    description: 'Sharp instincts and empathy — chats up coworkers more.',
  },
  fierce: {
    id: 'fierce',
    label: 'Fierce',
    emoji: '🔥',
    description: 'Passionate and determined — burns energy slower on the job.',
  },
};

export const TRAIT_POOL: readonly SettlerTrait[] = [
  'hardy',
  'brave',
  'gregarious',
  'timid',
  'greenthumb',
  'lucky',
  'nurturing',
  'insightful',
  'chivalrous',
  'resourceful',
  'stoic',
  'graceful',
  'intuitive',
  'fierce',
] as const;

/** Traits drawn more often by women (community & wisdom leaning). */
const FEMALE_LEANING: ReadonlySet<SettlerTrait> = new Set<SettlerTrait>([
  'nurturing',
  'insightful',
  'gregarious',
  'lucky',
  'graceful',
  'intuitive',
  'fierce',
]);

/** Traits drawn more often by men (frontier & physical leaning). */
const MALE_LEANING: ReadonlySet<SettlerTrait> = new Set<SettlerTrait>([
  'hardy',
  'brave',
  'greenthumb',
  'chivalrous',
  'resourceful',
  'stoic',
]);

/** Bias strength when the trait matches the settler's gender (1.0 = neutral). */
const GENDER_BIAS = 1.6;
/** Neutral weight for every trait regardless of gender. */
const BASE_WEIGHT = 1.0;

/** Mutually exclusive pairs — a settler can't carry both. */
const TRAIT_OPPOSITES: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = [
  ['brave', 'timid'],
  ['gregarious', 'timid'],
];

/** Standard trait allocation count per settler. */
const TRAIT_COUNT = 3;

/** Checks if a candidate trait conflicts with an existing set of traits. */
function conflictsWith(trait: SettlerTrait, existing: readonly SettlerTrait[]): boolean {
  for (let i = 0; i < TRAIT_OPPOSITES.length; i++) {
    const [a, b] = TRAIT_OPPOSITES[i];
    if (trait === a && existing.includes(b)) return true;
    if (trait === b && existing.includes(a)) return true;
  }
  return false;
}

/** Roll a single random trait weighted by gender that doesn't conflict. */
function pickTrait(existing: SettlerTrait[], gender?: 'male' | 'female'): SettlerTrait {
  const pool: SettlerTrait[] = [];
  for (let i = 0; i < TRAIT_POOL.length; i++) {
    const t = TRAIT_POOL[i];
    if (!existing.includes(t) && !conflictsWith(t, existing)) {
      pool.push(t);
    }
  }

  if (pool.length === 0) {
    return existing[0] ?? 'hardy';
  }

  const leaningSet = gender === 'female' ? FEMALE_LEANING : MALE_LEANING;
  const weights = pool.map((t) => (leaningSet.has(t) ? GENDER_BIAS : BASE_WEIGHT));
  const total = weights.reduce((s, w) => s + w, 0);

  let roll = getSimRng('settlerTraits')() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }

  return pool[pool.length - 1];
}

/** Assign random traits for a new settler (gender-weighted and non-conflicting). */
export function rollSettlerTraits(
  existing: SettlerTrait[] = [],
  gender?: 'male' | 'female',
): SettlerTrait[] {
  const traits = [...existing];
  while (traits.length < TRAIT_COUNT) {
    traits.push(pickTrait(traits, gender));
  }
  return traits;
}

/** Per-trait chance a parent passes personality to a child. */
const INHERIT_CHANCE = 0.5;
/** Hard cap on how many traits a child can inherit from parents. */
const MAX_INHERITED = 3;

/**
 * DNA-like inheritance: each parent trait has a 50% chance to pass to the
 * child, drawing from both parents and rejecting mutually exclusive traits.
 */
export function inheritSettlerTraits(
  mother?: Entity,
  father?: Entity,
): SettlerTrait[] {
  const inherited: SettlerTrait[] = [];
  const parents = [mother, father];
  const rng = getSimRng('settlerTraits');

  for (let p = 0; p < parents.length; p++) {
    const parentTraits = parents[p]?.traits ?? [];
    for (let t = 0; t < parentTraits.length; t++) {
      const trait = parentTraits[t];
      if (inherited.length >= MAX_INHERITED) break;
      if (
        rng() < INHERIT_CHANCE &&
        !inherited.includes(trait) &&
        !conflictsWith(trait, inherited)
      ) {
        inherited.push(trait);
      }
    }
  }

  return inherited;
}

/** Modifier when the trait is present; otherwise 1.0. */
export function traitMultiplier(entity: Entity, trait: SettlerTrait, whenPresent: number): number {
  return entity.traits?.includes(trait) ? whenPresent : 1.0;
}

/** True when the entity carries the given trait. */
export function hasTrait(entity: Entity, trait: SettlerTrait): boolean {
  return entity.traits?.includes(trait) ?? false;
}