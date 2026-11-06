/**
 * The single owner of genetic identity: fourteen inherited aptitude dimensions, allocation,
 * inheritance, validation and the deterministic old-save backfill.
 */
import { createSeededRng, getSimRng, randomInt, type RngStream } from './simRng';

/**
 * The canonical ordered aptitude IDs. Index == genome slot; every table below derives from it.
 * Order is part of the saved genome contract — append only with a version bump.
 */
export const APTITUDE_IDS = [
  'sociability',
  'sensitivity',
  'cooperation',
  'curiosity',
  'persistence',
  'flexibility',
  'patience',
  'riskTaking',
  'perception',
  'initiative',
  'composure',
  'discipline',
  'reasoning',
  'creativity',
] as const;

export type GeneticAptitude = (typeof APTITUDE_IDS)[number];

/** Number of inherited dimensions; the genome length is fixed by the ID list. */
export const APTITUDE_COUNT = APTITUDE_IDS.length;

export interface AptitudeDef {
  readonly id: GeneticAptitude;
  readonly label: string;
  /** What a high expression looks like; the downside lives in the activity registry. */
  readonly high: string;
  /** What a low expression looks like. */
  readonly low: string;
}

/** Player-facing wording only; gameplay names and weights live in the activity registry. */
export const APTITUDE_DEFS: Readonly<Record<GeneticAptitude, AptitudeDef>> = {
  sociability: { id: 'sociability', label: 'Sociability', high: 'Seeks contact and starts conversations', low: 'Content with solitude' },
  sensitivity: { id: 'sensitivity', label: 'Sensitivity', high: 'Notices and shares feelings', low: 'Hard to ruffle' },
  cooperation: { id: 'cooperation', label: 'Cooperation', high: 'Works toward common ground', low: 'Goes their own way' },
  curiosity: { id: 'curiosity', label: 'Curiosity', high: 'Explores and learns new things', low: 'Prefers the familiar' },
  persistence: { id: 'persistence', label: 'Persistence', high: 'Keeps going despite setbacks', low: 'Changes course early' },
  flexibility: { id: 'flexibility', label: 'Flexibility', high: 'Adapts plans readily', low: 'Sticks to the plan' },
  patience: { id: 'patience', label: 'Patience', high: 'Waits and works carefully', low: 'Acts quickly' },
  riskTaking: { id: 'riskTaking', label: 'Risk-taking', high: 'Acts despite uncertainty', low: 'Avoids unnecessary risk' },
  perception: { id: 'perception', label: 'Perception', high: 'Notices fine details and cues', low: 'Ignores background noise' },
  initiative: { id: 'initiative', label: 'Initiative', high: 'Starts action independently', low: 'Waits to be asked' },
  composure: { id: 'composure', label: 'Composure', high: 'Stays calm under stress', low: 'Wears feelings openly' },
  discipline: { id: 'discipline', label: 'Discipline', high: 'Keeps routines and obligations', low: 'Improvises as they go' },
  reasoning: { id: 'reasoning', label: 'Reasoning', high: 'Analyzes patterns and problems', low: 'Trusts instinct' },
  creativity: { id: 'creativity', label: 'Creativity', high: 'Finds unconventional solutions', low: 'Follows proven methods' },
};

/** A single inherited allele value, a validated finite integer in `[0, 100]`. */
export type AptitudeAllele = number;

/** One dimension's maternal and paternal allele, in that documented order. */
export type AllelePair = readonly [AptitudeAllele, AptitudeAllele];

/** The one authoritative genotype. The pair order is exactly `APTITUDE_IDS`. */
export interface GenomeV2 {
  readonly version: 2;
  readonly aptitudeAlleles: readonly AllelePair[];
}

export const GENOME_VERSION = 2 as const;
export const ALLELE_MIN = 0;
export const ALLELE_MAX = 100;

/** Founder alleles are drawn inside this band so no settler starts at a flat extreme. */
const FOUNDER_ALLELE_MIN = 20;
const FOUNDER_ALLELE_MAX = 80;
/** Backfilled old-save alleles stay near the middle; the colony still gets variety. */
const BACKFILL_ALLELE_MIN = 35;
const BACKFILL_ALLELE_MAX = 65;
/** A genome must show at least this many points between its highest and lowest expression. */
export const MIN_EXPRESSION_SPREAD = 10;
/** Rare birth mutation: per-allele chance and maximum bounded step. */
const BIRTH_MUTATION_CHANCE = 0.02;
const BIRTH_MUTATION_STEP = 4;

export interface AptitudeExpression {
  /** Mean of the two alleles per dimension, in `APTITUDE_IDS` order. */
  readonly raw: readonly number[];
  /** Mean of the fourteen raw values — the personal baseline. */
  readonly mean: number;
  /** `raw[i] - mean`; positive means above this person's own average. */
  readonly relative: readonly number[];
}

function clampAllele(value: number): AptitudeAllele {
  if (!Number.isFinite(value)) return ALLELE_MIN;
  const rounded = Math.round(value);
  return Math.max(ALLELE_MIN, Math.min(ALLELE_MAX, rounded));
}

function meanOfPair(pair: AllelePair): number {
  return (pair[0] + pair[1]) / 2;
}

/** Shared draw for founders and deterministic backfill; the caller owns only the allele band. */
function drawGenome(rng: RngStream, min: number, max: number): GenomeV2 {
  const pairs: AllelePair[] = [];
  for (let i = 0; i < APTITUDE_COUNT; i++) {
    pairs.push([randomInt(rng, min, max), randomInt(rng, min, max)]);
  }
  return buildGenome(ensureSpread(pairs));
}

