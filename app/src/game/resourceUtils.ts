import type { WorldState, Resources } from './gameTypes';

export const FOOD_LOW_THRESHOLD = 20;

export function isFoodLow(resources: Pick<WorldState['resources'], 'food'>): boolean {
  return resources.food < FOOD_LOW_THRESHOLD;
}

export function isFoodCritical(world: Pick<WorldState, 'resources' | 'humanPopulation'>): boolean {
  return world.resources.food < Math.max(15, world.humanPopulation * 1.5);
}

export function isFoodAlert(world: Pick<WorldState, 'resources' | 'humanPopulation'>): boolean {
  return isFoodCritical(world) || isFoodLow(world.resources);
}

function storageCapFor(state: WorldState, type: keyof Resources): number {
  const max = state.storageMax[type];
  if (typeof max === 'number' && Number.isFinite(max)) return max;
  return Infinity;
}

/** Add resources respecting storage caps (wood, stone, food). Gold uses the same helper for consistency. */
export function addCappedResource(state: WorldState, type: keyof Resources, amount: number): number {
  if (amount <= 0) return 0;
  const current = state.resources[type] as number;
  const max = storageCapFor(state, type);
  const headroom = Number.isFinite(max) ? Math.max(0, max - current) : amount;
  const add = Math.min(amount, headroom);
  (state.resources[type] as number) += add;
  return add;
}