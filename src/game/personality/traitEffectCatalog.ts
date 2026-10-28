import type { JobType, SettlerTrait } from '../gameTypes';

// These are decision contexts, not additional schedules or persisted state.
export type TraitContext =
  | { readonly kind: 'work'; readonly job: JobType; readonly action: 'production' | 'construction' | 'training' }
  | { readonly kind: 'school'; readonly activity: 'learning' | 'teaching' | 'research' }
  | { readonly kind: 'physiology'; readonly activity: 'labor' | 'cold' | 'recovery' }
  | { readonly kind: 'danger'; readonly activity: 'hunting' | 'pursuit' | 'defense' | 'escape' }
  | { readonly kind: 'social'; readonly activity: 'friendship' | 'conflict' | 'courtship' | 'reconciliation' | 'workplaceBanter'; readonly exact?: true; readonly other?: { readonly traits?: readonly SettlerTrait[] | null } }
  | { readonly kind: 'family'; readonly activity: 'care' | 'parenting' | 'bereavement' | 'conception'; readonly exact?: true }
  | { readonly kind: 'romance'; readonly activity: 'attachment' | 'affair_approach' | 'remorse' }
  | { readonly kind: 'leisure'; readonly activity: 'company' | 'solitude' | 'community' }
  | { readonly kind: 'civic'; readonly activity: 'leadership' | 'negotiation' | 'mercy'; readonly exact?: true };

export interface TraitEffect {
  readonly when: TraitContext;
  readonly effectId: string;
  readonly factorDelta: number;
  readonly tendencyDelta: number;
}

/** Exact original gameplay values, owned by the same catalog as bounded effects. */
export type LegacyExactEffect =
  | { readonly decision: 'courtship'; readonly effectId: string; readonly position: 0 | 1 | 2; readonly multiplier: number }
  | { readonly decision: 'conception'; readonly effectId: string; readonly multiplier: number }
  | { readonly decision: 'workplaceBanter'; readonly effectId: string; readonly chance: number }
  | { readonly decision: 'bereavement'; readonly effectId: string; readonly days: number }
  | { readonly decision: 'mercy'; readonly effectId: string; readonly voice: 'restraint' | 'severity' }
  | { readonly decision: 'conflict'; readonly effectId: string; readonly other: SettlerTrait };

export interface TraitEffects {
  readonly benefit: TraitEffect;
  readonly drawback: TraitEffect;
  /** Ordinary bounded context-specific effects. */
  readonly also?: readonly TraitEffect[];
  /** Existing exact social/family/civic values (PR C parity, not new bonuses). */
  readonly legacyExact?: readonly LegacyExactEffect[];
}

