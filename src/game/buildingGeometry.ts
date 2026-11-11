/**
 * Building footprint geometry — the one leaf owner of the `building.x/y` **centre** convention.
 * Anything new that needs a building's centre or its ground reads it from here.
 */
import type { Building } from './gameTypes';

/** The point a building is centred on: `building.x/y`, whatever the rotation. */
export function getBuildingCenter(building: Pick<Building, 'x' | 'y'>): { x: number; y: number } {
  return { x: building.x, y: building.y };
}

/**
 * World-space rectangle of the ground a building stands on: `x ± w/2`, `y ± h/2` — the same rect
 * the pad, sprite, placement ghost and placement validators use.
 */
export function getBuildingFootprintRect(
  building: Pick<Building, 'x' | 'y' | 'width' | 'height'>,
): { left: number; top: number; right: number; bottom: number } {
  const halfWidth = building.width / 2;
  const halfHeight = building.height / 2;
  return {
    left: building.x - halfWidth,
    top: building.y - halfHeight,
    right: building.x + halfWidth,
    bottom: building.y + halfHeight,
  };
}
