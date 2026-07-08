import type { Building, Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import type { EntitySpatialGrid } from './spatialGrid';
import { syncSpatialGridEntity } from './spatialGrid';
import { forEachInEntityGrid } from './tickQueries';

/** Radius around lumber mill center to count decorative trees. */
export const LUMBER_MILL_TREE_RADIUS = 120;

/** Keep tree spatial index aligned on spawn/death (trees are static — no per-tick sim). */
export function syncTreeSpatialIndex(state: WorldState, entity: Entity): void {
  if (entity.type !== EntityType.Tree) return;
  syncSpatialGridEntity(entity, undefined, undefined, state.treeGrid);
}

/**
 * Wood yield bonus from nearby tree entities (decoration with gameplay value).
 * 1 tree +25%, 2–3 +30%, 4+ +40%.
 */
export function getLumberMillTreeMultiplier(
  building: Building,
  treeGrid: EntitySpatialGrid | undefined,
  trees?: readonly Entity[],
): number {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  let count = 0;
  forEachInEntityGrid(
    treeGrid,
    cx,
    cy,
    LUMBER_MILL_TREE_RADIUS,
    (entity) => {
      if (entity.type === EntityType.Tree && entity.alive) count++;
    },
    'lumber_trees',
    trees,
  );
  if (count >= 4) return 1.4;
  if (count >= 2) return 1.3;
  if (count >= 1) return 1.25;
  return 1;
}