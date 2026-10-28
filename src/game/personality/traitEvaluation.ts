import type { SettlerTrait } from '../gameTypes';
import { TRAIT_EFFECTS, TRAIT_OPPOSITIONS } from './traitEffectCatalog';
import type { TraitContext, TraitEffect, TraitEffects, TraitParityEffect, TraitVote } from './traitEffectCatalog';

export interface TraitSubject {
  readonly traits?: readonly SettlerTrait[] | null;
}

export interface TraitReason {
  readonly trait: SettlerTrait;
  readonly effectId: string;
  readonly direction: 'benefit' | 'drawback';
}

export interface TraitInfluence {
  readonly factor: number;
  readonly tendency: number;
  readonly reasons?: readonly TraitReason[];
}

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

function matchesContext(when: TraitContext, context: TraitContext): boolean {
  if (when.kind !== context.kind) return false;
  if (when.kind === 'work') {
    return context.kind === 'work' && when.job === context.job && when.action === context.action;
  }
  return context.kind !== 'work' && when.activity === context.activity;
}

function parityEffectsOf(trait: unknown): readonly TraitParityEffect[] | undefined {
  if (typeof trait !== 'string' || !Object.prototype.hasOwnProperty.call(TRAIT_EFFECTS, trait)) return undefined;
  const effects: TraitEffects = TRAIT_EFFECTS[trait as SettlerTrait];
  return effects.parity;
}

// Read-only projection: no clocks, random rolls, entity writes or other world state.
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: TraitContext,
  options?: TraitEvaluationOptions,
): TraitInfluence {
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

/** Exact-parity multiplier for one trait in one context; 1 when the trait is absent. */
export function evaluateTraitParityFactor(
  subject: TraitSubject,
  context: TraitContext,
  trait: SettlerTrait,
): number {
  const traits = subject.traits;
  if (!Array.isArray(traits) || traits.length === 0 || !traits.includes(trait)) return 1;
  const parity = parityEffectsOf(trait);
  if (parity === undefined) return 1;
  let factor = 1;
  for (const effect of parity) {
    if (effect.mode !== 'multiplier' || !matchesContext(effect.when, context)) continue;
    factor *= effect.multiplier;
  }
  return factor;
}

/** Exact-parity absolute value for the context; the catalog declares one value per context. */
export function evaluateTraitParityValue(subject: TraitSubject, context: TraitContext): number | undefined {
  const traits = subject.traits;
  if (!Array.isArray(traits) || traits.length === 0) return undefined;
  for (const trait of traits) {
    const parity = parityEffectsOf(trait);
    if (parity === undefined) continue;
    for (const effect of parity) {
      if (effect.mode === 'value' && matchesContext(effect.when, context)) return effect.value;
    }
  }
  return undefined;
}

/** Whether the subject casts the given exact-parity civic vote in the context. */
export function evaluateTraitParityVote(subject: TraitSubject, context: TraitContext, vote: TraitVote): boolean {
  const traits = subject.traits;
  if (!Array.isArray(traits) || traits.length === 0) return false;
  for (const trait of traits) {
    const parity = parityEffectsOf(trait);
    if (parity === undefined) continue;
    for (const effect of parity) {
      if (effect.mode === 'vote' && effect.vote === vote && matchesContext(effect.when, context)) return true;
    }
  }
  return false;
}

/** Number of catalogued opposition pairs shared by two people. */
export function evaluateTraitPairClashes(a: TraitSubject, b: TraitSubject): number {
  const aTraits = a.traits;
  const bTraits = b.traits;
  if (!Array.isArray(aTraits) || !Array.isArray(bTraits) || aTraits.length === 0 || bTraits.length === 0) return 0;
  let clashes = 0;
  for (const [x, y] of TRAIT_OPPOSITIONS) {
    if ((aTraits.includes(x) && bTraits.includes(y)) || (aTraits.includes(y) && bTraits.includes(x))) clashes++;
  }
  return clashes;
}
