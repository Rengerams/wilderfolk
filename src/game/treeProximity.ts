import type { Building, Entity } from './gameTypes';
import { EntityType } from './gameTypes';

/** Radius around lumber mill center to count decorative trees. */
export const LUMBER_MILL_TREE_RADIUS = 120;

/**
 * Wood yield bonus from nearby tree entities (decoration with gameplay value).
 * Trees are static and never die, so we simply scan the tree list.
 * 1 tree +25%, 2–3 +30%, 4+ +40%.
 */
export function getLumberMillTreeMultiplier(
  building: Building,
  trees: readonly Entity[],
): number {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const r2 = LUMBER_MILL_TREE_RADIUS * LUMBER_MILL_TREE_RADIUS;
  let count = 0;
  for (const entity of trees) {
    if (entity.type !== EntityType.Tree || !entity.alive) continue;
    const dx = entity.x - cx;
    const dy = entity.y - cy;
    if (dx * dx + dy * dy <= r2) count++;
  }
  if (count >= 4) return 1.4;
  if (count >= 2) return 1.3;
  if (count >= 1) return 1.25;
  return 1;
}
