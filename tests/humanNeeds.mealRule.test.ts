import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { tryEatColonyMeal } from '../src/game/simulation/humanNeeds';
import { advanceHumanNeeds, getHumanNeedsWorkMultiplier, initialHumanNeeds } from '../src/game/simulation/humanPhysiology';

const mealTick = TICKS_PER_DAY;
function person(override: Partial<Entity> = {}): Entity {
  return {
    id: 1, type: EntityType.Human, alive: true, age: 30, isJuvenile: false,
    energy: 300, maxEnergy: 500,
    needs: { nutrition: 60, rest: 70, stamina: 60 },
    ...override,
  } as Entity;
}
function world(food: number): WorldState {
  return { tick: mealTick, resources: { wood: 0, stone: 0, food } } as WorldState;
}

describe('single human meal transaction', () => {
  it('debits food once and restores only nutrition', () => {
    const state = world(10);
    const eater = person();
    const before = { ...eater.needs! };
    expect(tryEatColonyMeal(eater, state, 9)).toBe(true);
    expect(state.resources.food).toBe(9);
    expect(state.economyLedger?.consumed.meals).toBe(1);
    expect(eater.needs!.nutrition).toBe(70);
    expect(eater.needs!.rest).toBe(before.rest);
    expect(eater.needs!.stamina).toBe(before.stamina);
    expect(eater.energy).toBe(300);
    expect(tryEatColonyMeal(eater, state, 9)).toBe(false);
    expect(state.resources.food).toBe(9);
  });

  it('prevents visitors, mid-hour, well-fed, and unfunded meals', () => {
    const cases: Array<[Entity, WorldState]> = [
      [person({ faction: 'visitor' }), world(10)],
      [person(), { ...world(10), tick: mealTick + 1 }],
      [person({ needs: { nutrition: 85, rest: 20, stamina: 5 } }), world(10)],
      [person(), world(0)],
    ];
    for (const [e, state] of cases) {
      const food = state.resources.food;
      const nutrition = e.needs!.nutrition;
      expect(tryEatColonyMeal(e, state, 8)).toBe(false);
      expect(state.resources.food).toBe(food);
      expect(e.needs!.nutrition).toBe(nutrition);
    }
  });

  it('feeds foreign war captives without creating player physiology state', () => {
    const state = world(12);
    const captive = person({ faction: 'rival', warCaptive: true, energy: 180, needs: undefined });
    expect(tryEatColonyMeal(captive, state, 8)).toBe(true);
    expect(state.resources.food).toBe(11);
    expect(state.economyLedger?.consumed.meals).toBe(1);
    expect(captive.energy).toBeGreaterThan(180);
    expect(captive.needs).toBeUndefined();
    const visitor = person({ faction: 'rival', warCaptive: false, energy: 180, needs: undefined });
    expect(tryEatColonyMeal(visitor, state, 8)).toBe(false);
    expect(state.resources.food).toBe(11);
  });

  it('accounts accurately for fractional food and meal cooldown', () => {
    const state = world(0.5);
    const eater = person();
    expect(tryEatColonyMeal(eater, state, 7)).toBe(true);
    expect(state.resources.food).toBe(0);
    expect(state.economyLedger?.consumed.meals).toBe(0.5);
    expect(eater.needs!.nutrition).toBe(65);
    state.resources.food = 10;
    state.tick += TICKS_PER_HOUR;
    expect(tryEatColonyMeal(eater, state, 8)).toBe(false);
    state.tick += TICKS_PER_HOUR;
    expect(tryEatColonyMeal(eater, state, 9)).toBe(true);
  });
});

describe('independent physiological advancement', () => {
  it('eating and sleeping do not masquerade as the same resource', () => {
    const e = person({ needs: { nutrition: 20, rest: 10, stamina: 0 } });
    advanceHumanNeeds(e, { tick: mealTick, sleeping: true, working: false, moving: false });
    expect(e.needs!.rest).toBeGreaterThan(10);
    expect(e.needs!.stamina).toBeGreaterThan(0);
    expect(e.needs!.nutrition).toBeLessThan(20);
    const once = { ...e.needs! };
    advanceHumanNeeds(e, { tick: mealTick, sleeping: true, working: false, moving: false });
    expect(e.needs).toEqual(once);
  });

  it('preserves normal output but penalizes severe deprivation', () => {
    expect(getHumanNeedsWorkMultiplier(person())).toBe(1);
    expect(getHumanNeedsWorkMultiplier(person({ needs: { nutrition: 4, rest: 70, stamina: 60 } }))).toBe(0.55);
    expect(getHumanNeedsWorkMultiplier(person({ needs: { nutrition: 60, rest: 70, stamina: 3 } }))).toBe(0.55);
  });

  it('treats zero stamina as recoverable and clamps bad old energy', () => {
    const e = person({ energy: Number.NaN, maxEnergy: 0 });
    expect(initialHumanNeeds(e.energy, e.maxEnergy).stamina).toBe(80);
    e.needs = { nutrition: 50, rest: 50, stamina: 0 };
    advanceHumanNeeds(e, { tick: mealTick, sleeping: false, working: false, moving: false });
    expect(e.alive).toBe(true);
    expect(e.needs.stamina).toBeGreaterThan(0);
  });
});
