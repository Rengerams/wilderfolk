import { describe, expect, it } from 'vitest';
import { TRAIT_POOL } from '../src/game/settlerTraits';
import { TRAIT_EFFECTS } from '../src/game/personality/traitEffectCatalog';
import type { OrdinaryTraitContext, TraitEffect, TraitEffects } from '../src/game/personality/traitEffectCatalog';
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

  it('keeps one typed exact family for the six pre-PR-C decisions', () => {
    const courtship: Array<{ trait: string; position: number; multiplier: number }> = [];
    const clashes: string[] = [];
    const restraint: string[] = [];
    const severity: string[] = [];
    const exactIds = new Set<string>();
    for (const trait of TRAIT_POOL) {
      const profile: TraitEffects = TRAIT_EFFECTS[trait];
      for (const effect of profile.legacyExact ?? []) {
        expect(effect.effectId).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
        expect(exactIds.has(effect.effectId), effect.effectId).toBe(false);
        exactIds.add(effect.effectId);
        if (effect.activity === 'courtshipProgress') {
          courtship.push({ trait, position: effect.position, multiplier: effect.multiplier });
        } else if (effect.activity === 'feudClash') {
          clashes.push(`${trait}/${effect.counterpartTrait}`);
        } else if (effect.activity === 'communityReaction') {
          (effect.voice === 'restraint' ? restraint : severity).push(trait);
        } else if (effect.activity === 'conception') {
          expect(trait).toBe('lucky');
          expect(effect.multiplier).toBe(1.15);
        } else if (effect.activity === 'workplaceBanter') {
          expect(trait).toBe('intuitive');
          expect(effect.chance).toBe(0.11);
        } else {
          expect(trait).toBe('stoic');
          expect(effect.durationDays).toBe(5);
        }
      }
    }
    expect(courtship.sort((a, b) => a.position - b.position))
      .toEqual([
        { trait: 'gregarious', position: 0, multiplier: 1.4 },
        { trait: 'timid', position: 1, multiplier: 0.7 },
        { trait: 'graceful', position: 2, multiplier: 1.2 },
      ]);
    expect(clashes.sort()).toEqual([
      'brave/timid',
      'chivalrous/fierce',
      'fierce/stoic',
      'gregarious/stoic',
      'gregarious/timid',
    ]);
    expect(restraint.sort()).toEqual(['chivalrous', 'nurturing']);
    expect(severity).toEqual(['fierce']);
  });

  it('does not let an exact activity double-apply an ordinary bounded effect', () => {
    const activityOf = (context: OrdinaryTraitContext): string => ('activity' in context ? context.activity : '');
    for (const trait of TRAIT_POOL) {
      const profile: TraitEffects = TRAIT_EFFECTS[trait];
      const ordinary = [
        profile.benefit.when,
        profile.drawback.when,
        ...(profile.also ?? []).map((entry) => entry.when),
      ].map((when) => `${when.kind}/${activityOf(when)}`);
      for (const effect of profile.legacyExact ?? []) {
        expect(ordinary.some((key) => key.endsWith(`/${effect.activity}`))).toBe(false);
      }
    }
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
