export type ResourceKey = 'wood' | 'stone' | 'food' | 'gold' | 'iron';

export interface Resources {
  wood: number;
  stone: number;
  food: number;
  gold: number;
  iron: number;
}

export interface ResourceMeta {
  readonly key: ResourceKey;
  readonly label: string;
  readonly emoji: string;
  readonly color: string;
}

export const RESOURCE_METAS: Record<ResourceKey, ResourceMeta> = {
  wood: {
    key: 'wood',
    label: 'Wood',
    emoji: '🪵',
    color: '#a16207',
  },
  stone: {
    key: 'stone',
    label: 'Stone',
    emoji: '🪨',
    color: '#78716c',
  },
  food: {
    key: 'food',
    label: 'Food',
    emoji: '🍖',
    color: '#16a34a',
  },
  gold: {
    key: 'gold',
    label: 'Gold',
    emoji: '💰',
    color: '#ca8a04',
  },
  iron: {
    key: 'iron',
    label: 'Iron',
    emoji: '🔩',
    color: '#0284c7',
  },
} as const;

/**
 * Formats a resource amount with its canonical emoji (e.g., "50 🪵").
 */
export function formatResourceAmount(key: ResourceKey, amount: number): string {
  return `${amount} ${RESOURCE_METAS[key].emoji}`;
}

export function formatResourceAmounts(resources: Partial<Record<ResourceKey, number>>): string {
  const parts: string[] = [];
  for (const [key, amount] of Object.entries(resources) as [ResourceKey, number | undefined][]) {
    if ((amount ?? 0) > 0) parts.push(formatResourceAmount(key, amount as number));
  }
  return parts.join(' · ');
}