import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SettlerTrait } from '../src/game/gameTypes';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';

const COURTSHIP_PROGRESS = { kind: 'social', activity: 'courtshipProgress' } as const;
const CONCEPTION = { kind: 'family', activity: 'conception' } as const;

type Traits = readonly SettlerTrait[];

/** AS-IS reference: the retired settlerTraits.traitMultiplier helper. */
const legacyTraitMultiplier = (traits: Traits | null | undefined, trait: SettlerTrait, whenPresent: number): number =>
  traits?.includes(trait) ? whenPresent : 1.0;

/** AS-IS reference: the historical courtship progress expression. */
const legacyCourtshipRate = (base: number, traits: Traits): number =>
  base *
  legacyTraitMultiplier(traits, 'gregarious', 1.4) *
  legacyTraitMultiplier(traits, 'timid', 0.7) *
  legacyTraitMultiplier(traits, 'graceful', 1.2);

/** The migrated courtship progress expression, same multiplication positions and order. */
const catalogCourtshipRate = (base: number, traits: Traits): number => {
  const orderedFactors = evaluateTraitInfluence({ traits }, COURTSHIP_PROGRESS).exact.orderedFactors;
  return base * orderedFactors[0] * orderedFactors[1] * orderedFactors[2];
};

const courtshipCombinations: Traits[] = [
  [],
  ['gregarious'],
  ['timid'],
  ['graceful'],
  ['graceful', 'timid'],
  ['timid', 'gregarious'],
  ['graceful', 'gregarious'],
  ['graceful', 'gregarious', 'timid'],
  ['timid', 'graceful', 'gregarious'],
  ['brave', 'gregarious', 'timid'],
];

describe('courtship trait parity', () => {
  it('keeps the historical 1.4 / 0.7 / 1.2 multipliers in the fixed slot order', () => {
    expect(evaluateTraitInfluence({ traits: ['gregarious'] }, COURTSHIP_PROGRESS).exact.orderedFactors)
      .toEqual([1.4, 1, 1]);
    expect(evaluateTraitInfluence({ traits: ['timid'] }, COURTSHIP_PROGRESS).exact.orderedFactors)
      .toEqual([1, 0.7, 1]);
    expect(evaluateTraitInfluence({ traits: ['graceful'] }, COURTSHIP_PROGRESS).exact.orderedFactors)
      .toEqual([1, 1, 1.2]);
    expect(evaluateTraitInfluence({ traits: ['brave'] }, COURTSHIP_PROGRESS).exact.orderedFactors)
      .toEqual([1, 1, 1]);
    expect(evaluateTraitInfluence({}, COURTSHIP_PROGRESS).exact.orderedFactors).toEqual([1, 1, 1]);
    expect(evaluateTraitInfluence({ traits: null }, COURTSHIP_PROGRESS).exact.orderedFactors).toEqual([1, 1, 1]);
  });

  it('keeps the slots DNA-order independent for combined traits', () => {
    const expected = [1.4, 0.7, 1.2];
    for (const traits of [
      ['gregarious', 'timid', 'graceful'],
      ['timid', 'graceful', 'gregarious'],
      ['graceful', 'gregarious', 'timid'],
    ] as Traits[]) {
      expect(evaluateTraitInfluence({ traits }, COURTSHIP_PROGRESS).exact.orderedFactors).toEqual(expected);
    }
  });

  it('reproduces the old progress rate bit for bit across trait orders and bases', () => {
    for (const traits of courtshipCombinations) {
      for (const base of [0.0001, 0.0023, 0.0175, 0.25, 1]) {
        expect(catalogCourtshipRate(base, traits)).toBe(legacyCourtshipRate(base, traits));
      }
    }
  });

  it('leaves the bounded projection free of the parity multipliers', () => {
    const courtship = { kind: 'social', activity: 'courtship' } as const;
    const timid = evaluateTraitInfluence({ traits: ['timid'] }, courtship);
    const graceful = evaluateTraitInfluence({ traits: ['graceful'] }, courtship);
    expect(timid.factor).toBeGreaterThan(0.85);
    expect(timid.factor).toBeLessThan(1);
    expect(graceful.factor).toBeGreaterThan(1);
    expect(graceful.factor).toBeLessThanOrEqual(1.15);
    expect(evaluateTraitInfluence({ traits: ['gregarious'] }, COURTSHIP_PROGRESS).factor).toBe(1);
  });
});

describe('conception trait parity', () => {
  const married = (chance: number, fertility: number, traits: Traits): number =>
    chance * fertility * legacyTraitMultiplier(traits, 'lucky', 1.15);
  const marriedNow = (chance: number, fertility: number, traits: Traits): number =>
    chance * fertility * evaluateTraitInfluence({ traits }, CONCEPTION).exact.multiplier;
  const youth = (youthMultiplier: number, fertility: number, traits: Traits): number =>
    0.0012 * youthMultiplier * fertility * legacyTraitMultiplier(traits, 'lucky', 1.15);
  const youthNow = (youthMultiplier: number, fertility: number, traits: Traits): number =>
    0.0012 * youthMultiplier * fertility * evaluateTraitInfluence({ traits }, CONCEPTION).exact.multiplier;

  it('keeps the married and youth Lucky factor at exactly 1.15', () => {
    expect(evaluateTraitInfluence({ traits: ['lucky'] }, CONCEPTION).exact.multiplier).toBe(1.15);
    for (const chance of [0.0004, 0.0011, 0.02]) {
      for (const fertility of [0.25, 0.6, 1]) {
        expect(marriedNow(chance, fertility, ['lucky'])).toBe(married(chance, fertility, ['lucky']));
        expect(marriedNow(chance, fertility, ['brave', 'lucky'])).toBe(married(chance, fertility, ['brave', 'lucky']));
      }
    }
    for (const youthMultiplier of [0.5, 0.75, 1]) {
      for (const fertility of [0.3, 1]) {
        expect(youthNow(youthMultiplier, fertility, ['lucky']))
          .toBe(youth(youthMultiplier, fertility, ['lucky']));
      }
    }
  });

  it('leaves an eligible non-Lucky mother on her original chance, never zero', () => {
    expect(evaluateTraitInfluence({ traits: ['nurturing'] }, CONCEPTION).exact.multiplier).toBe(1);
    expect(evaluateTraitInfluence({ traits: [] }, CONCEPTION).exact.multiplier).toBe(1);
    expect(evaluateTraitInfluence({}, CONCEPTION).exact.multiplier).toBe(1);
    for (const chance of [0.0004, 0.0011]) {
      for (const fertility of [0.4, 0.9]) {
        expect(marriedNow(chance, fertility, ['nurturing'])).toBe(chance * fertility);
      }
    }
  });

  it('evaluates only at the two original conception sites and keeps the affair branch clean', () => {
    const source = readFileSync(join(process.cwd(), 'src/game/simulation/humanRelationships.ts'), 'utf8');
    const conceptionSites = source.split('\n').filter((line) => line.includes('evaluateTraitInfluence(entity, CONCEPTION_CONTEXT)'));
    expect(conceptionSites).toHaveLength(2);
    const affairLine = source.split('\n').find((line) => line.includes('HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE *'));
    expect(affairLine).toBeDefined();
    expect(affairLine).not.toContain('evaluateTraitInfluence');
    expect(source).toContain('personDayRoll(entity.id, state.tick, 603)');
    expect(source).toContain('personDayRoll(entity.id, state.tick, 604)');
  });
});
