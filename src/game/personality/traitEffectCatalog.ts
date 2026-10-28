import type { JobType } from '../gameTypes';
import type { SettlerTrait } from '../settlerTraits';

/** A person as far as DNA rules are concerned: never the whole entity or world state. */
export interface TraitSubject {
  readonly traits?: readonly SettlerTrait[] | null;
}

// These are decision contexts, not additional schedules or persisted state.
export type OrdinaryTraitContext =
  | { readonly kind: 'work'; readonly job: JobType; readonly action: 'production' | 'construction' | 'training' }
  | { readonly kind: 'school'; readonly activity: 'learning' | 'teaching' | 'research' }
  | { readonly kind: 'physiology'; readonly activity: 'labor' | 'cold' | 'recovery' }
  | { readonly kind: 'danger'; readonly activity: 'hunting' | 'pursuit' | 'defense' | 'escape' }
  | { readonly kind: 'social'; readonly activity: 'friendship' | 'conflict' | 'courtship' | 'reconciliation' }
  | { readonly kind: 'family'; readonly activity: 'care' | 'parenting' | 'bereavement' }
  | { readonly kind: 'romance'; readonly activity: 'attachment' | 'affair_approach' | 'remorse' }
  | { readonly kind: 'leisure'; readonly activity: 'company' | 'solitude' | 'community' }
  | { readonly kind: 'civic'; readonly activity: 'leadership' | 'negotiation' | 'mercy' };

/** Discrete pre-PR-C decisions; they answer exactly, never through the bounded factor. */
export type ExactTraitContext =
  | { readonly kind: 'social'; readonly activity: 'courtshipProgress' }
  | { readonly kind: 'social'; readonly activity: 'workplaceBanter' }
  | { readonly kind: 'social'; readonly activity: 'feudClash'; readonly other: TraitSubject }
  | { readonly kind: 'family'; readonly activity: 'conception' }
  | { readonly kind: 'family'; readonly activity: 'spousalBereavement' }
  | { readonly kind: 'civic'; readonly activity: 'communityReaction' };

export type TraitContext = OrdinaryTraitContext | ExactTraitContext;

export interface TraitEffect {
  readonly when: OrdinaryTraitContext;
  readonly effectId: string;
  readonly factorDelta: number;
  readonly tendencyDelta: number;
}

/** Exact pre-PR-C value; the catalog, not an owner, owns the number. */
export type LegacyExactEffect =
  | { readonly activity: 'courtshipProgress'; readonly effectId: string; readonly position: 0 | 1 | 2; readonly multiplier: number }
  | { readonly activity: 'conception'; readonly effectId: string; readonly multiplier: number }
  | { readonly activity: 'workplaceBanter'; readonly effectId: string; readonly chance: number }
  | { readonly activity: 'spousalBereavement'; readonly effectId: string; readonly durationDays: number }
  | { readonly activity: 'communityReaction'; readonly effectId: string; readonly voice: 'restraint' | 'severity' }
  | { readonly activity: 'feudClash'; readonly effectId: string; readonly counterpartTrait: SettlerTrait };

export interface TraitEffects {
  readonly benefit: TraitEffect;
  readonly drawback: TraitEffect;
  /** A further context in which the same trait applies. */
  readonly also?: readonly TraitEffect[];
  /** Exact-parity values, read only by the evaluator's discrete contexts. */
  readonly legacyExact?: readonly LegacyExactEffect[];
}

