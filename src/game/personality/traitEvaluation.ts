import type { SettlerTrait } from '../settlerTraits';
import { TRAIT_EFFECTS, TRAIT_OPPOSITIONS } from './traitEffectCatalog';
import type {
  ExactTraitContext,
  OrdinaryTraitContext,
  TraitContext,
  TraitEffect,
  TraitEffects,
  TraitSubject,
} from './traitEffectCatalog';

export interface TraitReason {
  readonly trait: SettlerTrait;
  readonly effectId: string;
  readonly direction: 'benefit' | 'drawback';
}

/** Exact pre-PR-C answer for a discrete decision; never a bounded factor. */
export type ExactTraitDecision =
  | { readonly activity: 'courtshipProgress'; readonly orderedFactors: readonly [number, number, number] }
  | { readonly activity: 'conception'; readonly multiplier: number }
  | { readonly activity: 'workplaceBanter'; readonly chanceOverride?: number }
  | { readonly activity: 'spousalBereavement'; readonly durationDaysOverride?: number }
  | { readonly activity: 'communityReaction'; readonly restraintVoice: 0 | 1; readonly severityVoice: 0 | 1 }
  | { readonly activity: 'feudClash'; readonly clashCount: number };

export interface TraitInfluence {
  readonly factor: number;
  readonly tendency: number;
  readonly exact?: ExactTraitDecision;
  readonly reasons?: readonly TraitReason[];
}

/** The one exact result a discrete context returns. */
export type TraitExactInfluence<Activity extends ExactTraitDecision['activity']> =
  TraitInfluence & { readonly exact: Extract<ExactTraitDecision, { activity: Activity }> };

export interface TraitEvaluationOptions {
  readonly includeReasons?: boolean;
}

const MAX_TRAITS = 3;
const MIN_FACTOR = 0.85;
const MAX_FACTOR = 1.15;
const MIN_TENDENCY = -0.5;
const MAX_TENDENCY = 0.5;
const DIMINISHING_FACTOR = 2;
const EMPTY_REASONS: readonly TraitReason[] = Object.freeze([]);
const NEUTRAL: TraitInfluence = Object.freeze({ factor: 1, tendency: 0 });
const NEUTRAL_EXPLAINED: TraitInfluence = Object.freeze({
  factor: 1,
  tendency: 0,
  reasons: EMPTY_REASONS,
});

interface CourtshipEntry {
  readonly trait: SettlerTrait;
  readonly position: 0 | 1 | 2;
  readonly multiplier: number;
}

interface SingleValueEntry<Value> {
  readonly trait: SettlerTrait;
  readonly value: Value;
}

/** Static catalog projections: built once so hot paths never rescan the catalog. */
const COURTSHIP_ENTRIES: CourtshipEntry[] = [];
const CONCEPTION_ENTRIES: SingleValueEntry<number>[] = [];
const BANTER_ENTRIES: SingleValueEntry<number>[] = [];
const BEREAVEMENT_ENTRIES: SingleValueEntry<number>[] = [];
const RESTRAINT_TRAITS: SettlerTrait[] = [];
const SEVERITY_TRAITS: SettlerTrait[] = [];

for (const trait of Object.keys(TRAIT_EFFECTS) as SettlerTrait[]) {
  const profile: TraitEffects = TRAIT_EFFECTS[trait];
  for (const effect of profile.legacyExact ?? []) {
    if (effect.activity === 'courtshipProgress') {
      COURTSHIP_ENTRIES.push({ trait, position: effect.position, multiplier: effect.multiplier });
    } else if (effect.activity === 'conception') {
      CONCEPTION_ENTRIES.push({ trait, value: effect.multiplier });
    } else if (effect.activity === 'workplaceBanter') {
      BANTER_ENTRIES.push({ trait, value: effect.chance });
    } else if (effect.activity === 'spousalBereavement') {
      BEREAVEMENT_ENTRIES.push({ trait, value: effect.durationDays });
    } else if (effect.activity === 'communityReaction') {
      (effect.voice === 'restraint' ? RESTRAINT_TRAITS : SEVERITY_TRAITS).push(trait);
    }
  }
}

function traitsOf(subject: TraitSubject | null | undefined): readonly SettlerTrait[] | undefined {
  const traits = subject?.traits;
  return Array.isArray(traits) ? traits : undefined;
}

