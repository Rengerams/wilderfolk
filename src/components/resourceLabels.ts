// The canonical resource key union and emoji/label metadata live in the game layer
// (`game/resourceTypes.ts`). This module owns only the components-layer label map; the type is
// re-exported (not re-declared) so there is exactly one `ResourceKey` definition, and it stays the
// import path already used by the components in this folder.
import type { ResourceKey } from '../game/resourceTypes';

export type { ResourceKey };

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  wood: 'Wood',
  stone: 'Stone',
  food: 'Food',
  gold: 'Gold',
  iron: 'Iron',
};
