import { describe, expect, it } from 'vitest';
import { TRAIT_POOL } from '../src/game/settlerTraits';
import { TRAIT_EFFECTS } from '../src/game/personality/traitEffectCatalog';
import type { TraitEffect, TraitEffects } from '../src/game/personality/traitEffectCatalog';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';

describe('personality trait effect catalog', () => {
  it('covers exactly the fourteen existing canonical trait IDs', () => {
    expect(Object.keys(TRAIT_EFFECTS).sort()).toEqual([...TRAIT_POOL].sort());
    expect(TRAIT_POOL).toHaveLength(14);
  });

  it('gives each trait a situational benefit, drawback and unique stable reason IDs', () => {
    const ids = new Set<string>();
    for (const trait of TRAIT_POOL) {
      const { benefit, drawback, also }: TraitEffects = TRAIT_EFFECTS[trait];
      expect(benefit.factorDelta >= 0 && benefit.tendencyDelta >= 0).toBe(true);
      expect(drawback.factorDelta <= 0 && drawback.tendencyDelta <= 0).toBe(true);
      expect(benefit.factorDelta + benefit.tendencyDelta).toBeGreaterThan(0);
      expect(drawback.factorDelta + drawback.tendencyDelta).toBeLessThan(0);
      const entries: ReadonlyArray<readonly [TraitEffect, 'benefit' | 'drawback']> = [
        [benefit, 'benefit'],
        [drawback, 'drawback'],
        ...(also ?? []).map((effect): readonly [TraitEffect, 'benefit' | 'drawback'] =>
          [effect, effect.tendencyDelta >= 0 ? 'benefit' : 'drawback']),
      ];
      for (const [effect, direction] of entries) {
        expect(effect.effectId).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
        expect(ids.has(effect.effectId)).toBe(false);
        ids.add(effect.effectId);
        const influence = evaluateTraitInfluence({ traits: [trait] }, effect.when, { includeReasons: true });
        expect(influence.reasons).toEqual([{ trait, effectId: effect.effectId, direction }]);
        expect(influence.factor).toBeGreaterThanOrEqual(0.85);
        expect(influence.factor).toBeLessThanOrEqual(1.15);
        if (direction === 'benefit') {
          expect(influence.factor, effect.effectId).toBeGreaterThan(1);
          expect(influence.tendency, effect.effectId).toBeGreaterThan(0);
        } else {
          expect(influence.factor, effect.effectId).toBeLessThan(1);
          expect(influence.tendency, effect.effectId).toBeLessThan(0);
        }
      }
    }
    expect(ids.size).toBe(29);
  });

  it('prices the migrated danger sites inside the bounded factor', () => {
    for (const [trait, activity] of [
      ['brave', 'hunting'],
      ['brave', 'pursuit'],
      ['timid', 'escape'],
    ] as const) {
      const factor = evaluateTraitInfluence(
        { traits: [trait] },
        { kind: 'danger', activity },
      ).factor;
      expect(factor, `${trait} ${activity}`).toBeGreaterThan(1);
      expect(factor, `${trait} ${activity}`).toBeLessThanOrEqual(1.15);
    }
  });

  it('keeps unrelated traits neutral instead of granting blanket bonuses', () => {
    const subject = { traits: ['fierce', 'greenthumb', 'resourceful'] as const };
    const context = { kind: 'school', activity: 'teaching' } as const;
    expect(evaluateTraitInfluence(subject, context)).toEqual({ factor: 1, tendency: 0 });
  });

  it('matches job and activity rather than granting a universal work bonus', () => {
    const subject = { traits: ['greenthumb'] as const };
    expect(evaluateTraitInfluence(subject, { kind: 'work', job: 'farmer', action: 'production' }).factor)
      .toBeGreaterThan(1);
    expect(evaluateTraitInfluence(subject, { kind: 'work', job: 'farmer', action: 'training' }).factor)
      .toBe(1);
    expect(evaluateTraitInfluence(subject, { kind: 'work', job: 'blacksmith', action: 'training' }).factor)
      .toBeLessThan(1);
  });
});
