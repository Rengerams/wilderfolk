/** Captives are stationary prisoners, not a second player-physiology model. */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { tryEatColonyMeal } from '../src/game/simulation/humanNeeds';
import { advanceHumanNeeds, initialHumanNeeds } from '../src/game/simulation/humanPhysiology';

function foreignCaptive(): Entity {
  return { id: 7, type: EntityType.Human, faction: 'rival', alive: true,
    isJuvenile: false, age: 30, energy: 180, maxEnergy: 500, needs: undefined,
    warCaptive: { raidId: 'r', originRivalId: 'enemy', capturedAtTick: 0,
      recruitAfterTick: 999, attempts: 0 } } as Entity;
}
describe('foreign prisoners do not have player needs or infrastructure modifiers', () => {
  it('eats one 08:00 ration with no energy restoration', () => {
    const p = foreignCaptive();
    const state = { tick: TICKS_PER_HOUR * 8, resources: { food: 10 } } as WorldState;
    expect(tryEatColonyMeal(p, state, 8)).toBe(true);
    expect(state.resources.food).toBe(9);
    expect(p.energy).toBe(180);
    expect(p.needs).toBeUndefined();
    expect(tryEatColonyMeal(p, state, 8)).toBe(false);
    expect(p.warCaptive?.lastRationDay).toBe(0);
    state.tick += TICKS_PER_HOUR;
    expect(tryEatColonyMeal(p, state, 9)).toBe(false);
    state.tick += 23 * TICKS_PER_HOUR;
    expect(tryEatColonyMeal(p, state, 8)).toBe(true);
    expect(p.warCaptive?.lastRationDay).toBe(1);
    expect(state.resources.food).toBe(8);
  });

  it('leaves real workload stamina drain to player physiology', () => {
    const p = { ...foreignCaptive(), faction: undefined, warCaptive: undefined, energy: 400,
      needs: initialHumanNeeds(400, 500) } as Entity;
    const prior = p.needs!.stamina;
    advanceHumanNeeds(p, { tick: 0, elapsedTicks: TICKS_PER_HOUR,
      sleeping: false, working: true, moving: false });
    expect(p.needs!.stamina).toBeLessThan(prior);
    expect(p.energy).toBeCloseTo(500 * p.needs!.stamina / 100);
  });
});
