/**
 * Settler traits — assignment, inheritance, and modifier helpers.
 *
 * The feature: each settler gets 1–2 personality traits at creation (children
 * inherit a chance of each parent trait, DNA-style), shown in the inspector
 * and feeding subtle behavioral multipliers (energy, hunting, courtship,
 * conception, research, child maturation).
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import {
  rollSettlerTraits,
  inheritSettlerTraits,
  TRAIT_DEFS,
  traitMultiplier,
  hasTrait,
} from '../src/game/settlerTraits';

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

  it('women draw nurturing/insightful more often than men (soft bias)', () => {
    let femaleNurturing = 0;
    let maleNurturing = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      if (rollSettlerTraits([], 'female').includes('nurturing')) femaleNurturing++;
      if (rollSettlerTraits([], 'male').includes('nurturing')) maleNurturing++;
    }
    // The bias is soft (1.6×) — women should clearly lead, men still can roll it.
    expect(femaleNurturing).toBeGreaterThan(maleNurturing);
    expect(maleNurturing).toBeGreaterThan(0);
  });

  it('men draw hardy/brave more often than women (soft bias)', () => {
    let femaleHardy = 0;
    let maleHardy = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      if (rollSettlerTraits([], 'female').includes('hardy')) femaleHardy++;
      if (rollSettlerTraits([], 'male').includes('hardy')) maleHardy++;
    }
    expect(maleHardy).toBeGreaterThan(femaleHardy);
    expect(femaleHardy).toBeGreaterThan(0);
  });
});

describe('inheritSettlerTraits (DNA-like)', () => {
  it('can pass a parent trait to the child (chance, not guaranteed)', () => {
    const mother = createEntity(EntityType.Human, 0, 0, 101, 100, false, {
      gender: 'female',
      inheritedTraits: ['nurturing'],
    });
    const father = createEntity(EntityType.Human, 0, 0, 102, 100, false, {
      gender: 'male',
      inheritedTraits: [],
    });
    let inheritedNurturing = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const childTraits = inheritSettlerTraits(mother, father);
      if (childTraits.includes('nurturing')) inheritedNurturing++;
    }
    // ~50% chance each roll — must sometimes inherit, sometimes not.
    expect(inheritedNurturing).toBeGreaterThan(0);
    expect(inheritedNurturing).toBeLessThan(N);
  });

  it('never exceeds the inherited cap of 2 traits', () => {
    const mother = createEntity(EntityType.Human, 0, 0, 201, 100, false, {
      gender: 'female',
      inheritedTraits: ['nurturing', 'lucky'],
    });
    const father = createEntity(EntityType.Human, 0, 0, 202, 100, false, {
      gender: 'male',
      inheritedTraits: ['hardy', 'brave'],
    });
    for (let i = 0; i < 200; i++) {
      const inherited = inheritSettlerTraits(mother, father);
      expect(inherited.length).toBeLessThanOrEqual(2);
    }
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
    // Force plain to carry no traits so the multiplier check is deterministic.
    plain.traits = [];
    expect(traitMultiplier(brave, 'brave', 1.25)).toBe(1.25);
    expect(traitMultiplier(plain, 'brave', 1.25)).toBe(1);
    expect(hasTrait(brave, 'brave')).toBe(true);
    expect(hasTrait(plain, 'brave')).toBe(false);
  });
});
