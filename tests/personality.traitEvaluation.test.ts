import { describe, expect, it } from 'vitest';
import type { SettlerTrait } from '../src/game/settlerTraits';
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

  it('never reads, creates or advances a simulation RNG stream', () => {
    const snapshot = snapshotSimRng();
    evaluateTraitInfluence({ traits: ['lucky', 'brave', 'greenthumb'] }, { kind: 'danger', activity: 'hunting' });
    evaluateTraitInfluence({ traits: ['fierce'] }, defense, { includeReasons: true });
    expect(snapshotSimRng()).toEqual(snapshot);
  });
});
