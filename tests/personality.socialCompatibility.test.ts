import { describe, expect, it } from 'vitest';
import type { SettlerTrait } from '../src/game/gameTypes';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import { personDayRoll } from '../src/game/humanSchedule';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { tryWorkplaceBanter } from '../src/game/socialLife';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';
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

const clashCount = (a: Person, b: Person): number =>
  evaluateTraitInfluence(a, { kind: 'social', activity: 'feudClash', other: b }).exact.clashCount;

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

/** AS-IS reference: `driftIntoFeud` rolls only after a non-zero clash count. */
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

const singleEdgePairs: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = LEGACY_CLASHES;

describe('social incompatibility parity', () => {
  it('keeps exactly the five historical cross-person pairs, stored once in the catalog', () => {
    expect(TRAIT_OPPOSITIONS).toHaveLength(5);
    expect([...TRAIT_OPPOSITIONS].map(([a, b]) => `${a}/${b}`).sort())
      .toEqual(LEGACY_CLASHES.map(([a, b]) => `${a}/${b}`).sort());
  });

  it('finds each edge in both settler orders and nothing else', () => {
    for (const [x, y] of singleEdgePairs) {
      expect(clashCount({ id: 1, traits: [x] }, { id: 2, traits: [y] }), `${x}/${y}`).toBe(1);
      expect(clashCount({ id: 2, traits: [y] }, { id: 1, traits: [x] }), `${y}/${x}`).toBe(1);
      expect(clashCount({ id: 1, traits: [x] }, { id: 2, traits: [x] })).toBe(0);
    }
    expect(clashCount({ id: 1, traits: ['brave', 'gregarious'] }, { id: 2, traits: ['nurturing'] })).toBe(0);
  });

  it('counts 0..5 clashes identically and symmetrically', () => {
    for (const [a, b] of couples) {
      expect(clashCount(a, b)).toBe(legacyClashCount(a, b));
      expect(clashCount(b, a)).toBe(legacyClashCount(a, b));
    }
    const allPairs = { id: 21, traits: ['brave', 'gregarious', 'fierce'] as const };
    const opposite = { id: 22, traits: ['timid', 'stoic', 'chivalrous'] as const };
    expect(clashCount(allPairs, opposite)).toBe(5);
  });

  it('returns zero for absent, empty or unknown DNA without touching the bounded factor', () => {
    const unknown = { id: 41, traits: ['not_a_trait'] as unknown as SettlerTrait[] };
    for (const [a, b] of [
      [{ id: 31 }, { id: 32, traits: ['brave'] }],
      [{ id: 33, traits: [] }, { id: 34, traits: ['timid'] }],
      [{ id: 35, traits: null }, { id: 36, traits: ['fierce'] }],
      [unknown, { id: 42, traits: ['fierce'] }],
    ] as Array<readonly [Person, Person]>) {
      expect(clashCount(a, b)).toBe(0);
    }
    const exact = evaluateTraitInfluence(
      { traits: ['brave', 'gregarious'] },
      { kind: 'social', activity: 'feudClash', other: { traits: ['timid'] } },
    );
    expect(exact.factor).toBe(1);
    expect(exact.tendency).toBe(0);
  });

  it('keeps the same seeded feud decisions and the zero-clash no-draw guard', () => {
    for (const [a, b] of couples) {
      for (const seed of [1, 7, 99, 12345, 987654321]) {
        const legacy = feudDecision(legacyClashCount(a, b), seededRng(seed));
        const migrated = feudDecision(clashCount(a, b), seededRng(seed));
        expect(migrated).toEqual(legacy);
        if (legacyClashCount(a, b) === 0) expect(migrated.draws).toBe(0);
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
    expect(feudDecision(clashCount(a, b), counting).started).toBe(false);
    expect(draws).toBe(0);
  });

  it('keeps the unchanged 0.00005 feuds-per-day scale', () => {
    const oneClash = () => 0.000049;
    const atThreshold = () => INCOMPATIBLE_PAIR_FEUD_CHANCE_PER_DAY;
    const a = { id: 51, traits: ['brave'] as const };
    const b = { id: 52, traits: ['timid'] as const };
    expect(feudDecision(clashCount(a, b), oneClash)).toEqual({ started: true, draws: 1 });
    expect(feudDecision(clashCount(a, b), atThreshold).started).toBe(false);
  });
});

describe('workplace banter parity', () => {
  const BANTER = { kind: 'social', activity: 'workplaceBanter' } as const;
  const BANTER_BASE_CHANCE = 0.08;
  const legacyChance = (traits: Traits | null | undefined): number =>
    (traits?.includes('intuitive') ? 0.11 : BANTER_BASE_CHANCE);
  const banterChance = (traits: Traits | null | undefined): number =>
    evaluateTraitInfluence({ traits }, BANTER).exact.chanceOverride ?? BANTER_BASE_CHANCE;

  const traitSets: Array<Traits | null | undefined> = [
    undefined, null, [], ['intuitive'], ['brave'], ['intuitive', 'brave'], ['nurturing', 'fierce'],
  ];

  it('takes the Intuitive 0.11 from the catalog and otherwise keeps the 0.08 baseline', () => {
    expect(evaluateTraitInfluence({ traits: ['intuitive'] }, BANTER).exact.chanceOverride).toBe(0.11);
    expect(evaluateTraitInfluence({ traits: ['nurturing'] }, BANTER).exact.chanceOverride).toBeUndefined();
    for (const traits of traitSets) {
      expect(banterChance(traits)).toBe(legacyChance(traits));
    }
  });

  it('keeps the same pass/fail boundary and stays a chance, never a bounded factor', () => {
    const roll = 0.095;
    expect(roll > banterChance(['brave'])).toBe(roll > legacyChance(['brave']));
    expect(roll > banterChance(['intuitive'])).toBe(roll > legacyChance(['intuitive']));
    expect(roll > legacyChance(['brave'])).toBe(true);
    expect(roll > legacyChance(['intuitive'])).toBe(false);
    const influence = evaluateTraitInfluence({ traits: ['intuitive'] }, BANTER);
    expect(influence.factor).toBe(1);
    expect(influence.tendency).toBe(0);
  });

  it('keeps the owner decision identical on the same day roll', () => {
    const tick = findTickBetween(ENTITY_ID, 720, 0.08, 0.11);
    const speaker = (traits: Traits) => {
      const entity = createEntity(EntityType.Human, 300, 300, ENTITY_ID, 80, false, { name: 'Bram' });
      entity.alive = true;
      entity.traits = [...traits];
      return entity;
    };
    const plain = speaker(['brave']);
    tryWorkplaceBanter(plain, [], tick, 12, true);
    expect(plain.chatTicks ?? 0).toBe(0);

    const intuitive = speaker(['intuitive']);
    tryWorkplaceBanter(intuitive, [], tick, 12, true);
    expect(intuitive.chatPhrase, 'Intuitive speaks inside the 0.11 band').toBeDefined();
    expect(intuitive.chatTicks ?? 0).toBeGreaterThan(0);

    for (const [alive, hour, onDayShift] of [[false, 12, true], [true, 10, true], [true, 12, false]] as const) {
      const gated = speaker(['intuitive']);
      gated.alive = alive;
      tryWorkplaceBanter(gated, [], tick, hour, onDayShift);
      expect(gated.chatTicks ?? 0).toBe(0);
    }
  });
});

const ENTITY_ID = 77;

/** The first midday tick whose day roll for `id`/`salt` lands inside the open band. */
function findTickBetween(id: number, salt: number, low: number, high: number): number {
  for (let day = 0; day < 5000; day += 1) {
    const tick = day * TICKS_PER_DAY + 720;
    const roll = personDayRoll(id, tick, salt);
    if (roll > low && roll <= high) return tick;
  }
  throw new Error('no tick inside the banter band');
}
