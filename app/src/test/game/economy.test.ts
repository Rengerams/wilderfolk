import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { BuildingType, Season } from '@/game/gameTypes';
import { WORK_START } from '@/game/dayCycle';
import {
  addResource,
  applyFoodSpoilage,
  canAffordWorkshopRecipe,
  consumeWorkshopRecipeInputs,
  ensureFullTradeRoutes,
  establishTradeRoute,
  initTradeRoutes,
  updateStorageCaps,
  updateTradeRoutes,
} from '@/game/economy';
import { DEFAULT_WORKSHOP_RECIPE_ID, getWorkshopRecipe } from '@/game/gameTypes';

function tradeProductionTick(): number {
  return WORK_START;
}

describe('updateStorageCaps', () => {
  it('raises food cap when a barn is completed', () => {
    const state = initGame();
    const baseFood = state.storageMax.food;
    state.buildings.push({
      id: 50,
      type: BuildingType.Barn,
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 1,
      faction: undefined,
      buildAnimTimer: 0,
      spriteScale: 1,
    });
    updateStorageCaps(state);
    expect(state.storageMax.food).toBeGreaterThan(baseFood);
  });
});

describe('addResource', () => {
  it('respects storage caps', () => {
    const state = initGame();
    state.resources.food = 0;
    state.storageMax.food = 50;
    expect(addResource(state, 'food', 100)).toBe(50);
    expect(state.resources.food).toBe(50);
  });
});

describe('workshop recipe helpers', () => {
  it('canAffordWorkshopRecipe and consumeWorkshopRecipeInputs', () => {
    const state = initGame();
    state.resources = { wood: 5, stone: 0, food: 0, gold: 0 };
    const recipe = getWorkshopRecipe(DEFAULT_WORKSHOP_RECIPE_ID);
    expect(canAffordWorkshopRecipe(state, recipe)).toBe(true);
    consumeWorkshopRecipeInputs(state, recipe);
    expect(canAffordWorkshopRecipe(state, recipe)).toBe(false);
  });
});

describe('applyFoodSpoilage', () => {
  it('reduces food when spoilage rate is positive', () => {
    const state = initGame();
    state.resources.food = 100;
    state.foodSpoilageRate = 0.1;
    applyFoodSpoilage(state, Season.Spring);
    expect(state.resources.food).toBeLessThan(100);
  });
});

describe('establishTradeRoute', () => {
  it('activates a route when reputation is high enough', () => {
    const state = initGame();
    state.tradeRoutes = initTradeRoutes();
    state.villageReputation = 50;
    const before = state.lifetimeStats.tradeRoutesEstablished;
    const next = establishTradeRoute(state, 'trade_1');
    expect(next.tradeRoutes.find((r) => r.id === 'trade_1')?.active).toBe(true);
    expect(next.lifetimeStats.tradeRoutesEstablished).toBe(before + 1);
  });

  it('does not activate when reputation is too low', () => {
    const state = initGame();
    state.villageReputation = 0;
    const next = establishTradeRoute(state, 'trade_1');
    expect(next.tradeRoutes.find((r) => r.id === 'trade_1')?.active).toBeFalsy();
  });
});

describe('updateTradeRoutes', () => {
  it('does not deduct exports when gold storage cannot fit the full shipment', () => {
    const state = initGame();
    state.tradeRoutes = initTradeRoutes().map((r) =>
      r.id === 'trade_1' ? { ...r, active: true } : r,
    );
    state.resources = { wood: 100, stone: 50, food: 100, gold: 99990 };
    state.storageMax.gold = 99999;
    state.tick = tradeProductionTick();

    updateTradeRoutes(state);

    expect(state.resources.wood).toBe(100);
    expect(state.resources.food).toBe(100);
    expect(state.resources.gold).toBe(99990);
  });

  it('deducts exports only when the full receive fits storage', () => {
    const state = initGame();
    state.tradeRoutes = initTradeRoutes().map((r) =>
      r.id === 'trade_1' ? { ...r, active: true } : r,
    );
    state.resources = { wood: 100, stone: 50, food: 100, gold: 0 };
    state.storageMax.gold = 99999;
    state.tick = tradeProductionTick();

    updateTradeRoutes(state);

    expect(state.resources.wood).toBe(80);
    expect(state.resources.food).toBe(70);
    expect(state.resources.gold).toBe(15);
  });

  it('skips inactive routes', () => {
    const state = initGame();
    state.resources = { wood: 100, stone: 50, food: 100, gold: 0 };
    state.tick = tradeProductionTick();
    updateTradeRoutes(state);
    expect(state.resources.wood).toBe(100);
  });
});

describe('initTradeRoutes / ensureFullTradeRoutes', () => {
  it('ensureFullTradeRoutes adds missing default routes', () => {
    const partial = initTradeRoutes().slice(0, 2);
    const merged = ensureFullTradeRoutes(partial);
    expect(merged.length).toBe(initTradeRoutes().length);
    expect(merged.some((r) => r.id === 'trade_5')).toBe(true);
  });
});