// A factor delta changes effectiveness; a tendency delta changes willingness.
export const TRAIT_EFFECTS = {
  hardy: {
    benefit: { when: { kind: 'physiology', activity: 'labor' }, effectId: 'hardy.endurance', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'physiology', activity: 'recovery' }, effectId: 'hardy.restReluctance', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  brave: {
    legacyExact: [
      { activity: 'feudClash', effectId: 'brave.timidClash', counterpartTrait: 'timid' },
    ],
    benefit: { when: { kind: 'danger', activity: 'hunting' }, effectId: 'brave.huntingResolve', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'danger', activity: 'escape' }, effectId: 'brave.lateRetreat', factorDelta: -0.05, tendencyDelta: -0.08 },
    also: [
      { when: { kind: 'danger', activity: 'pursuit' }, effectId: 'brave.relentlessPursuit', factorDelta: 0.05, tendencyDelta: 0.06 },
    ],
  },
  gregarious: {
    legacyExact: [
      { activity: 'courtshipProgress', effectId: 'gregarious.courtshipProgress', position: 0, multiplier: 1.4 },
      { activity: 'feudClash', effectId: 'gregarious.timidClash', counterpartTrait: 'timid' },
      { activity: 'feudClash', effectId: 'gregarious.stoicClash', counterpartTrait: 'stoic' },
    ],
    benefit: { when: { kind: 'social', activity: 'friendship' }, effectId: 'gregarious.bonding', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'leisure', activity: 'solitude' }, effectId: 'gregarious.dislikesSolitude', factorDelta: -0.04, tendencyDelta: -0.10 },
  },
  timid: {
    legacyExact: [
      { activity: 'courtshipProgress', effectId: 'timid.courtshipProgress', position: 1, multiplier: 0.7 },
    ],
    benefit: { when: { kind: 'danger', activity: 'escape' }, effectId: 'timid.earlyRetreat', factorDelta: 0.07, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'courtship' }, effectId: 'timid.hesitation', factorDelta: -0.05, tendencyDelta: -0.09 },
  },
  greenthumb: {
    benefit: { when: { kind: 'work', job: 'farmer', action: 'production' }, effectId: 'greenthumb.cropCare', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'work', job: 'blacksmith', action: 'training' }, effectId: 'greenthumb.indoorTrade', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  lucky: {
    legacyExact: [
      { activity: 'conception', effectId: 'lucky.conceptionChance', multiplier: 1.15 },
    ],
    benefit: { when: { kind: 'danger', activity: 'hunting' }, effectId: 'lucky.huntOpportunity', factorDelta: 0.04, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'danger', activity: 'escape' }, effectId: 'lucky.overconfidence', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  nurturing: {
    legacyExact: [
      { activity: 'communityReaction', effectId: 'nurturing.restraintVoice', voice: 'restraint' },
    ],
    benefit: { when: { kind: 'family', activity: 'care' }, effectId: 'nurturing.care', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'family', activity: 'bereavement' }, effectId: 'nurturing.deeperGrief', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  insightful: {
    benefit: { when: { kind: 'school', activity: 'research' }, effectId: 'insightful.research', factorDelta: 0.06, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'social', activity: 'conflict' }, effectId: 'insightful.rumination', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  chivalrous: {
    legacyExact: [
      { activity: 'communityReaction', effectId: 'chivalrous.restraintVoice', voice: 'restraint' },
      { activity: 'feudClash', effectId: 'chivalrous.fierceClash', counterpartTrait: 'fierce' },
    ],
    benefit: { when: { kind: 'danger', activity: 'defense' }, effectId: 'chivalrous.protection', factorDelta: 0.06, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'chivalrous.principledReconciliation', factorDelta: -0.05, tendencyDelta: -0.06 },
  },
  resourceful: {
    benefit: { when: { kind: 'work', job: 'builder', action: 'construction' }, effectId: 'resourceful.improvisation', factorDelta: 0.06, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'school', activity: 'learning' }, effectId: 'resourceful.resistsStructure', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  stoic: {
    legacyExact: [
      { activity: 'spousalBereavement', effectId: 'stoic.shorterMourning', durationDays: 5 },
    ],
    benefit: { when: { kind: 'family', activity: 'bereavement' }, effectId: 'stoic.composure', factorDelta: 0.06, tendencyDelta: 0.06 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'stoic.restrainedOutreach', factorDelta: -0.04, tendencyDelta: -0.08 },
  },
  graceful: {
    legacyExact: [
      { activity: 'courtshipProgress', effectId: 'graceful.courtshipProgress', position: 2, multiplier: 1.2 },
    ],
    benefit: { when: { kind: 'social', activity: 'courtship' }, effectId: 'graceful.socialTact', factorDelta: 0.05, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'physiology', activity: 'labor' }, effectId: 'graceful.heavyLabor', factorDelta: -0.05, tendencyDelta: -0.05 },
  },
  intuitive: {
    legacyExact: [
      { activity: 'workplaceBanter', effectId: 'intuitive.readsTheRoom', chance: 0.11 },
    ],
    benefit: { when: { kind: 'social', activity: 'friendship' }, effectId: 'intuitive.socialCues', factorDelta: 0.05, tendencyDelta: 0.08 },
    drawback: { when: { kind: 'social', activity: 'conflict' }, effectId: 'intuitive.misreadsSignals', factorDelta: -0.04, tendencyDelta: -0.06 },
  },
  fierce: {
    legacyExact: [
      { activity: 'communityReaction', effectId: 'fierce.severityVoice', voice: 'severity' },
      { activity: 'feudClash', effectId: 'fierce.stoicClash', counterpartTrait: 'stoic' },
    ],
    benefit: { when: { kind: 'danger', activity: 'defense' }, effectId: 'fierce.resolve', factorDelta: 0.07, tendencyDelta: 0.10 },
    drawback: { when: { kind: 'social', activity: 'reconciliation' }, effectId: 'fierce.slowToForgive', factorDelta: -0.06, tendencyDelta: -0.10 },
  },
} as const satisfies Record<SettlerTrait, TraitEffects>;

/** The five cross-person clash links, each stored once in the trait records above. */
export const TRAIT_OPPOSITIONS: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = (() => {
  const pairs: Array<readonly [SettlerTrait, SettlerTrait]> = [];
  for (const trait of Object.keys(TRAIT_EFFECTS) as SettlerTrait[]) {
    const profile: TraitEffects = TRAIT_EFFECTS[trait];
    for (const effect of profile.legacyExact ?? []) {
      if (effect.activity === 'feudClash') pairs.push(Object.freeze([trait, effect.counterpartTrait] as const));
    }
  }
  return Object.freeze(pairs);
})();
