// Components-layer label map only: the key union and metadata live in `game/resourceTypes.ts`, and
// `ResourceKey` is re-exported from here rather than re-declared.
import type { ResourceKey } from '../game/resourceTypes';

export type { ResourceKey };

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  wood: 'Wood',
  stone: 'Stone',
  food: 'Food',
  gold: 'Gold',
  iron: 'Iron',
};
