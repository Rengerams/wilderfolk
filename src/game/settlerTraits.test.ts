/**
 * Settler traits — assignment, inheritance, and modifier helpers.
 *
 * The feature: each settler gets 1–2 personality traits at creation (children
 * inherit one from a parent), shown in the inspector and feeding subtle
 * behavioral multipliers (energy, hunting, courtship, conception).
 */
import { describe, it, expect } from 'vitest';
import { initGame } from './worldGen';
import { createEntity } from './entityFactory';
import { EntityType } from './gameTypes';
import { rollSettlerTraits, TRAIT_DEFS, traitMultiplier, hasTrait } from './settlerTraits';

describe('rollSettlerTraits', () => {
  it('assigns 2 traits to a fresh settler', () => {
    const traits = rollSettlerTraits();
    expect(traits).toHaveLength(2);
    for (const t of traits) {
      expect(TRAIT_DEFS[t]).toBeDefined();
    }
  });

  it('never assigns mutually exclusive opposites', () => {
    // brave and timid are opposites — brave must never pair with timid.
    for (let i = 0; i < 200; i++) {
      const traits = rollSettlerTraits(['brave']);
      expect(traits.includes('timid')).toBe(false);
    }
  });

  it('keeps inherited traits and fills the rest', () => {
    const traits = rollSettlerTraits(['lucky']);
    expect(traits[0]).toBe('lucky');
    expect(traits).toHaveLength(2);
  });
});

describe('createEntity traits', () => {
  it('gives settlers traits at creation', () => {
    const entity = createEntity(EntityType.Human, 0, 0, 1, 100, false, { gender: 'male' });
    expect(entity.traits?.length).toBe(2);
  });

  it('does not give traits to non-humans', () => {
    const rabbit = createEntity(EntityType.Rabbit, 0, 0, 2, 100);
    expect(rabbit.traits).toBeUndefined();
  });

  it('survives the full game init (worldGen path)', () => {
    const state = initGame();
    const settlers = state.entities.filter(
      (e) => e.type === EntityType.Human && e.alive,
    );
    expect(settlers.length).toBeGreaterThan(0);
    for (const s of settlers) {
      expect(s.traits?.length).toBe(2);
    }
  });
});

describe('traitMultiplier', () => {
  it('applies the modifier only when the trait is present', () => {
    const brave = createEntity(EntityType.Human, 0, 0, 3, 100, false, {
      gender: 'male',
      inheritedTraits: ['brave'],
    });
    const plain = createEntity(EntityType.Human, 0, 0, 4, 100, false, {
      gender: 'male',
      inheritedTraits: [],
    });
    expect(traitMultiplier(brave, 'brave', 1.25)).toBe(1.25);
    expect(traitMultiplier(plain, 'brave', 1.25)).toBe(1);
    expect(hasTrait(brave, 'brave')).toBe(true);
    expect(hasTrait(plain, 'brave')).toBe(false);
  });
});
