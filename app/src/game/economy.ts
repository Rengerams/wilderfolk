import type { WorldState, Resources, WorkshopRecipe } from './gameTypes';
import { BuildingType, Season } from './gameTypes';
import { addCappedResource } from './resourceUtils';
import { isProductionTick, EVENT_INTERVAL } from './dayCycle';
import {
  addFloatingText,
  addNotification,
  getMultiplier,
} from './gameEngine';
import { getTownHallTradeMultiplier } from './townHall';

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

export function establishTradeRoute(state: WorldState, routeId: string): WorldState {
  const s = structuredClone(state) as WorldState;
  const route = s.tradeRoutes.find(r => r.id === routeId);
  if (!route || route.active) return s;
  if (s.villageReputation < route.reputationRequired) {
    addNotification(s, 'Trade Failed', `Need ${route.reputationRequired} reputation`, 'warning');
    return s;
  }
  
  route.active = true;
  s.lifetimeStats = {
    ...s.lifetimeStats,
    tradeRoutesEstablished: s.lifetimeStats.tradeRoutesEstablished + 1,
  };
  addNotification(s, 'Trade Route Established', `Now trading with ${route.targetName}!`, 'success');
  return s;
}

function canStoreFullTradeAmount(state: WorldState, type: keyof Resources, amount: number): boolean {
  if (amount <= 0) return true;
  const current = state.resources[type] as number;
  const max = state.storageMax[type] as number;
  return current + amount <= max;
}

export function updateTradeRoutes(state: WorldState) {
  const tradeMult = getMultiplier(state, 'trade_bonus')
    * getTownHallTradeMultiplier(state, state.buildings);
  for (const route of state.tradeRoutes) {
    if (!route.active) continue;
    if (isProductionTick(state.tick, EVENT_INTERVAL.tradeRoute)) {
      const canAfford =
        state.resources.wood >= route.resourcesGiven.wood
        && state.resources.stone >= route.resourcesGiven.stone
        && state.resources.food >= route.resourcesGiven.food
        && state.resources.gold >= route.resourcesGiven.gold;
      if (!canAfford) {
        addFloatingText(
          state,
          state.width / 2,
          state.height / 2,
          `Trade with ${route.targetName} stalled — missing goods`,
          '#ef4444',
        );
        continue;
      }
      const recvWood = Math.floor(route.resourcesReceived.wood * tradeMult);
      const recvStone = Math.floor(route.resourcesReceived.stone * tradeMult);
      const recvFood = Math.floor(route.resourcesReceived.food * tradeMult);
      const recvGold = Math.floor(route.resourcesReceived.gold * tradeMult);

      const receives: { key: keyof Resources; amount: number }[] = [
        { key: 'wood', amount: recvWood },
        { key: 'stone', amount: recvStone },
        { key: 'food', amount: recvFood },
        { key: 'gold', amount: recvGold },
      ];

      if (receives.every((r) => r.amount <= 0)) continue;

      const storageBlocked = receives.some(
        (r) => r.amount > 0 && !canStoreFullTradeAmount(state, r.key, r.amount),
      );
      if (storageBlocked) {
        addFloatingText(
          state,
          state.width / 2,
          state.height / 2,
          `Trade with ${route.targetName} stalled — storage full`,
          '#ef4444',
        );
        continue;
      }

      state.resources.wood -= route.resourcesGiven.wood;
      state.resources.stone -= route.resourcesGiven.stone;
      state.resources.food -= route.resourcesGiven.food;
      state.resources.gold -= route.resourcesGiven.gold;

      const addedWood = recvWood > 0 ? addResource(state, 'wood', recvWood) : 0;
      const addedStone = recvStone > 0 ? addResource(state, 'stone', recvStone) : 0;
      const addedFood = recvFood > 0 ? addResource(state, 'food', recvFood) : 0;
      const addedGold = recvGold > 0 ? addResource(state, 'gold', recvGold) : 0;

      if (addedWood > 0) {
        addFloatingText(state, state.width / 2, state.height / 2 - 14, `Trade: +${addedWood} wood`, '#a3e635', 'brief');
      }
      if (addedStone > 0) {
        addFloatingText(state, state.width / 2, state.height / 2 - 6, `Trade: +${addedStone} stone`, '#a8a29e', 'brief');
      }
      if (addedFood > 0) {
        addFloatingText(state, state.width / 2, state.height / 2 + 2, `Trade: +${addedFood} food`, '#4ade80', 'brief');
      }
      if (addedGold > 0) {
        addFloatingText(state, state.width / 2, state.height / 2 + 10, `Trade: +${addedGold} gold`, '#eab308');
      }
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
