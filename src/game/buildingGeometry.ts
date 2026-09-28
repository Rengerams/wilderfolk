/**
 * Building footprint geometry — the one owner of the `building.x/y` **centre** convention.
 *
 * This module is deliberately a **leaf**: it imports only `gameTypes` types and defines no behaviour
 * beyond two pure projections, so `buildingRotation` (which needs the rect) and `placementUtils`
 * (which needs the footprint size) can both depend on it without depending on each other. Before the
 * split, delegating `isEntityOnBuilding` to `placementUtils.getBuildingFootprintRect` closed a runtime
 * import cycle `buildingRotation ↔ placementUtils`, which failed
 * `npm run audit:deps:cycles:strict` (2026-09-20 audit, X-6).
 *
 * ## The convention
 *
 * `building.x/y` **is** the footprint centre, whatever the rotation. The evidence: the pad and sprite
 * are drawn from `x - w/2` / `y - h/2` (`renderer/spriteDrawing.drawBuildingPad`),
 * `overlapsAnyBuilding` compares `b.x ± b.width/2`, `isFootprintWithinMapBounds` and
 * `isFootprintOnBuildableTerrain` take `x ± w/2`, and `snapBuildingCenter` + `createBuilding` store
 * the cursor's centre unchanged. Rotation only swaps the footprint's width and height, so the centre
 * is rotation-independent.
 *
 * Getting this wrong is not hypothetical: the camera-focus callers passed `x + width/2, y + height/2`,
 * which adds half a footprint to a value that already *is* the centre, so "center map on the
 * Blacksmith" landed half a building away (`LIVE-FINDINGS-STATUS.md`, F23); and reading `x … x + width`
 * as the ground under a building cleared a rectangle offset to the south-east, so trees inside the
 * drawn pad survived while trees beside the building vanished.
 *
 * **A whole-tree count on 2026-09-20 found 86 sites still using the corner form (`x + width/2`) and 3
 * using the centre form.** Migrating them is an owner decision, not a drive-by refactor — they span
 * roughly 40 files. Anything new that needs a building's centre or its ground MUST read it from here.
 */
import type { Building } from './gameTypes';

/** The point a building is centred on: `building.x/y`, whatever the rotation. */
export function getBuildingCenter(building: Pick<Building, 'x' | 'y'>): { x: number; y: number } {
  return { x: building.x, y: building.y };
}

/**
 * World-space rectangle of the ground a building stands on: `x ± w/2`, `y ± h/2`.
 *
 * That is the same rectangle the pad, the sprite and the placement ghost are drawn in, and the one
 * `isFootprintWithinMapBounds`, `isFootprintOnBuildableTerrain` and `overlapsAnyBuilding` validate.
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
