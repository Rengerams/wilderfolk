import type { SettlerTrait } from '../gameTypes';
import { TRAIT_EFFECTS } from './traitEffectCatalog';
import type { TraitContext } from './traitEffectCatalog';

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

  for (let i = 0; i < traits.length && i < MAX_TRAITS; i++) {
    const trait = traits[i] as SettlerTrait;
    if ((i > 0 && traits[0] === trait) || (i > 1 && traits[1] === trait)) continue;
    if (typeof trait !== 'string' || !Object.prototype.hasOwnProperty.call(TRAIT_EFFECTS, trait)) continue;

    const effects = TRAIT_EFFECTS[trait];
    for (let j = 0; j < 2; j++) {
      const effect = j === 0 ? effects.benefit : effects.drawback;
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
          direction: j === 0 ? 'benefit' : 'drawback',
        }));
      }
    }
  }

  if (positiveFactor === 0 && negativeFactor === 0 &&
      positiveTendency === 0 && negativeTendency === 0) {
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
