import type { WorldState, Resources, WorkshopRecipe } from './gameTypes';
import { BuildingType, Season } from './gameTypes';
import { addFloatingText } from './simEffects';

export { addResource } from './resourceUtils';
export { canAffordWorkshopRecipe } from './workshops';

export function updateStorageCaps(state: WorldState) {
  const barns = state.buildings.filter(b => b.completed && b.type === BuildingType.Barn).length;
  const silos = state.buildings.filter(b => b.completed && b.type === BuildingType.Silo).length;
  const storehouses = state.buildings.filter(b => b.completed && b.type === BuildingType.WoodStorehouse).length;
  const warehouses = state.buildings.filter(b => b.completed && (b.type === BuildingType.Store || b.type === BuildingType.Market)).length;
  state.storageMax = {
    wood: 800 + barns * 300 + storehouses * 800 + warehouses * 200,
    stone: 300 + silos * 200 + warehouses * 200,
    food: 800 + barns * 400 + silos * 600,
    gold: 20000,
    iron: 300 + warehouses * 100,
  };
  // Floor at 0, not 0.01: the 1% floor swallowed the formula's own first-Silo result
  // (0.02 − 0.012 = 0.8%), and a negative rate is not a spoilage rate.
  state.foodSpoilageRate = Math.max(0, 0.02 - silos * 0.012);
}

export function consumeWorkshopRecipeInputs(state: WorldState, recipe: WorkshopRecipe): void {
  for (const key of Object.keys(recipe.inputs) as (keyof Resources)[]) {
    const needed = recipe.inputs[key] ?? 0;
    if (needed > 0) {
      (state.resources[key] as number) = Math.max(0, (state.resources[key] as number) - needed);
    }
  }
}

export function applyFoodSpoilage(state: WorldState, season: Season) {
  if (state.resources.food <= 0) return;
  const seasonMult = season === Season.Winter ? 0.6 : season === Season.Summer ? 1.3 : 1.0;
  const loss = Math.floor(state.resources.food * state.foodSpoilageRate * seasonMult);
  if (loss > 0) {
    state.resources.food = Math.max(0, state.resources.food - loss);
    if (loss >= 5) {
      addFloatingText(state, state.width / 2, state.height / 2 - 40, `-${loss} food spoiled`, '#ef4444', 'brief');
    }
  }
}

export function initTradeRoutes(): WorldState['tradeRoutes'] {
  return [
    { id: 'trade_1', targetName: 'Riverdale', resourcesGiven: { wood: 20, stone: 0, food: 30, gold: 0, iron: 0 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 15, iron: 0 }, reputationRequired: 15, active: false },
    { id: 'trade_2', targetName: 'Oakhaven', resourcesGiven: { wood: 40, stone: 0, food: 0, gold: 0, iron: 0 }, resourcesReceived: { wood: 0, stone: 25, food: 0, gold: 0, iron: 0 }, reputationRequired: 25, active: false },
    { id: 'trade_3', targetName: 'Ironport', resourcesGiven: { wood: 0, stone: 30, food: 0, gold: 10, iron: 0 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 30, iron: 15 }, reputationRequired: 40, active: false },
    { id: 'trade_4', targetName: 'Goldhaven', resourcesGiven: { wood: 20, stone: 20, food: 20, gold: 0, iron: 0 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 50, iron: 0 }, reputationRequired: 60, active: false },
    { id: 'trade_5', targetName: 'Silkmarket', resourcesGiven: { wood: 30, stone: 10, food: 40, gold: 20, iron: 0 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 80, iron: 0 }, reputationRequired: 75, active: false },
    { id: 'trade_6', targetName: 'Spice Coast', resourcesGiven: { wood: 25, stone: 15, food: 50, gold: 30, iron: 0 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 120, iron: 0 }, reputationRequired: 85, active: false },
    { id: 'trade_7', targetName: 'Granite Reach', resourcesGiven: { wood: 40, stone: 35, food: 30, gold: 40, iron: 0 }, resourcesReceived: { wood: 0, stone: 80, food: 0, gold: 60, iron: 0 }, reputationRequired: 95, active: false },
    // --- Coin → materials. Every route above *exports* materials for coin, which left a
    // colony that had coin but no wood or stone with no way back (and nothing a colony
    // builds is free). These three buy the other way. The first needs no reputation, so it
    // is always available, and `canEstablishTradeRoute` lets a purchase route skip the
    // Market requirement — a Market costs 50 wood and 20 stone, which is exactly what a
    // trapped colony does not have.
    { id: 'trade_8', targetName: 'Timberland Traders', resourcesGiven: { wood: 0, stone: 0, food: 0, gold: 25, iron: 0 }, resourcesReceived: { wood: 60, stone: 0, food: 0, gold: 0, iron: 0 }, reputationRequired: 0, active: false },
    { id: 'trade_9', targetName: 'Stonefall Traders', resourcesGiven: { wood: 0, stone: 0, food: 0, gold: 30, iron: 0 }, resourcesReceived: { wood: 0, stone: 45, food: 0, gold: 0, iron: 0 }, reputationRequired: 10, active: false },
    { id: 'trade_10', targetName: 'Greenfields Traders', resourcesGiven: { wood: 0, stone: 0, food: 0, gold: 35, iron: 0 }, resourcesReceived: { wood: 0, stone: 0, food: 60, gold: 0, iron: 0 }, reputationRequired: 10, active: false },
  ];
}

/** Merge any routes added after an older save was created. */
export function ensureFullTradeRoutes(routes: WorldState['tradeRoutes']): WorldState['tradeRoutes'] {
  const defaults = initTradeRoutes();
  const byId = new Map(routes.map((r) => [r.id, r]));
  for (const route of defaults) {
    if (!byId.has(route.id)) byId.set(route.id, { ...route });
  }
  return defaults.map((d) => byId.get(d.id) ?? d);
}
