export type ResourceKey = 'wood' | 'stone' | 'food' | 'gold' | 'iron';

export interface Resources {
  wood: number;
  stone: number;
  food: number;
  gold: number;
  iron: number;
}

export const RESOURCE_KEYS: readonly ResourceKey[] = [
  'wood',
  'stone',
  'food',
  'gold',
  'iron',
] as const;

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
 * Type guard evaluating whether an unknown string is a valid ResourceKey.
 */
function isResourceKey(key: unknown): key is ResourceKey {
  return typeof key === 'string' && RESOURCE_KEYS.includes(key as ResourceKey);
}

/**
 * Creates a new zero-initialized resource purse.
 */
function createEmptyResources(): Resources {
  return {
    wood: 0,
    stone: 0,
    food: 0,
    gold: 0,
    iron: 0,
  };
}

/**
 * Creates a fast, shallow copy of a resource purse without JSON/structuredClone overhead.
 */
function cloneResources(source: Readonly<Resources>): Resources {
  return {
    wood: source.wood,
    stone: source.stone,
    food: source.food,
    gold: source.gold,
    iron: source.iron,
  };
}

/**
 * Returns true if available resources meet or exceed the required cost for all keys.
 */
function hasEnoughResources(
  available: Readonly<Resources>,
  cost: Readonly<Partial<Resources>>,
): boolean {
  if (cost.wood && available.wood < cost.wood) return false;
  if (cost.stone && available.stone < cost.stone) return false;
  if (cost.food && available.food < cost.food) return false;
  if (cost.gold && available.gold < cost.gold) return false;
  if (cost.iron && available.iron < cost.iron) return false;
  return true;
}

/**
 * Formats a resource amount with its canonical emoji (e.g., "50 🪵").
 */
function formatResourceAmount(key: ResourceKey, amount: number): string {
  return `${amount} ${RESOURCE_METAS[key].emoji}`;
}