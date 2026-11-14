/**
 * The one typed activity table: signed aptitude weights per live activity. No owner keeps a
 * private weight table, and a dimension's sign is decided per activity, never globally.
 */
import type { GeneticAptitude } from '../settlerTraits';
import type { PersonalMarkId } from '../personalMarks';

export type AptitudeActivityId =
  | 'friendship'
  | 'reconciliation'
  | 'conflict'
  | 'learning'
  | 'research'
  | 'apprenticeshipTraining'
  | 'routineWork'
  | 'construction'
  | 'labor'
  | 'hunting'
  | 'pursuit'
  | 'escape'
  | 'defense'
  | 'courtship'
  | 'company'
  | 'bereavement'
  | 'communityReaction'
  | 'conception';

export interface AptitudeWeight {
  readonly aptitude: GeneticAptitude;
  /** Signed share of the activity; positive helps the named outcome, negative hurts it. */
  readonly weight: number;
}

export interface MarkWeight {
  readonly mark: PersonalMarkId;
  /** Signed contribution applied only while the settler carries the mark. */
  readonly weight: number;
}

export interface AptitudeActivity {
  readonly id: AptitudeActivityId;
  readonly label: string;
  /** Maximum relative change applied to the owner's baseline (0.15 = ±15%). */
  readonly cap: number;
  /** Cost activities multiply an unwanted chance: a high factor is bad for the settler. */
  readonly cost?: boolean;
  /** Signed weights; order is also the deterministic tie-break priority. */
  readonly weights: readonly AptitudeWeight[];
  /** Non-genetic marks that nudge this activity; absent means marks never apply. */
  readonly marks?: readonly MarkWeight[];
}

/**
 * The activity registry. `conflict` is a cost activity: its factor multiplies a feud chance, so a
 * low factor is good for the settler. Every other entry is an effectiveness factor.
 */