function hasAny(traits: readonly SettlerTrait[] | undefined, candidates: readonly SettlerTrait[]): boolean {
  if (traits === undefined) return false;
  for (const candidate of candidates) {
    if (traits.includes(candidate)) return true;
  }
  return false;
}

function firstValue<Value>(
  traits: readonly SettlerTrait[] | undefined,
  entries: readonly SingleValueEntry<Value>[],
): Value | undefined {
  if (traits === undefined) return undefined;
  for (const entry of entries) {
    if (traits.includes(entry.trait)) return entry.value;
  }
  return undefined;
}

function feudClashCount(traits: readonly SettlerTrait[] | undefined, other: TraitSubject): number {
  const otherTraits = traitsOf(other);
  if (traits === undefined || otherTraits === undefined || traits.length === 0 || otherTraits.length === 0) return 0;
  let clashes = 0;
  for (const [left, right] of TRAIT_OPPOSITIONS) {
    if ((traits.includes(left) && otherTraits.includes(right))
      || (traits.includes(right) && otherTraits.includes(left))) {
      clashes++;
    }
  }
  return clashes;
}

function exactDecision(
  traits: readonly SettlerTrait[] | undefined,
  context: Exclude<ExactTraitContext, { activity: 'feudClash' }>,
): ExactTraitDecision {
  if (context.activity === 'courtshipProgress') {
    const orderedFactors: [number, number, number] = [1, 1, 1];
    if (traits !== undefined) {
      for (const entry of COURTSHIP_ENTRIES) {
        if (traits.includes(entry.trait)) orderedFactors[entry.position] *= entry.multiplier;
      }
    }
    return { activity: 'courtshipProgress', orderedFactors };
  }
  if (context.activity === 'conception') {
    let multiplier = 1;
    if (traits !== undefined) {
      for (const entry of CONCEPTION_ENTRIES) {
        if (traits.includes(entry.trait)) multiplier *= entry.value;
      }
    }
    return { activity: 'conception', multiplier };
  }
  if (context.activity === 'workplaceBanter') {
    return { activity: 'workplaceBanter', chanceOverride: firstValue(traits, BANTER_ENTRIES) };
  }
  if (context.activity === 'spousalBereavement') {
    return { activity: 'spousalBereavement', durationDaysOverride: firstValue(traits, BEREAVEMENT_ENTRIES) };
  }
  return {
    activity: 'communityReaction',
    restraintVoice: hasAny(traits, RESTRAINT_TRAITS) ? 1 : 0,
    severityVoice: hasAny(traits, SEVERITY_TRAITS) ? 1 : 0,
  };
}

function isExactContext(context: TraitContext): context is ExactTraitContext {
  if (context.kind === 'social') {
    return context.activity === 'courtshipProgress'
      || context.activity === 'workplaceBanter'
      || context.activity === 'feudClash';
  }
  if (context.kind === 'family') return context.activity === 'conception' || context.activity === 'spousalBereavement';
  return context.kind === 'civic' && context.activity === 'communityReaction';
}

function matchesContext(when: OrdinaryTraitContext, context: OrdinaryTraitContext): boolean {
  if (when.kind !== context.kind) return false;
  if (when.kind === 'work') {
    return context.kind === 'work' && when.job === context.job && when.action === context.action;
  }
  return context.kind !== 'work' && when.activity === context.activity;
}

