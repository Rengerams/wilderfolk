/**
 * PR B follow-up — the physiology labor context reaches a player settler.
 *
 * Hardy's and Fierce's energy terms used to live only in the foreign-captive energy path,
 * so a player settler's own reserve ignored its DNA. The live stamina drain now divides by
 * the catalog's `physiology`/`labor` factor, and the inspector copy names what really runs:
 * no trait claims a maturation or captive-only energy effect any more.
 */
import { describe, expect, it } from 'vitest';
import { advanceHumanNeeds, initialHumanNeeds } from '../src/game/simulation/humanPhysiology';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';
import { TRAIT_DEFS } from '../src/game/settlerTraits';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, SettlerTrait } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';

const LABOR = { kind: 'physiology', activity: 'labor' } as const;
const START_ENERGY = 400;
const MAX_ENERGY = 500;

function worker(traits: SettlerTrait[]): Entity {
  return {
    id: 1,
    type: EntityType.Human,
    alive: true,
    isJuvenile: false,
    traits,
    energy: START_ENERGY,
    maxEnergy: MAX_ENERGY,
    needs: initialHumanNeeds(START_ENERGY, MAX_ENERGY),
  } as Entity;
}

/** Stamina left after `hours` of uninterrupted work, driven through the real mutator. */
function staminaAfterWork(traits: SettlerTrait[], hours: number): number {
  const entity = worker(traits);
  for (let hour = 0; hour < hours; hour++) {
    advanceHumanNeeds(entity, {
      tick: hour, elapsedTicks: TICKS_PER_HOUR, sleeping: false, working: true, moving: false,
    });
  }
  return entity.needs!.stamina;
}

describe('a player settler\'s work drain follows its own DNA', () => {
  it('makes Hardy and Graceful differ from a plain settler on the same shift', () => {
    const plain = staminaAfterWork([], 2);
    const hardy = staminaAfterWork(['hardy'], 2);
    const graceful = staminaAfterWork(['graceful'], 2);

    expect(evaluateTraitInfluence({ traits: ['hardy'] }, LABOR).factor,
      'fixture premise: the catalog rewards endurance at hard labor').toBeGreaterThan(1);
    expect(evaluateTraitInfluence({ traits: ['graceful'] }, LABOR).factor,
      'fixture premise: the catalog prices heavy labor as Graceful\'s drawback').toBeLessThan(1);

    expect(hardy).toBeGreaterThan(plain);
    expect(graceful).toBeLessThan(plain);
  });

  it('leaves an untraited settler on the documented base drain', () => {
    const drained = worker([]).needs!.stamina - staminaAfterWork([], 2);
    expect(drained).toBeGreaterThan(0);
    expect(staminaAfterWork([], 2)).toBeCloseTo(80 - 18, 6);
  });
});

describe('inspector copy names an effect the game performs', () => {
  const promises = (trait: SettlerTrait, phrase: string): boolean =>
    TRAIT_DEFS[trait].description.toLowerCase().includes(phrase);

  it('drops the maturation claim that calendar-only aging cannot honour', () => {
    expect(promises('nurturing', 'mature')).toBe(false);
    expect(promises('nurturing', 'faster')).toBe(false);
  });

  it('drops the captive-only energy and winter claims', () => {
    expect(promises('hardy', 'energy')).toBe(false);
    expect(promises('fierce', 'energy')).toBe(false);
    expect(promises('greenthumb', 'winter')).toBe(false);
  });
});
