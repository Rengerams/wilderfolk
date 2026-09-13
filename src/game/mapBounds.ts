/**
 * Map boundary rule — one owner for "a moving entity stays inside the map".
 *
 * Both the human tick and the systems layer advance entity positions, so the
 * clamp lives here instead of being restated per layer. The rule is a hard
 * spatial invariant, not a per-species behavior: an entity that leaves the map
 * can never be reached by pathfinding, selection, or rendering again.
 */
import type { Entity } from './gameTypes';

/** Clamps a moving entity's position onto the inclusive `0..width` / `0..height` map rectangle. */
export function clampToMapBounds(
  entity: Pick<Entity, 'x' | 'y'>,
  width: number,
  height: number,
): void {
  if (entity.x < 0) entity.x = 0;
  if (entity.x > width) entity.x = width;
  if (entity.y < 0) entity.y = 0;
  if (entity.y > height) entity.y = height;
}
