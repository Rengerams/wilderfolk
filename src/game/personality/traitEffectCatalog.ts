import type { JobType, SettlerTrait } from '../gameTypes';

// These are decision contexts, not additional schedules or persisted state.
export type TraitContext =
  | { readonly kind: 'work'; readonly job: JobType; readonly action: 'production' | 'construction' | 'training' }
  | { readonly kind: 'school'; readonly activity: 'learning' | 'teaching' | 'research' }
  | { readonly kind: 'physiology'; readonly activity: 'labor' | 'cold' | 'recovery' }
  | { readonly kind: 'danger'; readonly activity: 'hunting' | 'defense' | 'escape' }
  | { readonly kind: 'social'; readonly activity: 'friendship' | 'conflict' | 'courtship' | 'reconciliation' }
  | { readonly kind: 'family'; readonly activity: 'care' | 'parenting' | 'bereavement' }
  | { readonly kind: 'romance'; readonly activity: 'attachment' | 'affair_approach' | 'remorse' }
  | { readonly kind: 'leisure'; readonly activity: 'company' | 'solitude' | 'community' }
  | { readonly kind: 'civic'; readonly activity: 'leadership' | 'negotiation' | 'mercy' };

export interface TraitEffect {
  readonly when: TraitContext;
  readonly effectId: string;
  readonly factorDelta: number;
  readonly tendencyDelta: number;
}

export interface TraitEffects {
  readonly benefit: TraitEffect;
  readonly drawback: TraitEffect;
}

// A factor delta changes effectiveness; a tendency delta changes willingness.
// Existing special bonuses remain with their current owners until integration.
export const TRAIT_EFFECTS = {
  hardy: {
    benefit: { when: { kind: 'physiology', activity: 'labor' }, effectId: 'hardy.endurance', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'physiology', activity: 'recovery' }, effectId: 'hardy.restReluctance', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  brave: {
    benefit: { when: { kind: 'danger', activity: 'hunting' }, effectId: 'brave.huntingResolve', factorDelta: 0.05, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'danger', activity: 'escape' }, effectId: 'brave.lateRetreat', factorDelta: -0.05, tendencyDelta: -0.08 },
  },
  gregarious: {
    benefit: { when: { kind: 'social', activity: 'friendship' }, effectId: 'gregarious.bonding', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'leisure', activity: 'solitude' }, effectId: 'gregarious.dislikesSolitude', factorDelta: -0.04, tendencyDelta: -0.10 },
  },
  timid: {
    benefit: { when: { kind: 'danger', activity: 'escape' }, effectId: 'timid.earlyRetreat', factorDelta: 0.06, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'courtship' }, effectId: 'timid.hesitation', factorDelta: -0.05, tendencyDelta: -0.09 },
  },
  greenthumb: {
    benefit: { when: { kind: 'work', job: 'farmer', action: 'production' }, effectId: 'greenthumb.cropCare', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'work', job: 'blacksmith', action: 'training' }, effectId: 'greenthumb.indoorTrade', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  lucky: {
    benefit: { when: { kind: 'danger', activity: 'hunting' }, effectId: 'lucky.huntOpportunity', factorDelta: 0.04, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'danger', activity: 'escape' }, effectId: 'lucky.overconfidence', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  nurturing: {
    benefit: { when: { kind: 'family', activity: 'care' }, effectId: 'nurturing.care', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'family', activity: 'bereavement' }, effectId: 'nurturing.deeperGrief', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  insightful: {
    benefit: { when: { kind: 'school', activity: 'research' }, effectId: 'insightful.research', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'social', activity: 'conflict' }, effectId: 'insightful.rumination', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  chivalrous: {
    benefit: { when: { kind: 'danger', activity: 'defense' }, effectId: 'chivalrous.protection', factorDelta: 0.06, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'chivalrous.principledReconciliation', factorDelta: -0.05, tendencyDelta: -0.06 },
  },
  resourceful: {
    benefit: { when: { kind: 'work', job: 'builder', action: 'construction' }, effectId: 'resourceful.improvisation', factorDelta: 0.06, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'school', activity: 'learning' }, effectId: 'resourceful.resistsStructure', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  stoic: {
    benefit: { when: { kind: 'family', activity: 'bereavement' }, effectId: 'stoic.composure', factorDelta: 0.06, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'stoic.restrainedOutreach', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  graceful: {
    benefit: { when: { kind: 'social', activity: 'courtship' }, effectId: 'graceful.socialTact', factorDelta: 0.05, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'physiology', activity: 'labor' }, effectId: 'graceful.heavyLabor', factorDelta: -0.05, tendencyDelta: -0.05 },
  },
  intuitive: {
    benefit: { when: { kind: 'social', activity: 'friendship' }, effectId: 'intuitive.socialCues', factorDelta: 0.05, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'social', activity: 'conflict' }, effectId: 'intuitive.misreadsSignals', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  fierce: {
    benefit: { when: { kind: 'danger', activity: 'defense' }, effectId: 'fierce.resolve', factorDelta: 0.07, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'fierce.slowToForgive', factorDelta: -0.06, tendencyDelta: -0.10 },
  },
} as const satisfies Record<SettlerTrait, TraitEffects>;
