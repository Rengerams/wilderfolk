import type { ResourceKey } from '../components/resourceLabels';

export type ResourceCostAmount = Partial<Record<ResourceKey, number>>;

/** Incoming raid barricade response cost. */
export const BARRICADE_RAID_COST: ResourceCostAmount = { wood: 20, stone: 10 };

const COST_ORDER: ResourceKey[] = ['wood', 'stone', 'food', 'gold'];

const COST_ABBREV: Record<ResourceKey, string> = {
  wood: 'w',
  stone: 's',
  food: 'f',
  gold: 'g',
};

export function resourceCostEntries(cost: ResourceCostAmount): Array<{ key: ResourceKey; amount: number }> {
  return COST_ORDER
    .map((key) => ({ key, amount: cost[key] ?? 0 }))
    .filter((entry) => entry.amount > 0);
}

/** Compact text for floating labels and logs — e.g. `20w · 10s`. */
export function formatResourceCost(cost: ResourceCostAmount): string {
  const parts = resourceCostEntries(cost).map(({ key, amount }) => `${amount}${COST_ABBREV[key]}`);
  return parts.join(' · ') || 'Free';
}

export function formatResourceCostNeed(cost: ResourceCostAmount): string {
  const formatted = formatResourceCost(cost);
  return formatted === 'Free' ? 'Free' : `Need ${formatted}`;
}

export function canAffordResourceCost(
  resources: { wood: number; stone: number; food: number; gold: number },
  cost: ResourceCostAmount,
): boolean {
  return resourceCostEntries(cost).every(({ key, amount }) => (resources[key] ?? 0) >= amount);
}