export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: { readonly kind: 'social'; readonly activity: 'courtshipProgress' },
  options?: TraitEvaluationOptions,
): TraitExactInfluence<'courtshipProgress'>;
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: { readonly kind: 'social'; readonly activity: 'workplaceBanter' },
  options?: TraitEvaluationOptions,
): TraitExactInfluence<'workplaceBanter'>;
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: { readonly kind: 'social'; readonly activity: 'feudClash'; readonly other: TraitSubject },
  options?: TraitEvaluationOptions,
): TraitExactInfluence<'feudClash'>;
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: { readonly kind: 'family'; readonly activity: 'conception' },
  options?: TraitEvaluationOptions,
): TraitExactInfluence<'conception'>;
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: { readonly kind: 'family'; readonly activity: 'spousalBereavement' },
  options?: TraitEvaluationOptions,
): TraitExactInfluence<'spousalBereavement'>;
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: { readonly kind: 'civic'; readonly activity: 'communityReaction' },
  options?: TraitEvaluationOptions,
): TraitExactInfluence<'communityReaction'>;
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: OrdinaryTraitContext,
  options?: TraitEvaluationOptions,
): TraitInfluence;
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: TraitContext,
  options?: TraitEvaluationOptions,
): TraitInfluence;
// Read-only projection: no clocks, random rolls, entity writes or other world state.
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: TraitContext,
  options?: TraitEvaluationOptions,
): TraitInfluence {
  if (isExactContext(context)) {
    const traits = traitsOf(subject);
    if (context.activity === 'feudClash') {
      return Object.freeze({
        factor: 1,
        tendency: 0,
        exact: Object.freeze({ activity: 'feudClash' as const, clashCount: feudClashCount(traits, context.other) }),
      });
    }
    return Object.freeze({ factor: 1, tendency: 0, exact: Object.freeze(exactDecision(traits, context)) });
  }

  const explain = options?.includeReasons === true;
  const traits = subject.traits;
  if (!Array.isArray(traits) || traits.length === 0) {
    return explain ? NEUTRAL_EXPLAINED : NEUTRAL;
  }

  let positiveFactor = 0;
  let negativeFactor = 0;
  let positiveTendency = 0;
  let negativeTendency = 0;
  const reasons: TraitReason[] | undefined = explain ? [] : undefined;

  // Canonical order makes floating-point accumulation independent of DNA slot order.
  let first: unknown = traits[0];
  let second: unknown = traits[1];
  let third: unknown = traits[2];
  if (typeof second === 'string' && (typeof first !== 'string' || second < first)) {
    const previous = first;
    first = second;
    second = previous;
  }
  if (typeof third === 'string' && (typeof first !== 'string' || third < first)) {
    const previous = first;
    first = third;
    third = previous;
  }
  if (typeof third === 'string' && (typeof second !== 'string' || third < second)) {
    const previous = second;
    second = third;
    third = previous;
  }

  for (let i = 0; i < traits.length && i < MAX_TRAITS; i++) {
    const candidate = i === 0 ? first : i === 1 ? second : third;
    if (typeof candidate !== 'string' || !Object.prototype.hasOwnProperty.call(TRAIT_EFFECTS, candidate)) continue;
    if ((i > 0 && first === candidate) || (i > 1 && second === candidate)) continue;
    const trait = candidate as SettlerTrait;

    const effects: TraitEffects = TRAIT_EFFECTS[trait];
    const extra = effects.also;
    const effectCount = extra === undefined ? 2 : 2 + extra.length;
    for (let j = 0; j < effectCount; j++) {
      let effect: TraitEffect = effects.benefit;
      if (j === 1) effect = effects.drawback;
      else if (j > 1) {
        const additional = extra?.[j - 2];
        if (additional === undefined) continue;
        effect = additional;
      }
      if (!matchesContext(effect.when, context)) continue;

      if (effect.factorDelta > 0) positiveFactor += effect.factorDelta;
      else negativeFactor -= effect.factorDelta;
      if (effect.tendencyDelta > 0) positiveTendency += effect.tendencyDelta;
      else negativeTendency -= effect.tendencyDelta;
      if (reasons) {
        reasons.push(Object.freeze({
          trait,
          effectId: effect.effectId,
          direction: j === 0 ? 'benefit' : j === 1 ? 'drawback' : effect.tendencyDelta >= 0 ? 'benefit' : 'drawback',
        }));
      }
    }
  }

  if (positiveFactor === 0 && negativeFactor === 0 && positiveTendency === 0 && negativeTendency === 0) {
    return explain ? NEUTRAL_EXPLAINED : NEUTRAL;
  }

  const factorDelta = positiveFactor / (1 + DIMINISHING_FACTOR * positiveFactor)
    - negativeFactor / (1 + DIMINISHING_FACTOR * negativeFactor);
  const tendencyDelta = positiveTendency / (1 + positiveTendency)
    - negativeTendency / (1 + negativeTendency);
  const factor = Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, 1 + factorDelta));
  const tendency = Math.max(MIN_TENDENCY, Math.min(MAX_TENDENCY, tendencyDelta));

  return reasons
    ? Object.freeze({ factor, tendency, reasons: Object.freeze(reasons) })
    : Object.freeze({ factor, tendency });
}
