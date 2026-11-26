import {
  APTITUDE_IDS,
  type AllelePair,
  type GeneticAptitude,
  type GenomeV2,
} from '../../src/game/settlerTraits';

/** Values that are neutral on every dimension (raw 50, so every relative value is zero). */
export const NEUTRAL_VALUE = 50;

/** A genome whose raw expression equals the given value per dimension (default 50). */
export function genomeFrom(values: Partial<Record<GeneticAptitude, number>> = {}): GenomeV2 {
  const aptitudeAlleles: AllelePair[] = APTITUDE_IDS.map((id) => {
    const value = values[id] ?? NEUTRAL_VALUE;
    return [value, value] as const;
  });
  return { version: 2, aptitudeAlleles };
}

/** A pair whose two alleles differ, to exercise inheritance without depending on allele identity. */
export function heterozygous(value: number): AllelePair {
  return [value, Math.min(100, value + 10)];
}
