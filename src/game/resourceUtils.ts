import type { WorldState, Resources } from './gameTypes';

export const FOOD_LOW_THRESHOLD = 20;
/** 15 = the floor under the per-settler rule; 1.5 = stores per settler below which food is critical. */
export const FOOD_CRITICAL_BASE = 15;
export const FOOD_CRITICAL_PER_PERSON = 1.5;

export function isFoodLow(resources: Pick<WorldState['resources'], 'food'>): boolean {
  return (resources.food ?? 0) < FOOD_LOW_THRESHOLD;
}

/**
 * The absolute store level below which `population` settlers count as critical.
 *
 * Exported because five surfaces used to re-derive "food is low" and four of them disagreed — a 3× rule
 * in the dashboard, `max(20, pop × 2)` in the focus hints and the citizen mood, and `max(15, pop × 1.5)`
 * in the alert strip and the low-food tip — so at 2 settlers with 18 food the header warned, the Focus
 * panel said "Feed the village", and the alert strip said nothing at all
 * (`LIVE-FINDINGS-STATUS.md`, F20). This is the one definition; the sites now call it.
 */
export function getFoodCriticalThreshold(population: number): number {
  return Math.max(FOOD_CRITICAL_BASE, population * FOOD_CRITICAL_PER_PERSON);
}

export function isFoodCriticalAmount(food: number, population: number): boolean {
  return (food ?? 0) < getFoodCriticalThreshold(population);
}

export function isFoodCritical(world: Pick<WorldState, 'resources' | 'humanPopulation'>): boolean {
  return isFoodCriticalAmount(world.resources.food ?? 0, world.humanPopulation ?? 0);
}

/** Critical **or** merely low — the "feed the village" band, not the emergency. */
export function isFoodAlertAmount(food: number, population: number): boolean {
  return isFoodCriticalAmount(food, population) || (food ?? 0) < FOOD_LOW_THRESHOLD;
}

export function isFoodAlert(world: Pick<WorldState, 'resources' | 'humanPopulation'>): boolean {
  return isFoodAlertAmount(world.resources.food ?? 0, world.humanPopulation ?? 0);
}

export function getStorageCap(state: WorldState, type: keyof Resources): number {
  const max = state.storageMax?.[type];
  return typeof max === 'number' && Number.isFinite(max) ? max : Infinity;
}

export function getAvailableStorageHeadroom(state: WorldState, type: keyof Resources): number {
  const current = state.resources[type] ?? 0;
  const max = getStorageCap(state, type);
  return Number.isFinite(max) ? Math.max(0, max - current) : Infinity;
}

export function isResourceCapped(state: WorldState, type: keyof Resources): boolean {
  return getAvailableStorageHeadroom(state, type) <= 0;
}

/**
 * Adds resources respecting configured storage caps.
 * Returns the actual quantity added to storage.
 */
export function addCappedResource(state: WorldState, type: keyof Resources, amount: number): number {
  if (amount <= 0 || !Number.isFinite(amount)) return 0;

  const current = state.resources[type] ?? 0;
  const max = getStorageCap(state, type);
  const headroom = Number.isFinite(max) ? Math.max(0, max - current) : amount;
  const add = Math.min(amount, headroom);

  state.resources[type] = current + add;
  return add;
}

/** Thin wrapper around addCappedResource for direct resource gains. */
export function addResource(state: WorldState, type: keyof Resources, amount: number): number {
  return addCappedResource(state, type, amount);
}

/** Deducts a single resource type without dropping below zero. Returns actual deducted amount. */
export function deductResource(state: WorldState, type: keyof Resources, amount: number): number {
  if (amount <= 0 || !Number.isFinite(amount)) return 0;
  const current = state.resources[type] ?? 0;
  const deducted = Math.min(current, amount);
  state.resources[type] = Math.max(0, current - deducted);
  return deducted;
}

/** Checks whether the village currently holds sufficient stores for a multi-resource cost. */
export function canAfford(state: WorldState, cost: Partial<Resources>): boolean {
  for (const [key, amount] of Object.entries(cost)) {
    if (typeof amount === 'number' && amount > 0) {
      const available = state.resources[key as keyof Resources] ?? 0;
      if (available < amount) return false;
    }
  }
  return true;
}

/** Deducts all resources specified in a cost dictionary. Returns true if successful. */
export function consumeResources(state: WorldState, cost: Partial<Resources>): boolean {
  if (!canAfford(state, cost)) return false;

  for (const [key, amount] of Object.entries(cost)) {
    if (typeof amount === 'number' && amount > 0) {
      deductResource(state, key as keyof Resources, amount);
    }
  }
  return true;
}