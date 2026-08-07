/**
 * Settler personality traits — a small trait catalog that makes each villager
 * feel like an individual. Traits are assigned at creation (1–2 per settler),
 * inherited partly from parents, and feed subtle behavioral modifiers in
 * lifeSimulation / buildingActions / education / research.
 *
 * Assignment is softly gender-weighted: community/wisdom traits (nurturing,
 * insightful, gregarious) skew toward women, frontier/physical traits (hardy,
 * brave) skew toward men — but every settler can draw any trait, it's a
 * probability bias, not a gate.
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

const TRAIT_POOL: SettlerTrait[] = [
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
];

/** Traits drawn more often by women (community & wisdom leaning). */
const FEMALE_LEANING: SettlerTrait[] = [
  'nurturing',
  'insightful',
  'gregarious',
  'lucky',
  'graceful',
  'intuitive',
  'fierce',
];
/** Traits drawn more often by men (frontier & physical leaning). */
const MALE_LEANING: SettlerTrait[] = [
  'hardy',
  'brave',
  'greenthumb',
  'chivalrous',
  'resourceful',
  'stoic',
];
/** Bias strength when the trait matches the settler's gender (1.0 = neutral). */
const GENDER_BIAS = 1.6;
/** Neutral weight for every trait regardless of gender. */
const BASE_WEIGHT = 1;

/** Mutually exclusive pairs — a settler can't have both. */
const TRAIT_OPPOSITES: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = [
  ['brave', 'timid'],
  ['gregarious', 'timid'],
];

/** How many traits a fresh settler gets. */
const TRAIT_COUNT = 3;

/** Roll a single random trait weighted by gender that doesn't conflict. */
function pickTrait(existing: SettlerTrait[], gender?: 'male' | 'female'): SettlerTrait {
  const excluded = new Set(existing);
  for (const [a, b] of TRAIT_OPPOSITES) {
    if (existing.includes(a)) excluded.add(b);
    if (existing.includes(b)) excluded.add(a);
  }
  const pool = TRAIT_POOL.filter((t) => !excluded.has(t));
  // Weighted pick: gender-leaning traits get a boost; everything else stays 1.
  const weights = pool.map((t) => {
    const leaning = gender === 'female' ? FEMALE_LEANING : MALE_LEANING;
    return leaning.includes(t) ? GENDER_BIAS : BASE_WEIGHT;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Assign 1–2 random traits for a new settler (optionally gender-weighted). */
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

/** Per-trait chance a parent passes a personality on to a child (DNA-like). */
const INHERIT_CHANCE = 0.5;
/** Hard cap on how many traits a child can inherit from both parents. */
const MAX_INHERITED = 3;

/**
 * DNA-like inheritance: each parent trait has a 50% chance to pass to the
 * child, drawing from both parents, capped at 3. Slots not filled by
 * inheritance are rolled fresh by the caller via `rollSettlerTraits`.
 */
export function inheritSettlerTraits(
  mother?: Entity,
  father?: Entity,
): SettlerTrait[] {
  const inherited: SettlerTrait[] = [];
  for (const parent of [mother, father]) {
    for (const t of parent?.traits ?? []) {
      if (inherited.length >= MAX_INHERITED) break;
      if (Math.random() < INHERIT_CHANCE && !inherited.includes(t)) inherited.push(t);
    }
  }
  return inherited;
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
