/**
 * The one genetics evaluator: a bounded, deterministic activity factor from one genome.
 * It reads a narrow projection only — no world state, clock, RNG or writes.
 */
import { APTITUDE_IDS, aptitudeMean, type GeneticAptitude, type GenomeV2 } from '../settlerTraits';
import type { PersonalMark } from '../personalMarks';
import {
  APTITUDE_ACTIVITIES,
  APTITUDE_ACTIVITY_IDS,
  type AptitudeActivity,
  type AptitudeActivityId,
} from './activityAptitudes';

/** A person as far as DNA rules are concerned: never the whole entity or world state. */
export interface AptitudeSubject {
  readonly genomeV2?: GenomeV2 | null;
  readonly marks?: readonly PersonalMark[];
}

export interface AptitudeReason {
  readonly aptitude: GeneticAptitude;
  readonly effectId: string;
  /** Positive means this dimension helped the settler in this activity. */
  readonly direction: 'benefit' | 'drawback';
  /** Signed weight declared by the activity. */
  readonly weight: number;
  /** `raw - personal mean`, in 0–100 points. */
  readonly relative: number;
}

export interface AptitudeInfluence {
  /** Multiplier applied once to the owner's own baseline; 1 means neutral. */
  readonly factor: number;
  /** Normalized signed score in `[-1, 1]` before the activity cap. */
  readonly score: number;
  readonly reasons?: readonly AptitudeReason[];
}

export interface AptitudeEvaluationOptions {
  readonly includeReasons?: boolean;
}

export interface AptitudeActivityResult {
  readonly activity: AptitudeActivityId;
  readonly label: string;
  readonly factor: number;
  readonly score: number;
  readonly reasons: readonly AptitudeReason[];
}

const NEUTRAL: AptitudeInfluence = Object.freeze({ factor: 1, score: 0 });
const NEUTRAL_EXPLAINED: AptitudeInfluence = Object.freeze({ factor: 1, score: 0, reasons: Object.freeze([]) });
/** Minimal factor used only to break an exactly-zero weighted sum (PR #124 contract). */
const TIE_IMPACT = 0.005;
/** Below this many points a relative value is treated as personal-neutral. */
const REASON_THRESHOLD = 0.5;

const APTITUDE_INDEX: Readonly<Record<GeneticAptitude, number>> = (() => {
  const index = {} as Record<GeneticAptitude, number>;
  for (let i = 0; i < APTITUDE_IDS.length; i++) index[APTITUDE_IDS[i]] = i;
  return index;
})();

function relativeOf(genome: GenomeV2, mean: number, aptitude: GeneticAptitude): number {
  const pair = genome.aptitudeAlleles[APTITUDE_INDEX[aptitude]];
  return pair === undefined ? 0 : (pair[0] + pair[1]) / 2 - mean;
}

function directionOf(activity: AptitudeActivity, weight: number, relative: number): 'benefit' | 'drawback' {
  const positive = weight * relative > 0;
  return activity.cost === true
    ? (positive ? 'drawback' : 'benefit')
    : (positive ? 'benefit' : 'drawback');
}

/** Sum of the activity's mark weights the settler actually carries; zero when none apply. */
function markScoreOf(subject: AptitudeSubject | null | undefined, activity: AptitudeActivity): number {
  const entries = activity.marks;
  if (!entries || entries.length === 0) return 0;
  const carried = subject?.marks;
  if (!carried || carried.length === 0) return 0;
  let total = 0;
  for (const entry of entries) {
    if (carried.some((mark) => mark.id === entry.mark)) total += entry.weight;
  }
  return total;
}

/**
 * One combined modifier for one settler in one activity: signed aptitudes plus any personal
 * marks, normalized to `[-1, 1]` and capped once.
 *
 * `score = clamp(sum(w*d) / (50*sum|w|) + marks, -1, +1)` and `factor = 1 + cap*score`, with `d`
 * the dimension's deviation from the settler's own fourteen-dimension mean.
 */
export function evaluateAptitudeInfluence(
  subject: AptitudeSubject | null | undefined,
  activityId: AptitudeActivityId,
  options?: AptitudeEvaluationOptions,
): AptitudeInfluence {
  const explain = options?.includeReasons === true;
  const activity = APTITUDE_ACTIVITIES[activityId];
  if (activity === undefined) return explain ? NEUTRAL_EXPLAINED : NEUTRAL;

  const genome = subject?.genomeV2;
  const markScore = markScoreOf(subject, activity);
  const reasons: AptitudeReason[] | undefined = explain ? [] : undefined;
  let mean = 0;
  let weighted = 0;
  let weightSum = 0;

  // A mark-only activity reads no allele, so an acquired mark can never smuggle genetics in.
  if (genome && activity.weights.length > 0) {
    mean = aptitudeMean(genome);
    for (const entry of activity.weights) {
      const relative = relativeOf(genome, mean, entry.aptitude);
      weighted += entry.weight * relative;
      weightSum += Math.abs(entry.weight);
      if (reasons !== undefined && Math.abs(relative) >= REASON_THRESHOLD) {
        reasons.push(Object.freeze({
          aptitude: entry.aptitude,
          effectId: `${activityId}.${entry.aptitude}`,
          direction: directionOf(activity, entry.weight, relative),
          weight: entry.weight,
          relative,
        }));
      }
    }
  }

  if (weightSum === 0 && markScore === 0) return explain ? NEUTRAL_EXPLAINED : NEUTRAL;

  if (genome && weightSum > 0 && markScore === 0 && Math.abs(weighted) < 1e-9) {
    // Exact tie: the first relevant non-neutral dimension in declared weight order decides.
    for (const entry of activity.weights) {
      const relative = relativeOf(genome, mean, entry.aptitude);
      if (Math.abs(relative) < REASON_THRESHOLD) continue;
      const sign = Math.sign(entry.weight * relative);
      if (sign === 0) continue;
      const factor = 1 + sign * TIE_IMPACT;
      return explain
        ? Object.freeze({ factor, score: (factor - 1) / activity.cap, reasons: Object.freeze(reasons ?? []) })
        : Object.freeze({ factor, score: (factor - 1) / activity.cap });
    }
    return explain ? NEUTRAL_EXPLAINED : NEUTRAL;
  }

  const aptitudeScore = weightSum === 0 ? 0 : Math.max(-1, Math.min(1, weighted / (50 * weightSum)));
  const score = Math.max(-1, Math.min(1, aptitudeScore + markScore));
  const factor = Math.max(1 - activity.cap, Math.min(1 + activity.cap, 1 + activity.cap * score));
  return explain
    ? Object.freeze({ factor, score, reasons: Object.freeze(reasons ?? []) })
    : Object.freeze({ factor, score });
}

/**
 * Symmetric pair rule: the two individual modifiers are averaged, never multiplied or summed.
 * Eligibility, consent and reciprocal writes stay in the existing pair owner.
 */
export function combinePairFactors(left: number, right: number): number {
  return (left + right) / 2;
}

/** Every registered activity's result for one settler — inspector and coverage tests only. */
export function evaluateAllAptitudeActivities(
  subject: AptitudeSubject | null | undefined,
): readonly AptitudeActivityResult[] {
  return APTITUDE_ACTIVITY_IDS.map((activity) => {
    const influence = evaluateAptitudeInfluence(subject, activity, { includeReasons: true });
    return Object.freeze({
      activity,
      label: APTITUDE_ACTIVITIES[activity].label,
      factor: influence.factor,
      score: influence.score,
      reasons: influence.reasons ?? Object.freeze([]),
    });
  });
}
