import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SettlerTrait } from '../src/game/gameTypes';
import { evaluateTraitInfluence, evaluateTraitParityFactor } from '../src/game/personality/traitEvaluation';
import type { TraitContext } from '../src/game/personality/traitEffectCatalog';

const COURTSHIP = { kind: 'social', activity: 'courtship' } as const satisfies TraitContext;
const CONCEPTION = { kind: 'romance', activity: 'conception' } as const satisfies TraitContext;

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

/** The migrated courtship progress expression, same multiplication order. */
const catalogCourtshipRate = (base: number, traits: Traits): number =>
  base *
  evaluateTraitParityFactor({ traits }, COURTSHIP, 'gregarious') *
  evaluateTraitParityFactor({ traits }, COURTSHIP, 'timid') *
  evaluateTraitParityFactor({ traits }, COURTSHIP, 'graceful');

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
  it('keeps the historical 1.4 / 0.7 / 1.2 multipliers per trait', () => {
    expect(evaluateTraitParityFactor({ traits: ['gregarious'] }, COURTSHIP, 'gregarious')).toBe(1.4);
    expect(evaluateTraitParityFactor({ traits: ['timid'] }, COURTSHIP, 'timid')).toBe(0.7);
    expect(evaluateTraitParityFactor({ traits: ['graceful'] }, COURTSHIP, 'graceful')).toBe(1.2);
    expect(evaluateTraitParityFactor({ traits: ['brave'] }, COURTSHIP, 'gregarious')).toBe(1);
    expect(evaluateTraitParityFactor({}, COURTSHIP, 'gregarious')).toBe(1);
    expect(evaluateTraitParityFactor({ traits: null }, COURTSHIP, 'timid')).toBe(1);
  });

  it('reproduces the old progress rate bit for bit across trait orders and bases', () => {
    for (const traits of courtshipCombinations) {
      for (const base of [0.0001, 0.0023, 0.0175, 0.25, 1]) {
        expect(catalogCourtshipRate(base, traits)).toBe(legacyCourtshipRate(base, traits));
      }
    }
  });

  it('leaves the bounded projection free of the parity multipliers', () => {
    expect(evaluateTraitInfluence({ traits: ['gregarious'] }, COURTSHIP)).toEqual({ factor: 1, tendency: 0 });
    const timid = evaluateTraitInfluence({ traits: ['timid'] }, COURTSHIP);
    const graceful = evaluateTraitInfluence({ traits: ['graceful'] }, COURTSHIP);
    expect(timid.factor).toBeGreaterThan(0.85);
    expect(timid.factor).toBeLessThan(1);
    expect(graceful.factor).toBeGreaterThan(1);
    expect(graceful.factor).toBeLessThanOrEqual(1.15);
  });
});

describe('conception trait parity', () => {
  const married = (chance: number, fertility: number, traits: Traits): number =>
    chance * fertility * legacyTraitMultiplier(traits, 'lucky', 1.15);
  const marriedNow = (chance: number, fertility: number, traits: Traits): number =>
    chance * fertility * evaluateTraitParityFactor({ traits }, CONCEPTION, 'lucky');
  const youth = (youthMultiplier: number, fertility: number, traits: Traits): number =>
    0.0012 * youthMultiplier * fertility * legacyTraitMultiplier(traits, 'lucky', 1.15);
  const youthNow = (youthMultiplier: number, fertility: number, traits: Traits): number =>
    0.0012 * youthMultiplier * fertility * evaluateTraitParityFactor({ traits }, CONCEPTION, 'lucky');

  it('keeps the married and youth Lucky factor at exactly 1.15', () => {
    expect(evaluateTraitParityFactor({ traits: ['lucky'] }, CONCEPTION, 'lucky')).toBe(1.15);
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

  it('leaves an eligible non-Lucky mother on her original chance', () => {
    expect(evaluateTraitParityFactor({ traits: ['nurturing'] }, CONCEPTION, 'lucky')).toBe(1);
    expect(evaluateTraitParityFactor({ traits: [] }, CONCEPTION, 'lucky')).toBe(1);
    for (const chance of [0.0004, 0.0011]) {
      for (const fertility of [0.4, 0.9]) {
        expect(marriedNow(chance, fertility, ['nurturing'])).toBe(chance * fertility);
      }
    }
  });

  it('keeps affair conception free of the Lucky factor', () => {
    const source = readFileSync(join(process.cwd(), 'src/game/simulation/humanRelationships.ts'), 'utf8');
    const affairLine = source.split('\n').find((line) => line.includes('HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE *'));
    expect(affairLine).toBeDefined();
    expect(affairLine).not.toContain('evaluateTraitParityFactor');
    expect(evaluateTraitParityFactor({ traits: ['lucky'] }, { kind: 'romance', activity: 'remorse' }, 'lucky')).toBe(1);
  });
});
