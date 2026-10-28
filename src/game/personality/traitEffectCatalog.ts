import type { JobType, SettlerTrait } from '../gameTypes';

// These are decision contexts, not additional schedules or persisted state.
export type TraitContext =
  | { readonly kind: 'work'; readonly job: JobType; readonly action: 'production' | 'construction' | 'training' }
  | { readonly kind: 'school'; readonly activity: 'learning' | 'teaching' | 'research' }
  | { readonly kind: 'physiology'; readonly activity: 'labor' | 'cold' | 'recovery' }
  | { readonly kind: 'danger'; readonly activity: 'hunting' | 'pursuit' | 'defense' | 'escape' }
  | { readonly kind: 'social'; readonly activity: 'friendship' | 'conflict' | 'courtship' | 'reconciliation' | 'banter' }
  | { readonly kind: 'family'; readonly activity: 'care' | 'parenting' | 'bereavement' }
  | { readonly kind: 'romance'; readonly activity: 'attachment' | 'affair_approach' | 'remorse' | 'conception' }
  | { readonly kind: 'leisure'; readonly activity: 'company' | 'solitude' | 'community' }
  | { readonly kind: 'civic'; readonly activity: 'leadership' | 'negotiation' | 'mercy' };

export interface TraitEffect {
  readonly when: TraitContext;
  readonly effectId: string;
  readonly factorDelta: number;
  readonly tendencyDelta: number;
}

export type TraitVote = 'restraint' | 'severity';

/** Exact historical value kept for parity; never passes through the bounded factor cap. */
export type TraitParityEffect =
  | { readonly mode: 'multiplier'; readonly when: TraitContext; readonly effectId: string; readonly multiplier: number }
  | { readonly mode: 'value'; readonly when: TraitContext; readonly effectId: string; readonly value: number }
  | { readonly mode: 'vote'; readonly when: TraitContext; readonly effectId: string; readonly vote: TraitVote };

export interface TraitEffects {
  readonly benefit: TraitEffect;
  readonly drawback: TraitEffect;
  /** A further context in which the same trait applies. */
  readonly also?: readonly TraitEffect[];
  /** Exact-parity values, read only by the evaluator's parity entry points. */
  readonly parity?: readonly TraitParityEffect[];
}

