/**
 * The genome owner — founder allocation, inheritance, validation, expression and old-save backfill.
 * PR #124 replaces the retired three-label model with fourteen continuous inherited dimensions.
 */
import { describe, it, expect } from 'vitest';
import { createSeededRng } from '../src/game/simRng';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import {
  ALLELE_MAX,
  ALLELE_MIN,
  APTITUDE_COUNT,
  APTITUDE_DEFS,
  APTITUDE_IDS,
  MIN_EXPRESSION_SPREAD,
  expressAptitudes,
  genomeFromSeed,
  inheritGenome,
  normalizeGenome,
  rollFounderGenome,
  type GenomeV2,
} from '../src/game/settlerTraits';
import { genomeFrom } from './helpers/genome';

function spread(genome: GenomeV2): number {
  const raw = expressAptitudes(genome).raw;
  return Math.max(...raw) - Math.min(...raw);
}

describe('aptitude catalog', () => {
  it('declares exactly fourteen unique ordered IDs with wording for each', () => {
    expect(APTITUDE_IDS).toHaveLength(14);
    expect(new Set(APTITUDE_IDS).size).toBe(14);
    expect(APTITUDE_COUNT).toBe(14);
    for (const id of APTITUDE_IDS) {
      expect(APTITUDE_DEFS[id].id).toBe(id);
      expect(APTITUDE_DEFS[id].label.length).toBeGreaterThan(0);
      expect(APTITUDE_DEFS[id].high.length).toBeGreaterThan(0);
      expect(APTITUDE_DEFS[id].low.length).toBeGreaterThan(0);
    }
  });
});

describe('rollFounderGenome', () => {
  it('draws fourteen bounded integer allele pairs with a meaningful personal spread', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const genome = rollFounderGenome(createSeededRng(seed, 'founderTest'));
      expect(genome.version).toBe(2);
      expect(genome.aptitudeAlleles).toHaveLength(APTITUDE_COUNT);
      for (const [a, b] of genome.aptitudeAlleles) {
        for (const allele of [a, b]) {
          expect(Number.isSafeInteger(allele)).toBe(true);
          expect(allele).toBeGreaterThanOrEqual(ALLELE_MIN);
          expect(allele).toBeLessThanOrEqual(ALLELE_MAX);
        }
      }
      expect(spread(genome), `seed ${seed}`).toBeGreaterThanOrEqual(MIN_EXPRESSION_SPREAD);
    }
  });

  it('is reproducible for a seeded stream and different across seeds', () => {
    const first = rollFounderGenome(createSeededRng(123, 'founderTest'));
    const again = rollFounderGenome(createSeededRng(123, 'founderTest'));
    const other = rollFounderGenome(createSeededRng(124, 'founderTest'));
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it('never has a universal best genome: every founder has a high and a low dimension', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { relative } = expressAptitudes(rollFounderGenome(createSeededRng(seed, 'founderTest')));
      expect(Math.max(...relative), `seed ${seed}`).toBeGreaterThan(0);
      expect(Math.min(...relative), `seed ${seed}`).toBeLessThan(0);
    }
  });
});

describe('inheritGenome', () => {
  it('takes one documented allele from each biological parent per dimension', () => {
    const mother: GenomeV2 = {
      version: 2,
      aptitudeAlleles: APTITUDE_IDS.map((_, i) => [10 + i, 20 + i] as const),
    };
    const father: GenomeV2 = {
      version: 2,
      aptitudeAlleles: APTITUDE_IDS.map((_, i) => [30 + i, 40 + i] as const),
    };
    // 0.99 chooses index 1 from each parent and never rolls a mutation.
    const child = inheritGenome(mother, father, () => 0.99);
    APTITUDE_IDS.forEach((_, i) => {
      expect(child.aptitudeAlleles[i]).toEqual([20 + i, 40 + i]);
    });
  });

  it('applies a bounded rare mutation without breaking allele bounds', () => {
    const lower: GenomeV2 = { version: 2, aptitudeAlleles: APTITUDE_IDS.map(() => [0, 0] as const) };
    const upper: GenomeV2 = { version: 2, aptitudeAlleles: APTITUDE_IDS.map(() => [100, 100] as const) };
    // 0 forces a mutation and negative direction on every inherited allele.
    const child = inheritGenome(lower, upper, () => 0);
    for (const [a, b] of child.aptitudeAlleles) {
      for (const allele of [a, b]) {
        expect(allele).toBeGreaterThanOrEqual(ALLELE_MIN);
        expect(allele).toBeLessThanOrEqual(ALLELE_MAX);
      }
    }
    // At least one side must show the mutation rather than the untouched parent allele.
    expect(child.aptitudeAlleles.some(([a, b]) => a !== ALLELE_MIN || b !== ALLELE_MAX)).toBe(true);
  });

  it('guarantees a diverse profile even when two neutral parents would be flat', () => {
    const child = inheritGenome(genomeFrom(), genomeFrom(), () => 0.99);
    const raw = expressAptitudes(child).raw;
    expect(Math.max(...raw) - Math.min(...raw)).toBeGreaterThanOrEqual(MIN_EXPRESSION_SPREAD);
  });

  it('falls back to a neutral allele when a parent has no genome', () => {
    const mother = genomeFrom({ sociability: 80 });
    const child = inheritGenome(mother, undefined, () => 0.99);
    expect(child.aptitudeAlleles[0]).toEqual([80, 50]);
  });
});

