import type { WorldState, Resources } from './gameTypes';

export const FOOD_LOW_THRESHOLD = 20;

export function isFoodLow(resources: Pick<WorldState['resources'], 'food'>): boolean {
  return (resources.food ?? 0) < FOOD_LOW_THRESHOLD;
}

export function isFoodCritical(world: Pick<WorldState, 'resources' | 'humanPopulation'>): boolean {
  const pop = world.humanPopulation ?? 0;
  const food = world.resources.food ?? 0;
  return food < Math.max(15, pop * 1.5);
}

export function isFoodAlert(world: Pick<WorldState, 'resources' | 'humanPopulation'>): boolean {
  return isFoodCritical(world) || isFoodLow(world.resources);
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