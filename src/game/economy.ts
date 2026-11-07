import type { WorldState, Resources, WorkshopRecipe, Building } from './gameTypes';
import { BuildingType, Season } from './gameTypes';
import { addFloatingText } from './simEffects';
import { recordFoodConsumed } from './economyLedger';

export { addResource } from './resourceUtils';
export { canAffordWorkshopRecipe } from './workshops';

/**
 * Storage one completed building adds, per resource — the numbers the inspector hints quote.
 */
export const BARN_FOOD_STORAGE = 400;
export const BARN_WOOD_STORAGE = 300;
export const SILO_FOOD_STORAGE = 2000;
/** Total food capacity bonus at each Silo upgrade level (level 3 and above capped). */
export function siloFoodStorageForLevel(level: number): number {
  return SILO_FOOD_STORAGE + Math.min(2, Math.max(0, Math.floor((Number.isFinite(level) ? level : 1)) - 1)) * 500;
}
export const SILO_STONE_STORAGE = 200;
/** Capacity added to each non-food resource by one completed Storehouse. */
export const WOOD_STOREHOUSE_STORAGE = 800;
/** Total bonus for each non-food resource: L1 800, L2 1800, L3+ 2800. */
export function storehouseStorageForLevel(level: number): number {
  return WOOD_STOREHOUSE_STORAGE + Math.min(2, Math.max(0, Math.floor(Number.isFinite(level) ? level : 1) - 1)) * 1000;
}
export const STORE_WAREHOUSE_STORAGE = 200;
export const BASE_WOOD_STORAGE = 800;
export const BASE_FOOD_STORAGE = 800;
export const BASE_STONE_STORAGE = 300;
/** Base gold and iron ceilings are augmented by completed Storehouses (and iron by warehouses). */
export const BASE_GOLD_STORAGE = 20000;
export const BASE_IRON_STORAGE = 300;
export const WAREHOUSE_IRON_STORAGE = 100;

/**
 * The one derivation of `storageMax` from the colony's completed storage buildings — every writer
 * comes through here. Takes only `buildings` so a world under construction calls the same rule.
 */
export function computeStorageMax(
  buildings: readonly Building[],
): { wood: number; stone: number; food: number; gold: number; iron: number } {
  // Which completed buildings confer storage is a player rule: rival-owned buildings never count.
  const countOf = (type: BuildingType): number =>
    buildings.filter((b) => b.completed && b.faction !== 'rival' && b.type === type).length;
  const barns = countOf(BuildingType.Barn);
  const silos = countOf(BuildingType.Silo);
  const siloFoodCapacity = buildings.reduce((sum, building) =>
    sum + (building.completed && building.faction !== 'rival' && building.type === BuildingType.Silo
      ? siloFoodStorageForLevel(building.level ?? 1) : 0), 0);
  const storehouseCapacity = buildings.reduce((sum, building) =>
    sum + (building.completed && building.faction !== 'rival' && building.type === BuildingType.WoodStorehouse
      ? storehouseStorageForLevel(building.level ?? 1) : 0), 0);
  const warehouses = countOf(BuildingType.Store) + countOf(BuildingType.Market);

  return {
    wood:
      BASE_WOOD_STORAGE +
      barns * BARN_WOOD_STORAGE +
      storehouseCapacity +
      warehouses * STORE_WAREHOUSE_STORAGE,
    stone: BASE_STONE_STORAGE + silos * SILO_STONE_STORAGE + storehouseCapacity + warehouses * STORE_WAREHOUSE_STORAGE,
    food: BASE_FOOD_STORAGE + barns * BARN_FOOD_STORAGE + siloFoodCapacity,
    gold: BASE_GOLD_STORAGE + storehouseCapacity,
    iron: BASE_IRON_STORAGE + storehouseCapacity + warehouses * WAREHOUSE_IRON_STORAGE,
  };
}

export function updateStorageCaps(state: WorldState) {
  const silos = state.buildings.filter(
    (b) => b.completed && b.faction !== 'rival' && b.type === BuildingType.Silo,
  ).length;

  state.storageMax = computeStorageMax(state.buildings);
  // Floor at 0, not 0.01: a negative rate is not a spoilage rate, and the first Silo's
  // 0.8% must survive.
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
    // Record spoilage on the ledger's consumed side so the food panel reconciles the real delta.
    recordFoodConsumed(state, 'spoilage', loss);
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
    // --- Coin → materials. These three buy the other way, so a colony with coin but no
    // materials is not trapped; the first needs no reputation and skips the Market requirement.
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
