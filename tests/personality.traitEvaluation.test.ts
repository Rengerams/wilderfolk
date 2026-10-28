import { describe, expect, it } from 'vitest';
import type { SettlerTrait, TraitContext } from '../src/game/personality/traitEffectCatalog';
import { JobType } from '../src/game/gameTypes';
import { snapshotSimRng } from '../src/game/simRng';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';

describe('pure personality influence evaluation', () => {
  const defense = { kind: 'danger', activity: 'defense' } as const;

  it('handles absent, empty and invalid legacy trait arrays without allocating explanations', () => {
    expect(evaluateTraitInfluence({}, defense)).toEqual({ factor: 1, tendency: 0 });
    expect(evaluateTraitInfluence({ traits: [] }, defense)).toEqual({ factor: 1, tendency: 0 });
    expect(evaluateTraitInfluence({ traits: null }, defense, { includeReasons: true }))
      .toEqual({ factor: 1, tendency: 0, reasons: [] });
    expect(evaluateTraitInfluence({ traits: ['not_a_trait', '__proto__'] as unknown as SettlerTrait[] }, defense))
      .toEqual({ factor: 1, tendency: 0 });
    expect(evaluateTraitInfluence({ traits: ['toString'] as unknown as SettlerTrait[] }, defense))
      .toEqual({ factor: 1, tendency: 0 });
    expect(evaluateTraitInfluence({ traits: ['fierce'] }, defense)).not.toHaveProperty('reasons');
    const unsafe = { toString(): never { throw new Error('invalid DNA must not be coerced'); } };
    const withMalformedElement = { traits: [unsafe, 'fierce', null] as unknown as SettlerTrait[] };
    expect(evaluateTraitInfluence(withMalformedElement, defense)).toEqual(
      evaluateTraitInfluence({ traits: ['fierce'] }, defense),
    );
  });

  it('does not multiply duplicate traits or process beyond the canonical three slots', () => {
    const one = evaluateTraitInfluence({ traits: ['fierce'] }, defense);
    expect(evaluateTraitInfluence({ traits: ['fierce', 'fierce', 'fierce'] }, defense)).toEqual(one);
    expect(evaluateTraitInfluence({ traits: ['fierce', 'fierce', 'fierce', 'chivalrous'] }, defense))
      .toEqual(one);
  });

  it('is order-independent with diminishing returns and bounded factors', () => {
    const first = evaluateTraitInfluence({ traits: ['fierce'] }, defense);
    const second = evaluateTraitInfluence({ traits: ['chivalrous'] }, defense);
    const combined = evaluateTraitInfluence({ traits: ['fierce', 'chivalrous'] }, defense);
    const reversed = evaluateTraitInfluence({ traits: ['chivalrous', 'fierce'] }, defense);
    expect(combined).toEqual(reversed);
    expect(combined.factor).toBeGreaterThan(first.factor);
    expect(combined.factor - 1).toBeLessThan((first.factor - 1) + (second.factor - 1));
    for (const item of [first, second, combined]) {
      expect(Number.isFinite(item.factor)).toBe(true);
      expect(Number.isFinite(item.tendency)).toBe(true);
      expect(item.factor).toBeGreaterThanOrEqual(0.85);
      expect(item.factor).toBeLessThanOrEqual(1.15);
      expect(item.tendency).toBeGreaterThanOrEqual(-0.5);
      expect(item.tendency).toBeLessThanOrEqual(0.5);
    }
  });

  it('handles three-trait trade-offs without amplifying opposite modifiers', () => {
    const context = { kind: 'social', activity: 'reconciliation' } as const;
    const group = { traits: ['stoic', 'chivalrous', 'fierce'] as const };
    const result = evaluateTraitInfluence(group, context);
    expect(Number.isFinite(result.factor)).toBe(true);
    expect(result.factor).toBeGreaterThanOrEqual(0.85);
    expect(result.factor).toBeLessThan(1);
    expect(result.tendency).toBeLessThan(0);
    const permutations = [
      ['stoic', 'fierce', 'chivalrous'],
      ['fierce', 'stoic', 'chivalrous'],
      ['fierce', 'chivalrous', 'stoic'],
      ['chivalrous', 'fierce', 'stoic'],
      ['chivalrous', 'stoic', 'fierce'],
    ] as const;
    for (const traits of permutations) {
      expect(evaluateTraitInfluence({ traits }, context)).toEqual(result);
      expect(evaluateTraitInfluence({ traits }, context, { includeReasons: true })).toEqual(
        evaluateTraitInfluence(group, context, { includeReasons: true }),
      );
    }

    const mixed = evaluateTraitInfluence({ traits: ['hardy', 'graceful'] }, { kind: 'physiology', activity: 'labor' });
    expect(mixed.factor).toBeGreaterThan(0.85);
    expect(mixed.factor).toBeLessThan(1.15);
  });

  it('leaves nested subject and context untouched and freezes opt-in explanations', () => {
    const traits = Object.freeze(['chivalrous', 'fierce'] as const);
    const subject = Object.freeze({ traits });
    const result = evaluateTraitInfluence(subject, Object.freeze(defense), { includeReasons: true });
    expect(result.reasons).toEqual([
      { trait: 'chivalrous', effectId: 'chivalrous.protection', direction: 'benefit' },
      { trait: 'fierce', effectId: 'fierce.resolve', direction: 'benefit' },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.reasons)).toBe(true);
    expect(result.reasons?.every((reason) => Object.isFrozen(reason))).toBe(true);
    expect(subject.traits).toEqual(['chivalrous', 'fierce']);
    expect(evaluateTraitInfluence(subject, defense, { includeReasons: true })).toEqual(result);
  });

  it('answers every discrete context exactly and neutrally without DNA', () => {
    expect(evaluateTraitInfluence({}, { kind: 'social', activity: 'courtshipProgress' }).exact)
      .toEqual({ activity: 'courtshipProgress', orderedFactors: [1, 1, 1] });
    expect(evaluateTraitInfluence({ traits: [] }, { kind: 'family', activity: 'conception' }).exact)
      .toEqual({ activity: 'conception', multiplier: 1 });
    expect(evaluateTraitInfluence({ traits: null }, { kind: 'social', activity: 'workplaceBanter' }).exact)
      .toEqual({ activity: 'workplaceBanter', chanceOverride: undefined });
    expect(evaluateTraitInfluence({}, { kind: 'family', activity: 'spousalBereavement' }).exact)
      .toEqual({ activity: 'spousalBereavement', durationDaysOverride: undefined });
    expect(evaluateTraitInfluence({ traits: [] }, { kind: 'civic', activity: 'communityReaction' }).exact)
      .toEqual({ activity: 'communityReaction', restraintVoice: 0, severityVoice: 0 });
    expect(evaluateTraitInfluence({}, { kind: 'social', activity: 'feudClash', other: {} }).exact)
      .toEqual({ activity: 'feudClash', clashCount: 0 });
    for (const result of [
      evaluateTraitInfluence({}, { kind: 'social', activity: 'courtshipProgress' }),
      evaluateTraitInfluence({}, { kind: 'family', activity: 'conception' }),
      evaluateTraitInfluence({}, { kind: 'civic', activity: 'communityReaction' }),
    ]) {
      expect(result.factor).toBe(1);
      expect(result.tendency).toBe(0);
    }
  });

  it('dispatches one mode only: no bounded factor leaks into an exact context', () => {
    const exact = evaluateTraitInfluence({ traits: ['timid', 'graceful'] }, { kind: 'social', activity: 'courtshipProgress' });
    expect(exact.factor).toBe(1);
    expect(exact.exact).toEqual({ activity: 'courtshipProgress', orderedFactors: [1, 0.7, 1.2] });
    const ordinary = evaluateTraitInfluence({ traits: ['timid'] }, { kind: 'social', activity: 'courtship' });
    expect(ordinary.exact).toBeUndefined();
    expect(ordinary.factor).toBeLessThan(1);
  });

  it('treats malformed exact DNA as neutral instead of throwing', () => {
    const malformed = { traits: ['not_a_trait', null, 'lucky'] as unknown as SettlerTrait[] };
    expect(evaluateTraitInfluence(malformed, { kind: 'family', activity: 'conception' }).exact)
      .toEqual({ activity: 'conception', multiplier: 1.15 });
    expect(evaluateTraitInfluence(malformed, { kind: 'social', activity: 'workplaceBanter' }).exact)
      .toEqual({ activity: 'workplaceBanter', chanceOverride: undefined });
    expect(evaluateTraitInfluence({ traits: ['lucky'] }, { kind: 'social', activity: 'feudClash', other: {} }).exact)
      .toEqual({ activity: 'feudClash', clashCount: 0 });
  });

  it('never reads, creates or advances a simulation RNG stream', () => {
    const snapshot = snapshotSimRng();
    evaluateTraitInfluence({ traits: ['lucky', 'brave', 'greenthumb'] }, { kind: 'danger', activity: 'hunting' });
    evaluateTraitInfluence({ traits: ['fierce'] }, defense, { includeReasons: true });
    evaluateTraitInfluence({ traits: ['lucky', 'gregarious'] }, { kind: 'family', activity: 'conception' });
    evaluateTraitInfluence({ traits: ['brave'] }, { kind: 'social', activity: 'feudClash', other: { traits: ['timid'] } });
    expect(snapshotSimRng()).toEqual(snapshot);
  });

  it('keeps the ordinary PR B contexts bounded while the exact contexts stay discrete', () => {
    const prBContexts: TraitContext[] = [
      { kind: 'work', job: JobType.Builder, action: 'construction' },
      { kind: 'work', job: JobType.Farmer, action: 'production' },
      { kind: 'school', activity: 'research' },
      { kind: 'danger', activity: 'defense' },
      { kind: 'physiology', activity: 'labor' },
      { kind: 'social', activity: 'courtship' },
      { kind: 'family', activity: 'bereavement' },
    ];
    const dna: SettlerTrait[] = ['resourceful', 'chivalrous', 'insightful'];
    for (const context of prBContexts) {
      const influence = evaluateTraitInfluence({ traits: dna }, context);
      expect(influence.factor, JSON.stringify(context)).toBeGreaterThanOrEqual(0.85);
      expect(influence.factor, JSON.stringify(context)).toBeLessThanOrEqual(1.15);
      expect(influence.tendency, JSON.stringify(context)).toBeGreaterThanOrEqual(-0.5);
      expect(influence.tendency, JSON.stringify(context)).toBeLessThanOrEqual(0.5);
      expect(influence.exact, JSON.stringify(context)).toBeUndefined();
    }
    expect(evaluateTraitInfluence({ traits: ['resourceful'] }, prBContexts[0]).factor).toBeGreaterThan(1);
  });
});
