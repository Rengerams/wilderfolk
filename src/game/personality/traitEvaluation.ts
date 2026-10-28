import type { SettlerTrait } from '../gameTypes';
import { TRAIT_EFFECTS } from './traitEffectCatalog';
import type { TraitContext, TraitEffect, TraitEffects } from './traitEffectCatalog';

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
  readonly courtshipFactors?: readonly [number, number, number];
  readonly banterChance?: number;
  readonly griefDays?: number;
  readonly restraintVoice?: 0 | 1;
  readonly severityVoice?: 0 | 1;
  readonly clashCount?: number;
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

/** Static catalog projection: never rebuild cross-person pairs during social passes. */
const CROSS_PERSON_CLASHES: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> =
  (Object.keys(TRAIT_EFFECTS) as SettlerTrait[]).flatMap((trait) => {
    const profile: TraitEffects = TRAIT_EFFECTS[trait];
    const pairs: Array<readonly [SettlerTrait, SettlerTrait]> = [];
    for (const effect of profile.legacyExact ?? []) {
      if (effect.decision === 'conflict') pairs.push([trait, effect.other]);
    }
    return pairs;
  });

/** Exact legacy context read: pure, no RNG, no extra owner or rebalancing. */
function evaluateExactInfluence(subject: TraitSubject, context: TraitContext): TraitInfluence {
  const traits = Array.isArray(subject.traits) ? subject.traits : [];
  if (context.kind === 'social' && context.activity === 'conflict') {
    const other = Array.isArray(context.other?.traits) ? context.other.traits : [];
    let clashes = 0;
    for (const [left, right] of CROSS_PERSON_CLASHES) {
      if ((traits.includes(left) && other.includes(right)) || (traits.includes(right) && other.includes(left))) {
        clashes++;
      }
    }
    return { factor: 1, tendency: 0, clashCount: clashes };
  }

  let factor = 1;
  let banterChance: number | undefined;
  let griefDays: number | undefined;
  let restraintVoice: 0 | 1 = 0;
  let severityVoice: 0 | 1 = 0;
  let courtship0 = 1;
  let courtship1 = 1;
  let courtship2 = 1;
  for (let i = 0; i < traits.length && i < MAX_TRAITS; i++) {
    const trait = traits[i];
    if (typeof trait !== 'string' || !Object.prototype.hasOwnProperty.call(TRAIT_EFFECTS, trait)) continue;
    if (traits.indexOf(trait) !== i) continue;
    const profile: TraitEffects = TRAIT_EFFECTS[trait as SettlerTrait];
    for (const rule of profile.legacyExact ?? []) {
      if (context.kind === 'social' && context.activity === 'courtship' && rule.decision === 'courtship') {
        if (rule.position === 0) courtship0 = rule.multiplier;
        else if (rule.position === 1) courtship1 = rule.multiplier;
        else courtship2 = rule.multiplier;
      } else if (context.kind === 'family' && context.activity === 'conception' && rule.decision === 'conception') {
        factor *= rule.multiplier;
      } else if (context.kind === 'social' && context.activity === 'workplaceBanter' && rule.decision === 'workplaceBanter') {
        banterChance = rule.chance;
      } else if (context.kind === 'family' && context.activity === 'bereavement' && rule.decision === 'bereavement') {
        griefDays = rule.days;
      } else if (context.kind === 'civic' && context.activity === 'mercy' && rule.decision === 'mercy') {
        if (rule.voice === 'restraint') restraintVoice = 1;
        else severityVoice = 1;
      }
    }
  }

  if (context.kind === 'social' && context.activity === 'courtship') {
    return { factor: 1, tendency: 0, courtshipFactors: [courtship0, courtship1, courtship2] };
  }
  if (context.kind === 'social' && context.activity === 'workplaceBanter') {
    return { factor: 1, tendency: 0, banterChance };
  }
  if (context.kind === 'family' && context.activity === 'bereavement') {
    return { factor: 1, tendency: 0, griefDays };
  }
  if (context.kind === 'civic' && context.activity === 'mercy') {
    return { factor: 1, tendency: 0, restraintVoice, severityVoice };
  }
  return { factor, tendency: 0 };
}

// Read-only projection: no clocks, random rolls, entity writes or other world state.
export function evaluateTraitInfluence(
  subject: TraitSubject,
  context: TraitContext,
  options?: TraitEvaluationOptions,
): TraitInfluence {
  if ('exact' in context && context.exact === true) return evaluateExactInfluence(subject, context);
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
      const when = effect.when;
      if (when.kind !== context.kind) continue;
      if (when.kind === 'work') {
        if (context.kind !== 'work' || when.job !== context.job || when.action !== context.action) continue;
      } else if (context.kind === 'work' || when.activity !== context.activity) {
        continue;
      }

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
