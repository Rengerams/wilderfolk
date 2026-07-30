import type { WorldState, Resources, WorkshopRecipe } from './gameTypes';
import { BuildingType, Season } from './gameTypes';
import { addCappedResource } from './resourceUtils';
import { addFloatingText } from './gameEngine';

/** Canonical implementation lives in tradeCaravans (Market gate + caravan schedule). */
export { establishTradeRoute, hasCompletedMarket } from './tradeCaravans';

export function updateStorageCaps(state: WorldState) {
  const barns = state.buildings.filter(b => b.completed && b.type === BuildingType.Barn).length;
  const silos = state.buildings.filter(b => b.completed && b.type === BuildingType.Silo).length;
  const warehouses = state.buildings.filter(b => b.completed && (b.type === BuildingType.Store || b.type === BuildingType.Market)).length;
  state.storageMax = {
    wood: 500 + barns * 300 + warehouses * 200,
    stone: 300 + silos * 200 + warehouses * 200,
    food: 600 + barns * 400 + silos * 600,
    gold: 99999,
  };
  state.foodSpoilageRate = Math.max(0.01, 0.03 - silos * 0.012); // balance v2.2
}

export function addResource(state: WorldState, type: keyof Resources, amount: number): number {
  return addCappedResource(state, type, amount);
}

export function canAffordWorkshopRecipe(state: WorldState, recipe: WorkshopRecipe): boolean {
  for (const key of Object.keys(recipe.inputs) as (keyof Resources)[]) {
    const needed = recipe.inputs[key] ?? 0;
    if (needed > 0 && (state.resources[key] as number) < needed) return false;
  }
  return true;
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
    { id: 'trade_1', targetName: 'Riverdale', resourcesGiven: { wood: 20, stone: 0, food: 30, gold: 0 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 15 }, reputationRequired: 15, active: false },
    { id: 'trade_2', targetName: 'Oakhaven', resourcesGiven: { wood: 40, stone: 0, food: 0, gold: 0 }, resourcesReceived: { wood: 0, stone: 25, food: 0, gold: 0 }, reputationRequired: 25, active: false },
    { id: 'trade_3', targetName: 'Ironport', resourcesGiven: { wood: 0, stone: 30, food: 0, gold: 10 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 30 }, reputationRequired: 40, active: false },
    { id: 'trade_4', targetName: 'Goldhaven', resourcesGiven: { wood: 20, stone: 20, food: 20, gold: 0 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 50 }, reputationRequired: 60, active: false },
    { id: 'trade_5', targetName: 'Silkmarket', resourcesGiven: { wood: 30, stone: 10, food: 40, gold: 20 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 80 }, reputationRequired: 75, active: false },
    { id: 'trade_6', targetName: 'Spice Coast', resourcesGiven: { wood: 25, stone: 15, food: 50, gold: 30 }, resourcesReceived: { wood: 0, stone: 0, food: 0, gold: 120 }, reputationRequired: 85, active: false },
    { id: 'trade_7', targetName: 'Granite Reach', resourcesGiven: { wood: 40, stone: 35, food: 30, gold: 40 }, resourcesReceived: { wood: 0, stone: 80, food: 0, gold: 60 }, reputationRequired: 95, active: false },
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
