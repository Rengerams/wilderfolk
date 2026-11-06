import {
  APTITUDE_IDS,
  expressAptitudes,
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

/** One dimension pushed high, every other dimension neutral. */
export function high(aptitude: GeneticAptitude): GenomeV2 {
  return genomeFrom({ [aptitude]: 90 });
}

/** One dimension pushed low, every other dimension neutral. */
export function low(aptitude: GeneticAptitude): GenomeV2 {
  return genomeFrom({ [aptitude]: 10 });
}

/** The settler's own relative expression for one dimension, in points. */
export function relativeOf(genome: GenomeV2, aptitude: GeneticAptitude): number {
  return expressAptitudes(genome).relative[APTITUDE_IDS.indexOf(aptitude)];
}

/** A pair whose two alleles differ, to exercise inheritance without depending on allele identity. */
export function heterozygous(value: number): AllelePair {
  return [value, Math.min(100, value + 10)];
}
