import type { SpotlightLoreState, WorldState } from '../game/gameTypes';
import { getReadOnlyPathGrid, lineCrossesBlocked } from '../game/pathfinding';
import { PATH_CELL } from '../game/gameTypes';

export interface SpotlightWorldPoint { readonly x: number; readonly y: number }

/** Once-per-scene choice of a clear, short theatrical exit. Never changes saved game coordinates. */
export function spotlightFarewellDestination(
  world: Pick<WorldState, 'worldMap' | 'buildings' | 'width' | 'height'>,
  scene: Pick<SpotlightLoreState, 'gatherX' | 'gatherY' | 'slots'>,
): SpotlightWorldPoint {
  const origin = { x: scene.gatherX, y: scene.gatherY };
  if (!world.worldMap) return origin;
  const grid = getReadOnlyPathGrid(world.worldMap, world.buildings);
  const mean = scene.slots.reduce(
    (point, slot) => ({ x: point.x + slot.x / scene.slots.length, y: point.y + slot.y / scene.slots.length }),
    { x: 0, y: 0 },
  );
  const dx = origin.x - mean.x;
  const dy = origin.y - mean.y;
  const baseAngle = Math.atan2(dy || -1, dx || 0);
  for (const delta of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const angle = baseAngle + delta;
    for (const distance of [32, 24, 16, 8]) {
      const x = origin.x + Math.cos(angle) * distance;
      const y = origin.y + Math.sin(angle) * distance;
      if (x < PATH_CELL || y < PATH_CELL || x > world.width - PATH_CELL || y > world.height - PATH_CELL) continue;
      const col = Math.floor(x / PATH_CELL);
      const row = Math.floor(y / PATH_CELL);
      if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows || grid.blocked[row * grid.cols + col]) continue;
      if (lineCrossesBlocked(grid, origin.x, origin.y, x, y)) continue;
      return { x, y };
    }
  }
  return origin;
}

/** Ease in/out without stranding a sprite at a different authoritative position. */
export function spotlightFarewellPosition(
  origin: SpotlightWorldPoint,
  destination: SpotlightWorldPoint,
  fraction: number,
): SpotlightWorldPoint {
  const t = Math.max(0, Math.min(1, fraction));
  const smooth = t * t * (3 - 2 * t);
  return {
    x: origin.x + (destination.x - origin.x) * smooth,
    y: origin.y + (destination.y - origin.y) * smooth,
  };
}