// A factor delta changes effectiveness; a tendency delta changes willingness.
export const TRAIT_EFFECTS = {
  hardy: {
    benefit: { when: { kind: 'physiology', activity: 'labor' }, effectId: 'hardy.endurance', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'physiology', activity: 'recovery' }, effectId: 'hardy.restReluctance', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  brave: {
    legacyExact: [{ decision: 'conflict', effectId: 'brave.timidClash', other: 'timid' }],
    benefit: { when: { kind: 'danger', activity: 'hunting' }, effectId: 'brave.huntingResolve', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'danger', activity: 'escape' }, effectId: 'brave.lateRetreat', factorDelta: -0.05, tendencyDelta: -0.08 },
    also: [
      { when: { kind: 'danger', activity: 'pursuit' }, effectId: 'brave.relentlessPursuit', factorDelta: 0.05, tendencyDelta: 0.06 },
    ],
  },
  gregarious: {
    legacyExact: [
      { decision: 'courtship', effectId: 'gregarious.courtshipProgress', position: 0, multiplier: 1.4 },
      { decision: 'conflict', effectId: 'gregarious.timidClash', other: 'timid' },
      { decision: 'conflict', effectId: 'gregarious.stoicClash', other: 'stoic' },
    ],
    benefit: { when: { kind: 'social', activity: 'friendship' }, effectId: 'gregarious.bonding', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'leisure', activity: 'solitude' }, effectId: 'gregarious.dislikesSolitude', factorDelta: -0.04, tendencyDelta: -0.10 },
  },
  timid: {
    legacyExact: [{ decision: 'courtship', effectId: 'timid.courtshipProgress', position: 1, multiplier: 0.7 }],
    benefit: { when: { kind: 'danger', activity: 'escape' }, effectId: 'timid.earlyRetreat', factorDelta: 0.07, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'courtship' }, effectId: 'timid.hesitation', factorDelta: -0.05, tendencyDelta: -0.09 },
  },
  greenthumb: {
    benefit: { when: { kind: 'work', job: 'farmer', action: 'production' }, effectId: 'greenthumb.cropCare', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'work', job: 'blacksmith', action: 'training' }, effectId: 'greenthumb.indoorTrade', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  lucky: {
    legacyExact: [{ decision: 'conception', effectId: 'lucky.conceptionChance', multiplier: 1.15 }],
    benefit: { when: { kind: 'danger', activity: 'hunting' }, effectId: 'lucky.huntOpportunity', factorDelta: 0.04, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'danger', activity: 'escape' }, effectId: 'lucky.overconfidence', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  nurturing: {
    legacyExact: [{ decision: 'mercy', effectId: 'nurturing.restraintVoice', voice: 'restraint' }],
    benefit: { when: { kind: 'family', activity: 'care' }, effectId: 'nurturing.care', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'family', activity: 'bereavement' }, effectId: 'nurturing.deeperGrief', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  insightful: {
    benefit: { when: { kind: 'school', activity: 'research' }, effectId: 'insightful.research', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'social', activity: 'conflict' }, effectId: 'insightful.rumination', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  chivalrous: {
    legacyExact: [
      { decision: 'mercy', effectId: 'chivalrous.restraintVoice', voice: 'restraint' },
      { decision: 'conflict', effectId: 'chivalrous.fierceClash', other: 'fierce' },
    ],
    benefit: { when: { kind: 'danger', activity: 'defense' }, effectId: 'chivalrous.protection', factorDelta: 0.06, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'chivalrous.principledReconciliation', factorDelta: -0.05, tendencyDelta: -0.06 },
  },
  resourceful: {
    benefit: { when: { kind: 'work', job: 'builder', action: 'construction' }, effectId: 'resourceful.improvisation', factorDelta: 0.06, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'school', activity: 'learning' }, effectId: 'resourceful.resistsStructure', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  stoic: {
    legacyExact: [{ decision: 'bereavement', effectId: 'stoic.shorterMourning', days: 5 }],
    benefit: { when: { kind: 'family', activity: 'bereavement' }, effectId: 'stoic.composure', factorDelta: 0.06, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'stoic.restrainedOutreach', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  graceful: {
    legacyExact: [{ decision: 'courtship', effectId: 'graceful.courtshipProgress', position: 2, multiplier: 1.2 }],
    benefit: { when: { kind: 'social', activity: 'courtship' }, effectId: 'graceful.socialTact', factorDelta: 0.05, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'physiology', activity: 'labor' }, effectId: 'graceful.heavyLabor', factorDelta: -0.05, tendencyDelta: -0.05 },
  },
  intuitive: {
    legacyExact: [{ decision: 'workplaceBanter', effectId: 'intuitive.workBanter', chance: 0.11 }],
    benefit: { when: { kind: 'social', activity: 'friendship' }, effectId: 'intuitive.socialCues', factorDelta: 0.05, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'social', activity: 'conflict' }, effectId: 'intuitive.misreadsSignals', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  fierce: {
    legacyExact: [
      { decision: 'mercy', effectId: 'fierce.severityVoice', voice: 'severity' },
      { decision: 'conflict', effectId: 'fierce.stoicClash', other: 'stoic' },
    ],
    benefit: { when: { kind: 'danger', activity: 'defense' }, effectId: 'fierce.resolve', factorDelta: 0.07, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'fierce.slowToForgive', factorDelta: -0.06, tendencyDelta: -0.10 },
  },
} as const satisfies Record<SettlerTrait, TraitEffects>;
