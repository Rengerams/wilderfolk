import { describe, expect, it } from 'vitest';
import {
  combinePairFactors,
  evaluateAllAptitudeActivities,
  evaluateAptitudeInfluence,
} from '../src/game/personality/traitEvaluation';
import { APTITUDE_ACTIVITIES } from '../src/game/personality/activityAptitudes';
import { APTITUDE_IDS, rollFounderGenome } from '../src/game/settlerTraits';
import { createSeededRng } from '../src/game/simRng';
import { genomeFrom } from './helpers/genome';

const DEFENSE = 'defense' as const;

function expectsInCap(activity: keyof typeof APTITUDE_ACTIVITIES, factor: number): void {
  const cap = APTITUDE_ACTIVITIES[activity].cap;
  expect(factor).toBeGreaterThanOrEqual(1 - cap - 1e-12);
  expect(factor).toBeLessThanOrEqual(1 + cap + 1e-12);
}

describe('evaluateAptitudeInfluence — neutral and bounded contract', () => {
  it('returns a neutral result without a genome, explained or not', () => {
    expect(evaluateAptitudeInfluence({}, DEFENSE)).toEqual({ factor: 1, score: 0 });
    expect(evaluateAptitudeInfluence(undefined, DEFENSE)).toEqual({ factor: 1, score: 0 });
    expect(evaluateAptitudeInfluence({ genomeV2: null }, DEFENSE, { includeReasons: true }))
      .toEqual({ factor: 1, score: 0, reasons: [] });
  });

  it('treats a genome with no personal spread as neutral (no universal best settler)', () => {
    const flat = genomeFrom();
    expect(evaluateAptitudeInfluence({ genomeV2: flat }, 'friendship')).toEqual({ factor: 1, score: 0 });
    const allHigh = { version: 2 as const, aptitudeAlleles: APTITUDE_IDS.map(() => [80, 80] as const) };
    expect(evaluateAptitudeInfluence({ genomeV2: allHigh }, 'hunting').factor).toBe(1);
  });

  it('keeps every activity inside its declared cap', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const genome = rollFounderGenome(createSeededRng(seed, 'evaluatorTest'));
      for (const result of evaluateAllAptitudeActivities({ genomeV2: genome })) {
        expectsInCap(result.activity, result.factor);
        expect(Math.abs(result.score)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic and leaves the genome untouched', () => {
    const genome = genomeFrom({ patience: 88, reasoning: 20 });
    const before = JSON.stringify(genome);
    const first = evaluateAptitudeInfluence({ genomeV2: genome }, 'hunting', { includeReasons: true });
    const second = evaluateAptitudeInfluence({ genomeV2: genome }, 'hunting', { includeReasons: true });
    expect(second).toEqual(first);
    expect(JSON.stringify(genome)).toBe(before);
  });
});

describe('evaluateAptitudeInfluence — signed directions', () => {
  it('helps where the weight is positive and hurts where it is negative', () => {
    const highSociability = genomeFrom({ sociability: 90 });
    const lowSociability = genomeFrom({ sociability: 10 });
    expect(evaluateAptitudeInfluence({ genomeV2: highSociability }, 'friendship').factor).toBeGreaterThan(1);
    expect(evaluateAptitudeInfluence({ genomeV2: lowSociability }, 'friendship').factor).toBeLessThan(1);
    // The same dimension is a drawback in routine work.
    expect(evaluateAptitudeInfluence({ genomeV2: highSociability }, 'routineWork').factor).toBeLessThan(1);
    expect(evaluateAptitudeInfluence({ genomeV2: lowSociability }, 'routineWork').factor).toBeGreaterThan(1);
  });

  it('treats conflict as a cost activity: cooperation lowers it, risk-taking raises it', () => {
    const cooperative = evaluateAptitudeInfluence({ genomeV2: genomeFrom({ cooperation: 90 }) }, 'conflict', { includeReasons: true });
    const risky = evaluateAptitudeInfluence({ genomeV2: genomeFrom({ riskTaking: 90 }) }, 'conflict', { includeReasons: true });
    expect(cooperative.factor).toBeLessThan(1);
    expect(risky.factor).toBeGreaterThan(1);
    // Above-average cooperation is a benefit in a cost activity; above-average risk-taking is a drawback.
    expect(cooperative.reasons?.find((reason) => reason.aptitude === 'cooperation')?.direction).toBe('benefit');
    expect(risky.reasons?.find((reason) => reason.aptitude === 'riskTaking')?.direction).toBe('drawback');
  });

  it('explains only dimensions above the personal-neutral threshold, and only on request', () => {
    const genome = genomeFrom({ perception: 0 });
    const plain = evaluateAptitudeInfluence({ genomeV2: genome }, 'hunting');
    expect(plain).not.toHaveProperty('reasons');
    const explained = evaluateAptitudeInfluence({ genomeV2: genome }, 'hunting', { includeReasons: true });
    expect(explained.reasons?.length).toBeGreaterThan(0);
    for (const reason of explained.reasons ?? []) {
      expect(reason.effectId).toBe(`hunting.${reason.aptitude}`);
      expect(reason.weight).not.toBe(0);
    }
  });

  it('breaks an exactly-zero weighted sum from the first relevant declared dimension', () => {
    // friendship weights: sociability +0.32, sensitivity +0.24, cooperation +0.30, composure -0.14.
    // These offsets keep the personal mean at 50 and cancel the weighted sum exactly.
    const genome = genomeFrom({ sociability: 64, composure: 82, curiosity: 4 });
    const result = evaluateAptitudeInfluence({ genomeV2: genome }, 'friendship');
    expect(result.factor).toBeCloseTo(1.005, 10);
    expect(result.score).toBeCloseTo(0.005 / APTITUDE_ACTIVITIES.friendship.cap, 10);
  });
});

describe('combinePairFactors', () => {
  it('averages two individual modifiers symmetrically', () => {
    expect(combinePairFactors(1.1, 0.9)).toBeCloseTo(1, 10);
    expect(combinePairFactors(0.9, 1.1)).toBeCloseTo(1, 10);
    expect(combinePairFactors(1.15, 0.85)).toBeCloseTo(1, 10);
  });
});