describe('normalizeGenome', () => {
  it('accepts a valid version-2 genome and re-freezes it', () => {
    const valid = genomeFrom({ curiosity: 70 });
    expect(normalizeGenome(valid)?.aptitudeAlleles[3]).toEqual([70, 70]);
  });

  it('rejects a wrong version, wrong length, malformed pair, out-of-bounds or extra key', () => {
    const valid = genomeFrom();
    const record = valid as unknown as Record<string, unknown>;
    expect(normalizeGenome({ ...record, version: 1 })).toBeUndefined();
    expect(normalizeGenome({ version: 2, aptitudeAlleles: valid.aptitudeAlleles.slice(1) })).toBeUndefined();
    expect(normalizeGenome({ version: 2, aptitudeAlleles: valid.aptitudeAlleles.map(() => [1] as unknown as readonly [number, number]) })).toBeUndefined();
    expect(normalizeGenome({ version: 2, aptitudeAlleles: valid.aptitudeAlleles.map(() => [1.5, 2] as const) })).toBeUndefined();
    expect(normalizeGenome({ version: 2, aptitudeAlleles: valid.aptitudeAlleles.map(() => [-1, 2] as const) })).toBeUndefined();
    expect(normalizeGenome({ ...record, extra: true })).toBeUndefined();
    expect(normalizeGenome(null)).toBeUndefined();
    expect(normalizeGenome([])).toBeUndefined();
  });

  it('never rerolls a valid saved genome (double-load idempotence)', () => {
    const saved = genomeFrom({ sociability: 81, composure: 19 });
    const first = normalizeGenome(JSON.parse(JSON.stringify(saved)));
    const second = normalizeGenome(JSON.parse(JSON.stringify(first)));
    expect(first).toEqual(saved);
    expect(second).toEqual(first);
  });
});

describe('genomeFromSeed (old-save backfill)', () => {
  it('is deterministic per colony seed and citizen id and consumes no live stream', () => {
    const first = genomeFromSeed(4242, 17);
    const again = genomeFromSeed(4242, 17);
    const otherCitizen = genomeFromSeed(4242, 18);
    expect(again).toEqual(first);
    expect(otherCitizen).not.toEqual(first);
    expect(spread(first)).toBeGreaterThanOrEqual(MIN_EXPRESSION_SPREAD);
  });
});

describe('expressAptitudes', () => {
  it('uses the mean of the two alleles and centers relative values on the personal mean', () => {
    const genome: GenomeV2 = { version: 2, aptitudeAlleles: APTITUDE_IDS.map(() => [40, 60] as const) };
    const expression = expressAptitudes(genome);
    expect(expression.raw.every((value) => value === 50)).toBe(true);
    expect(expression.mean).toBe(50);
    expect(expression.relative.every((value) => value === 0)).toBe(true);

    const uneven = expressAptitudes(genomeFrom({ sociability: 90 }));
    expect(uneven.relative[0]).toBeGreaterThan(0);
    const sum = uneven.relative.reduce((total, value) => total + value, 0);
    expect(sum).toBeCloseTo(0, 10);
  });
});

describe('entity creation', () => {
  it('gives every settler one fourteen-dimension genome', () => {
    const entity = createEntity(EntityType.Human, 0, 0, 1, 100, false, { gender: 'male' });
    expect(entity.genomeV2?.aptitudeAlleles).toHaveLength(14);
  });

  it('uses the inherited genome for a newborn', () => {
    const inherited = genomeFrom({ patience: 88 });
    const child = createEntity(EntityType.Human, 0, 0, 2, 100, true, { gender: 'female', inheritedGenome: inherited });
    expect(child.genomeV2).toBe(inherited);
  });

  it('does not give a genome to non-humans', () => {
    const rabbit = createEntity(EntityType.Rabbit, 0, 0, 3, 100);
    expect(rabbit.genomeV2).toBeUndefined();
  });

  it('survives the full game init (worldGen path)', () => {
    const state = initGame();
    const settlers = state.entities.filter((entity) => entity.type === EntityType.Human && entity.alive);
    expect(settlers.length).toBeGreaterThan(0);
    for (const settler of settlers) {
      expect(settler.genomeV2?.aptitudeAlleles).toHaveLength(14);
    }
  });
});