/** Mean of the fourteen expressed values; the shared personal baseline for relative scoring. */
export function aptitudeMean(genome: GenomeV2): number {
  let sum = 0;
  for (const pair of genome.aptitudeAlleles) sum += meanOfPair(pair);
  return sum / genome.aptitudeAlleles.length;
}

/** Read-only raw/mean/relative projection for the inspector and tests. */
export function expressAptitudes(genome: GenomeV2): AptitudeExpression {
  const raw: number[] = [];
  let sum = 0;
  for (const pair of genome.aptitudeAlleles) {
    const value = meanOfPair(pair);
    raw.push(value);
    sum += value;
  }
  const mean = sum / raw.length;
  const relative = raw.map((value) => value - mean);
  return Object.freeze({ raw: Object.freeze(raw), mean, relative: Object.freeze(relative) });
}

/** Push the lowest and highest dimensions apart until the profile spans the minimum spread. */
function ensureSpread(pairs: AllelePair[]): AllelePair[] {
  let lowIndex = 0;
  let highIndex = 0;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < pairs.length; i++) {
    const value = meanOfPair(pairs[i]);
    if (value < low) { low = value; lowIndex = i; }
    if (value > high) { high = value; highIndex = i; }
  }
  const deficit = MIN_EXPRESSION_SPREAD - (high - low);
  if (deficit <= 0) return pairs;

  // A flat profile has one index at both ends, so the push must use two different dimensions.
  if (lowIndex === highIndex) {
    const otherIndex = (highIndex + 1) % pairs.length;
    const highPair = pairs[highIndex];
    const otherPair = pairs[otherIndex];
    pairs[highIndex] = [clampAllele(highPair[0] + deficit), clampAllele(highPair[1] + deficit)];
    pairs[otherIndex] = [clampAllele(otherPair[0] - deficit), clampAllele(otherPair[1] - deficit)];
    return pairs;
  }

  const highPair = pairs[highIndex];
  const lowPair = pairs[lowIndex];
  // Moving both ends by the full deficit clears the target even when one end sits at a bound.
  pairs[highIndex] = [clampAllele(highPair[0] + deficit), clampAllele(highPair[1] + deficit)];
  pairs[lowIndex] = [clampAllele(lowPair[0] - deficit), clampAllele(lowPair[1] - deficit)];
  return pairs;
}

function buildGenome(pairs: AllelePair[]): GenomeV2 {
  const frozen = pairs.map((pair) => Object.freeze([pair[0], pair[1]] as const));
  return Object.freeze({ version: GENOME_VERSION, aptitudeAlleles: Object.freeze(frozen) });
}

/** The one founder allocation; `stream` is the injected-RNG seam for tests and deterministic loads. */
export function rollFounderGenome(stream?: RngStream): GenomeV2 {
  return drawGenome(stream ?? getSimRng('settlerGenetics'), FOUNDER_ALLELE_MIN, FOUNDER_ALLELE_MAX);
}

/** Deterministic per-citizen backfill: stable for a save file and never draws from a live stream. */
export function genomeFromSeed(colonySeed: number, entityId: number): GenomeV2 {
  return drawGenome(createSeededRng(colonySeed, `settlerGenome:${entityId}`), BACKFILL_ALLELE_MIN, BACKFILL_ALLELE_MAX);
}

/** Validate an untrusted saved genome: version 2, exactly fourteen bounded pairs, no extra keys. */
export function normalizeGenome(value: unknown): GenomeV2 | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('version') || !keys.includes('aptitudeAlleles')) return undefined;
  if (record.version !== GENOME_VERSION) return undefined;
  const saved = record.aptitudeAlleles;
  if (!Array.isArray(saved) || saved.length !== APTITUDE_COUNT) return undefined;
  const pairs: AllelePair[] = [];
  for (const entry of saved) {
    if (!Array.isArray(entry) || entry.length !== 2) return undefined;
    for (const allele of entry) {
      if (typeof allele !== 'number' || !Number.isSafeInteger(allele)
        || allele < ALLELE_MIN || allele > ALLELE_MAX) return undefined;
    }
    pairs.push([entry[0], entry[1]]);
  }
  return buildGenome(ensureSpread(pairs));
}

function mutated(allele: AptitudeAllele, rng: RngStream): AptitudeAllele {
  if (rng() >= BIRTH_MUTATION_CHANCE) return allele;
  const step = 1 + Math.floor(rng() * BIRTH_MUTATION_STEP);
  const direction = rng() < 0.5 ? -1 : 1;
  return clampAllele(allele + direction * step);
}

/** Biological inheritance: one allele per parent per dimension, plus a rare bounded mutation. */
export function inheritGenome(
  mother?: GenomeV2 | null,
  father?: GenomeV2 | null,
  stream?: RngStream,
): GenomeV2 {
  const rng = stream ?? getSimRng('settlerGenetics');
  const pairs: AllelePair[] = [];
  for (let i = 0; i < APTITUDE_COUNT; i++) {
    // A missing parent genome falls back to a neutral 50 allele, never a second source.
    const motherPair = mother?.aptitudeAlleles[i];
    const fatherPair = father?.aptitudeAlleles[i];
    const maternal = motherPair ? motherPair[rng() < 0.5 ? 0 : 1] : 50;
    const paternal = fatherPair ? fatherPair[rng() < 0.5 ? 0 : 1] : 50;
    pairs.push([mutated(maternal, rng), mutated(paternal, rng)]);
  }
  return buildGenome(ensureSpread(pairs));
}

/** A genome carrier as far as genetics rules are concerned: never the whole entity or world. */
export interface GenomeCarrier {
  readonly genomeV2?: GenomeV2 | null;
}

/** The carrier's genome, or `undefined` for a pre-migration/dead/foreign subject. */
export function genomeOf(carrier: GenomeCarrier | null | undefined): GenomeV2 | undefined {
  return carrier?.genomeV2 ?? undefined;
}