export const APTITUDE_ACTIVITIES: Readonly<Record<AptitudeActivityId, AptitudeActivity>> = {
  friendship: {
    id: 'friendship', label: 'Making friends', cap: 0.15,
    weights: [
      { aptitude: 'sociability', weight: 0.32 },
      { aptitude: 'sensitivity', weight: 0.24 },
      { aptitude: 'cooperation', weight: 0.30 },
      { aptitude: 'composure', weight: -0.14 },
    ],
    marks: [{ mark: 'pretty', weight: 0.12 }],
  },
  reconciliation: {
    id: 'reconciliation', label: 'Settling a quarrel', cap: 0.15,
    weights: [
      { aptitude: 'cooperation', weight: 0.34 },
      { aptitude: 'flexibility', weight: 0.30 },
      { aptitude: 'patience', weight: 0.16 },
      { aptitude: 'persistence', weight: -0.20 },
    ],
  },
  conflict: {
    id: 'conflict', label: 'Falling into a feud', cap: 0.12, cost: true,
    weights: [
      { aptitude: 'cooperation', weight: -0.30 },
      { aptitude: 'flexibility', weight: -0.20 },
      { aptitude: 'patience', weight: -0.18 },
      { aptitude: 'riskTaking', weight: 0.22 },
      { aptitude: 'composure', weight: 0.10 },
    ],
  },
  learning: {
    id: 'learning', label: 'Learning at school', cap: 0.18,
    weights: [
      { aptitude: 'curiosity', weight: 0.36 },
      { aptitude: 'persistence', weight: 0.28 },
      { aptitude: 'discipline', weight: 0.22 },
      { aptitude: 'flexibility', weight: -0.14 },
    ],
  },
  research: {
    id: 'research', label: 'Researching', cap: 0.15,
    weights: [
      { aptitude: 'reasoning', weight: 0.34 },
      { aptitude: 'curiosity', weight: 0.26 },
      { aptitude: 'persistence', weight: 0.22 },
      { aptitude: 'creativity', weight: 0.18 },
    ],
  },
  apprenticeshipTraining: {
    id: 'apprenticeshipTraining', label: 'Learning a trade', cap: 0.15,
    weights: [
      { aptitude: 'curiosity', weight: 0.30 },
      { aptitude: 'discipline', weight: 0.28 },
      { aptitude: 'persistence', weight: 0.26 },
      { aptitude: 'flexibility', weight: -0.16 },
    ],
  },
  routineWork: {
    id: 'routineWork', label: 'Routine production', cap: 0.15,
    weights: [
      { aptitude: 'discipline', weight: 0.28 },
      { aptitude: 'persistence', weight: 0.26 },
      { aptitude: 'flexibility', weight: -0.14 },
      { aptitude: 'curiosity', weight: -0.10 },
      { aptitude: 'creativity', weight: -0.10 },
      { aptitude: 'sociability', weight: -0.12 },
      { aptitude: 'initiative', weight: -0.08 },
    ],
  },
  construction: {
    id: 'construction', label: 'Improvising a build', cap: 0.18,
    weights: [
      { aptitude: 'creativity', weight: 0.32 },
      { aptitude: 'reasoning', weight: 0.28 },
      { aptitude: 'persistence', weight: 0.16 },
      { aptitude: 'initiative', weight: 0.12 },
      { aptitude: 'discipline', weight: -0.12 },
    ],
    marks: [{ mark: 'sickly', weight: -0.15 }],
  },
  labor: {
    id: 'labor', label: 'Enduring hard labour', cap: 0.15,
    weights: [
      { aptitude: 'persistence', weight: 0.30 },
      { aptitude: 'discipline', weight: 0.24 },
      { aptitude: 'composure', weight: 0.24 },
      { aptitude: 'sensitivity', weight: -0.22 },
    ],
    marks: [{ mark: 'sickly', weight: -0.30 }],
  },
  hunting: {
    id: 'hunting', label: 'Hunting', cap: 0.15,
    weights: [
      { aptitude: 'patience', weight: 0.30 },
      { aptitude: 'perception', weight: 0.30 },
      { aptitude: 'riskTaking', weight: 0.24 },
      { aptitude: 'reasoning', weight: -0.16 },
    ],
    marks: [{ mark: 'lucky', weight: 0.30 }],
  },
  pursuit: {
    id: 'pursuit', label: 'Pursuing game', cap: 0.12,
    weights: [
      { aptitude: 'persistence', weight: 0.28 },
      { aptitude: 'riskTaking', weight: 0.24 },
      { aptitude: 'perception', weight: 0.22 },
      { aptitude: 'patience', weight: -0.12 },
      { aptitude: 'reasoning', weight: -0.14 },
    ],
    marks: [{ mark: 'lucky', weight: 0.30 }],
  },
  escape: {
    id: 'escape', label: 'Fleeing danger', cap: 0.15,
    weights: [
      { aptitude: 'composure', weight: 0.26 },
      { aptitude: 'perception', weight: 0.24 },
      { aptitude: 'riskTaking', weight: -0.22 },
      { aptitude: 'patience', weight: -0.12 },
      { aptitude: 'persistence', weight: -0.08 },
      { aptitude: 'reasoning', weight: -0.08 },
    ],
    marks: [{ mark: 'lucky', weight: 0.30 }, { mark: 'sickly', weight: -0.20 }],
  },
  defense: {
    id: 'defense', label: 'Fighting in defence', cap: 0.15,
    weights: [
      { aptitude: 'composure', weight: 0.28 },
      { aptitude: 'riskTaking', weight: 0.22 },
      { aptitude: 'patience', weight: 0.18 },
      { aptitude: 'discipline', weight: 0.16 },
      { aptitude: 'cooperation', weight: -0.16 },
    ],
    marks: [
      { mark: 'lucky', weight: 0.20 },
      { mark: 'scarred', weight: 0.30 },
      { mark: 'sickly', weight: -0.25 },
    ],
  },
  courtship: {
    id: 'courtship', label: 'Courtship', cap: 0.15,
    weights: [
      { aptitude: 'initiative', weight: 0.32 },
      { aptitude: 'sociability', weight: 0.28 },
      { aptitude: 'perception', weight: 0.18 },
      { aptitude: 'patience', weight: 0.12 },
      { aptitude: 'sensitivity', weight: 0.10 },
    ],
    marks: [{ mark: 'pretty', weight: 0.35 }, { mark: 'scarred', weight: -0.20 }],
  },
  company: {
    id: 'company', label: 'Enjoying company', cap: 0.12,
    weights: [
      { aptitude: 'sociability', weight: 0.34 },
      { aptitude: 'flexibility', weight: 0.22 },
      { aptitude: 'sensitivity', weight: 0.12 },
      { aptitude: 'perception', weight: -0.18 },
      { aptitude: 'composure', weight: -0.14 },
    ],
    marks: [{ mark: 'pretty', weight: 0.12 }],
  },
  bereavement: {
    id: 'bereavement', label: 'Recovering from grief', cap: 0.15,
    weights: [
      { aptitude: 'composure', weight: 0.36 },
      { aptitude: 'flexibility', weight: 0.22 },
      { aptitude: 'persistence', weight: 0.14 },
      { aptitude: 'sensitivity', weight: -0.28 },
    ],
  },
  communityReaction: {
    id: 'communityReaction', label: 'Judging a captive', cap: 0.15,
    weights: [
      { aptitude: 'cooperation', weight: 0.34 },
      { aptitude: 'sensitivity', weight: 0.26 },
      { aptitude: 'flexibility', weight: 0.16 },
      { aptitude: 'discipline', weight: 0.14 },
      { aptitude: 'riskTaking', weight: -0.10 },
    ],
  },
  /** Deliberately non-genetic: no aptitude weights, so only an acquired mark can move it. */
  conception: {
    id: 'conception', label: 'Conceiving', cap: 0.10,
    weights: [],
    marks: [{ mark: 'lucky', weight: 0.50 }],
  },
} as const;

/** The typed activity IDs in canonical order; the coverage test enumerates this. */
export const APTITUDE_ACTIVITY_IDS = Object.freeze(Object.keys(APTITUDE_ACTIVITIES) as AptitudeActivityId[]);

/** The single live owner file each activity is wired through; checked by the coverage test. */
export const APTITUDE_ACTIVITY_OWNERS: Readonly<Record<AptitudeActivityId, string>> = {
  friendship: 'src/game/relationships.ts',
  reconciliation: 'src/game/relationships.ts',
  conflict: 'src/game/relationships.ts',
  learning: 'src/game/education.ts',
  research: 'src/game/education.ts',
  apprenticeshipTraining: 'src/game/apprenticeships.ts',
  routineWork: 'src/game/skills.ts',
  construction: 'src/game/skills.ts',
  labor: 'src/game/simulation/humanPhysiology.ts',
  hunting: 'src/game/humanHuntingBehavior.ts',
  pursuit: 'src/game/humanHuntingBehavior.ts',
  escape: 'src/game/humanTick.ts',
  defense: 'src/game/militiaBalance.ts',
  courtship: 'src/game/humanTick.ts',
  company: 'src/game/socialLife.ts',
  bereavement: 'src/game/humanLifecycleCleanup.ts',
  communityReaction: 'src/game/raidAftermath.ts',
  conception: 'src/game/simulation/humanRelationships.ts',
};
