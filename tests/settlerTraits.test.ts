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
  it('assigns 3 traits to a fresh settler', () => {
    const traits = rollSettlerTraits();
    expect(traits).toHaveLength(3);
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
    expect(traits).toHaveLength(3);
  });

  it('women draw female-leaning traits more often than men (soft bias)', () => {
    const FEMALE_SET = ['nurturing', 'insightful', 'gregarious', 'lucky', 'graceful', 'intuitive', 'fierce'];
    let femaleLeaningForWomen = 0;
    let femaleLeaningForMen = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      femaleLeaningForWomen += rollSettlerTraits([], 'female').filter((t) => FEMALE_SET.includes(t)).length;
      femaleLeaningForMen += rollSettlerTraits([], 'male').filter((t) => FEMALE_SET.includes(t)).length;
    }
    expect(femaleLeaningForWomen).toBeGreaterThan(femaleLeaningForMen);
    expect(femaleLeaningForMen).toBeGreaterThan(0);
  });

  it('men draw male-leaning traits more often than women (soft bias)', () => {
    const MALE_SET = ['hardy', 'brave', 'greenthumb', 'chivalrous', 'resourceful', 'stoic'];
    let maleLeaningForMen = 0;
    let maleLeaningForWomen = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      maleLeaningForMen += rollSettlerTraits([], 'male').filter((t) => MALE_SET.includes(t)).length;
      maleLeaningForWomen += rollSettlerTraits([], 'female').filter((t) => MALE_SET.includes(t)).length;
    }
    expect(maleLeaningForMen).toBeGreaterThan(maleLeaningForWomen);
    expect(maleLeaningForWomen).toBeGreaterThan(0);
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

  it('never exceeds the inherited cap of 3 traits', () => {
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
      expect(inherited.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('createEntity traits', () => {
  it('gives settlers traits at creation', () => {
    const entity = createEntity(EntityType.Human, 0, 0, 1, 100, false, { gender: 'male' });
    expect(entity.traits?.length).toBe(3);
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
      expect(s.traits?.length).toBe(3);
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