// A factor delta changes effectiveness; a tendency delta changes willingness.
export const TRAIT_EFFECTS = {
  hardy: {
    benefit: { when: { kind: 'physiology', activity: 'labor' }, effectId: 'hardy.endurance', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'physiology', activity: 'recovery' }, effectId: 'hardy.restReluctance', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  brave: {
    benefit: { when: { kind: 'danger', activity: 'hunting' }, effectId: 'brave.huntingResolve', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'danger', activity: 'escape' }, effectId: 'brave.lateRetreat', factorDelta: -0.05, tendencyDelta: -0.08 },
    also: [
      { when: { kind: 'danger', activity: 'pursuit' }, effectId: 'brave.relentlessPursuit', factorDelta: 0.05, tendencyDelta: 0.06 },
    ],
  },
  gregarious: {
    benefit: { when: { kind: 'social', activity: 'friendship' }, effectId: 'gregarious.bonding', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'leisure', activity: 'solitude' }, effectId: 'gregarious.dislikesSolitude', factorDelta: -0.04, tendencyDelta: -0.10 },
    parity: [
      { mode: 'multiplier', when: { kind: 'social', activity: 'courtship' }, effectId: 'gregarious.courtshipConfidence', multiplier: 1.4 },
    ],
  },
  timid: {
    benefit: { when: { kind: 'danger', activity: 'escape' }, effectId: 'timid.earlyRetreat', factorDelta: 0.07, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'courtship' }, effectId: 'timid.hesitation', factorDelta: -0.05, tendencyDelta: -0.09 },
    parity: [
      { mode: 'multiplier', when: { kind: 'social', activity: 'courtship' }, effectId: 'timid.courtshipReserve', multiplier: 0.7 },
    ],
  },
  greenthumb: {
    benefit: { when: { kind: 'work', job: 'farmer', action: 'production' }, effectId: 'greenthumb.cropCare', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'work', job: 'blacksmith', action: 'training' }, effectId: 'greenthumb.indoorTrade', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  lucky: {
    benefit: { when: { kind: 'danger', activity: 'hunting' }, effectId: 'lucky.huntOpportunity', factorDelta: 0.04, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'danger', activity: 'escape' }, effectId: 'lucky.overconfidence', factorDelta: -0.04, tendencyDelta: -0.06 },
    parity: [
      { mode: 'multiplier', when: { kind: 'romance', activity: 'conception' }, effectId: 'lucky.conceptionChance', multiplier: 1.15 },
    ],
  },
  nurturing: {
    benefit: { when: { kind: 'family', activity: 'care' }, effectId: 'nurturing.care', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'family', activity: 'bereavement' }, effectId: 'nurturing.deeperGrief', factorDelta: -0.04, tendencyDelta: -0.06 },
    parity: [
      { mode: 'vote', when: { kind: 'civic', activity: 'mercy' }, effectId: 'nurturing.restraintVote', vote: 'restraint' },
    ],
  },
  insightful: {
    benefit: { when: { kind: 'school', activity: 'research' }, effectId: 'insightful.research', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'social', activity: 'conflict' }, effectId: 'insightful.rumination', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  chivalrous: {
    benefit: { when: { kind: 'danger', activity: 'defense' }, effectId: 'chivalrous.protection', factorDelta: 0.06, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'chivalrous.principledReconciliation', factorDelta: -0.05, tendencyDelta: -0.06 },
    parity: [
      { mode: 'vote', when: { kind: 'civic', activity: 'mercy' }, effectId: 'chivalrous.restraintVote', vote: 'restraint' },
    ],
  },
  resourceful: {
    benefit: { when: { kind: 'work', job: 'builder', action: 'construction' }, effectId: 'resourceful.improvisation', factorDelta: 0.06, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'school', activity: 'learning' }, effectId: 'resourceful.resistsStructure', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  stoic: {
    benefit: { when: { kind: 'family', activity: 'bereavement' }, effectId: 'stoic.composure', factorDelta: 0.06, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'stoic.restrainedOutreach', factorDelta: -0.04, tendencyDelta: -0.08 },
    parity: [
      { mode: 'value', when: { kind: 'family', activity: 'bereavement' }, effectId: 'stoic.shorterMourning', value: 5 },
    ],
  },
  graceful: {
    benefit: { when: { kind: 'social', activity: 'courtship' }, effectId: 'graceful.socialTact', factorDelta: 0.05, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'physiology', activity: 'labor' }, effectId: 'graceful.heavyLabor', factorDelta: -0.05, tendencyDelta: -0.05 },
    parity: [
      { mode: 'multiplier', when: { kind: 'social', activity: 'courtship' }, effectId: 'graceful.courtshipPoise', multiplier: 1.2 },
    ],
  },
  intuitive: {
    benefit: { when: { kind: 'social', activity: 'friendship' }, effectId: 'intuitive.socialCues', factorDelta: 0.05, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'social', activity: 'conflict' }, effectId: 'intuitive.misreadsSignals', factorDelta: -0.04, tendencyDelta: -0.06 },
    parity: [
      { mode: 'value', when: { kind: 'social', activity: 'banter' }, effectId: 'intuitive.readsTheRoom', value: 0.11 },
    ],
  },
  fierce: {
    benefit: { when: { kind: 'danger', activity: 'defense' }, effectId: 'fierce.resolve', factorDelta: 0.07, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'fierce.slowToForgive', factorDelta: -0.06, tendencyDelta: -0.10 },
    parity: [
      { mode: 'vote', when: { kind: 'civic', activity: 'mercy' }, effectId: 'fierce.severityVote', vote: 'severity' },
    ],
  },
} as const satisfies Record<SettlerTrait, TraitEffects>;

/** Cross-person incompatibility pairs; every shared pair adds one social clash. */
export const TRAIT_OPPOSITIONS: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = [
  ['brave', 'timid'],
  ['gregarious', 'timid'],
  ['gregarious', 'stoic'],
  ['fierce', 'stoic'],
  ['chivalrous', 'fierce'],
];
