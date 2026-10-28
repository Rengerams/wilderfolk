import { describe, expect, it } from 'vitest';
import type { SettlerTrait } from '../src/game/gameTypes';
import { evaluateTraitPairClashes } from '../src/game/personality/traitEvaluation';
import { TRAIT_OPPOSITIONS } from '../src/game/personality/traitEffectCatalog';

type Traits = readonly SettlerTrait[];
interface Person {
  readonly id: number;
  readonly traits?: Traits | null;
}

/** AS-IS reference: the five retired cross-person incompatibility pairs. */
const LEGACY_CLASHES: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = [
  ['brave', 'timid'],
  ['gregarious', 'timid'],
  ['gregarious', 'stoic'],
  ['fierce', 'stoic'],
  ['chivalrous', 'fierce'],
];

const INCOMPATIBLE_PAIR_FEUD_CHANCE_PER_DAY = 0.00005;

function legacyClashCount(a: Person, b: Person): number {
  const aTraits = a.traits;
  const bTraits = b.traits;
  if (!aTraits?.length || !bTraits?.length) return 0;
  let clashes = 0;
  for (const [x, y] of LEGACY_CLASHES) {
    if ((aTraits.includes(x) && bTraits.includes(y)) || (aTraits.includes(y) && bTraits.includes(x))) clashes++;
  }
  return clashes;
}

/** Mulberry32: deterministic draw stream so old and new paths see the same numbers. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function feudDecision(clashes: number, rng: () => number): { started: boolean; draws: number } {
  if (clashes === 0) return { started: false, draws: 0 };
  const draw = rng();
  return { started: draw < clashes * INCOMPATIBLE_PAIR_FEUD_CHANCE_PER_DAY, draws: 1 };
}

const couples: Array<readonly [Person, Person]> = [
  [{ id: 1, traits: ['brave'] }, { id: 2, traits: ['timid'] }],
  [{ id: 3, traits: ['gregarious'] }, { id: 4, traits: ['stoic'] }],
  [{ id: 5, traits: ['chivalrous', 'nurturing'] }, { id: 6, traits: ['fierce'] }],
  [{ id: 7, traits: ['brave', 'gregarious', 'fierce'] }, { id: 8, traits: ['timid', 'stoic', 'chivalrous'] }],
  [{ id: 9, traits: ['nurturing'] }, { id: 10, traits: ['insightful'] }],
  [{ id: 11, traits: [] }, { id: 12, traits: ['brave'] }],
  [{ id: 13, traits: null }, { id: 14, traits: ['timid'] }],
  [{ id: 15 }, { id: 16, traits: ['fierce'] }],
];

const asPeople = (pair: readonly [Person, Person]): [Person, Person] => [pair[0], pair[1]];

describe('social incompatibility parity', () => {
  it('keeps exactly the five historical cross-person pairs', () => {
    expect(TRAIT_OPPOSITIONS).toEqual(LEGACY_CLASHES);
  });

  it('counts 0..5 clashes identically and symmetrically', () => {
    for (const [a, b] of couples) {
      expect(evaluateTraitPairClashes(a, b)).toBe(legacyClashCount(a, b));
      expect(evaluateTraitPairClashes(b, a)).toBe(legacyClashCount(a, b));
    }
    const allPairs = { id: 21, traits: ['brave', 'gregarious', 'fierce'] as const };
    const opposite = { id: 22, traits: ['timid', 'stoic', 'chivalrous'] as const };
    expect(evaluateTraitPairClashes(allPairs, opposite)).toBe(5);
  });

  it('keeps the same seeded feud decisions and the zero-clash no-draw guard', () => {
    for (const [a, b] of couples) {
      const [first, second] = asPeople([a, b]);
      for (const seed of [1, 7, 99, 12345, 987654321]) {
        const legacy = feudDecision(legacyClashCount(first, second), seededRng(seed));
        const migrated = feudDecision(evaluateTraitPairClashes(first, second), seededRng(seed));
        expect(migrated).toEqual(legacy);
        if (legacyClashCount(first, second) === 0) expect(migrated.draws).toBe(0);
      }
    }
  });

  it('never lets a clashless pair consume a draw even at extreme seeds', () => {
    const a = { id: 31, traits: ['nurturing'] as const };
    const b = { id: 32, traits: ['insightful'] as const };
    let draws = 0;
    const counting = () => {
      draws += 1;
      return 0;
    };
    expect(feudDecision(evaluateTraitPairClashes(a, b), counting).started).toBe(false);
    expect(draws).toBe(0);
  });
});
