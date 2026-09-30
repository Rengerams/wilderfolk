import type { WorldState, Resources, WorkshopRecipe, Building } from './gameTypes';
import { BuildingType, Season } from './gameTypes';
import { addFloatingText } from './simEffects';
import { recordFoodConsumed } from './economyLedger';

export { addResource } from './resourceUtils';
export { canAffordWorkshopRecipe } from './workshops';

/**
 * Storage one completed building adds, per resource.
 *
 * Exported (with `updateStorageCaps` as the single reader) because the inspector's Silo and
 * WoodStorehouse hints typed "+600 food storage" and "+800 wood storage" as prose — the numbers a
 * designer tunes now live only here (audit C2 "Building output/tuning copy").
 */
export const BARN_FOOD_STORAGE = 400;
export const BARN_WOOD_STORAGE = 300;
export const SILO_FOOD_STORAGE = 600;
export const SILO_STONE_STORAGE = 200;
export const WOOD_STOREHOUSE_STORAGE = 800;
export const STORE_WAREHOUSE_STORAGE = 200;
export const BASE_WOOD_STORAGE = 800;
export const BASE_FOOD_STORAGE = 800;
export const BASE_STONE_STORAGE = 300;
/** Gold and iron are not storage-building driven: a flat ceiling and a warehouse-count bonus. */
export const BASE_GOLD_STORAGE = 20000;
export const BASE_IRON_STORAGE = 300;
export const WAREHOUSE_IRON_STORAGE = 100;

/**
 * The one derivation of `storageMax` from the colony's completed storage buildings.
 *
 * **Every** writer of `storageMax` comes through here. There used to be three definitions — this rule,
 * `worldGen`'s initial literal, and `saveLoad`'s fallback — and they disagreed: a fresh colony was
 * handed `{ wood: 1000, stone: 500, food: 1000, gold: 2000, iron: 500 }` against this rule's
 * `800 / 300 / 800 / 20000 / 300`. Because `updateStorageCaps` only runs in the daily layer and a world
 * starts at tick 24, the first in-game day enforced a gold ceiling **10× lower** than the real one and
 * material ceilings 25–67 % higher — and since nothing ever clamps stock *down*, the opening
 * `wood: 2000` was already over its own cap from the first tick (2026-09-20 audit, F10).
 *
 * Takes only `buildings` so a world under construction can call the same rule the daily tick does.
 */
export function computeStorageMax(
  buildings: readonly Building[],
): { wood: number; stone: number; food: number; gold: number; iron: number } {
  // Which completed buildings confer storage is a *player* rule — `b.faction !== 'rival'` is the
  // same test `tradeCaravans.hasCompletedMarket` and every other consumer of "the colony's
  // buildings" applies. Without it a rival Market (built by `rivalEvents`, `faction: 'rival'` in
  // `groupEvents.createRivalBuilding`) handed the player +200 wood, +200 stone and +100 iron of
  // storage on the next day boundary while `canEstablishTradeRoute` still refused with
  // "Build a Market" — and a rival Silo cut the player's spoilage rate too
  // (`LIVE-FINDINGS-STATUS.md`, E-1). Guarded by `tests/storageCap.test.ts`.
  const countOf = (type: BuildingType): number =>
    buildings.filter((b) => b.completed && b.faction !== 'rival' && b.type === type).length;
  const barns = countOf(BuildingType.Barn);
  const silos = countOf(BuildingType.Silo);
  const storehouses = countOf(BuildingType.WoodStorehouse);
  const warehouses = countOf(BuildingType.Store) + countOf(BuildingType.Market);

  return {
    wood:
      BASE_WOOD_STORAGE +
      barns * BARN_WOOD_STORAGE +
      storehouses * WOOD_STOREHOUSE_STORAGE +
      warehouses * STORE_WAREHOUSE_STORAGE,
    stone: BASE_STONE_STORAGE + silos * SILO_STONE_STORAGE + warehouses * STORE_WAREHOUSE_STORAGE,
    food: BASE_FOOD_STORAGE + barns * BARN_FOOD_STORAGE + silos * SILO_FOOD_STORAGE,
    gold: BASE_GOLD_STORAGE,
    iron: BASE_IRON_STORAGE + warehouses * WAREHOUSE_IRON_STORAGE,
  };
}

export function updateStorageCaps(state: WorldState) {
  const silos = state.buildings.filter(
    (b) => b.completed && b.faction !== 'rival' && b.type === BuildingType.Silo,
  ).length;

  state.storageMax = computeStorageMax(state.buildings);
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
    // The ledger's `consumed` side is what lets the "why is my food low?" panel reconcile
    // produced − consumed against the real delta, and spoilage was the one sink that never reached it:
    // a village could lose food every day with nothing in the panel to explain the loss
    // (`LIVE-FINDINGS-STATUS.md`, L8). Only recorded when something was actually lost, so a
    // zero-loss day adds no row.
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
