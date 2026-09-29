import { BUILDING_CONFIGS, BuildingType, GRID_SIZE, snapToGrid, type Building, type BuildingConfig } from './gameTypes';
import { getBuildingFootprintRect } from './buildingGeometry';

/** Degrees — 0 (horizontal) and 90 (vertical) for straight strips. */
export type BuildingRotation = 0 | 90;

/** L-corner orientation for wall junctions. */
export type CornerRotation = 0 | 90 | 180 | 270;

/**
 * Types whose rotation the player may change.
 *
 * `BuildingRotation` is `0 | 90` and a 90° turn is applied by rotating the **sprite** (`spriteDrawing`),
 * which is the right meaning for a flat strip — the run axis — and the wrong one for a building drawn
 * with height. A Watchtower at 90 was therefore drawn lying on its side, and the `flipX` special case in
 * `renderer/buildings.ts` existed only to mirror that sideways sprite into something plausible. The
 * Watchtower is out of this set: its art has one correct orientation, so the rotate key does nothing for
 * it rather than tipping it over. `Bridge` is still in the set and is **not** a strip type either, so it
 * has the same defect — left as-is pending an owner decision.
 */
const ROTATABLE = new Set<BuildingType>([
  BuildingType.Road,
  BuildingType.Bridge,
  BuildingType.Wall,
  BuildingType.WallGate,
]);

/** Strip buildings snap along their long axis so segments chain edge-to-edge. */
const STRIP_SNAP_TYPES = new Set<BuildingType>([
  BuildingType.Road,
  BuildingType.Bridge,
  BuildingType.Wall,
  BuildingType.WallGate,
]);

export function isRotatableBuildingType(type: BuildingType): boolean {
  return ROTATABLE.has(type);
}

export function normalizeBuildingRotation(rotation: unknown): BuildingRotation {
  return rotation === 90 ? 90 : 0;
}

export function normalizeCornerRotation(rotation: unknown): CornerRotation {
  if (rotation === 90 || rotation === 180 || rotation === 270) return rotation;
  return 0;
}

export function toggleBuildingRotation(rotation: BuildingRotation): BuildingRotation {
  return rotation === 0 ? 90 : 0;
}

/**
 * The rotation to actually apply to a building — its stored rotation when the player may rotate that
 * type, and none otherwise.
 *
 * `BuildingRotation` is a **run axis** for a flat strip and a **sprite rotation** for everything else,
 * which is why a Watchtower at 90 was drawn lying on its side. Rotating is only offered for the types
 * in `ROTATABLE`, and selecting a build type resets `buildRotation` to 0 (`App.tsx`), so a rotation on
 * a non-rotatable building can only come from an older save — where it must still not be applied, or
 * that tower draws into the ground. One definition, so the completed pass and the construction pass
 * cannot disagree about which way a building faces.
 */
export function effectiveBuildingRotation(type: BuildingType, rotation: unknown): BuildingRotation {
  return isRotatableBuildingType(type) ? normalizeBuildingRotation(rotation) : 0;
}

export function getBuildingFootprint(
  config: Pick<BuildingConfig, 'width' | 'height'>,
  rotation: BuildingRotation | CornerRotation = 0,
): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: config.height, height: config.width };
  }
  return { width: config.width, height: config.height };
}

export function getBuildingFootprintForType(
  type: BuildingType,
  rotation: BuildingRotation | CornerRotation = 0,
): { width: number; height: number } {
  return getBuildingFootprint(BUILDING_CONFIGS[type], rotation);
}

export function snapBuildingCenter(
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation | CornerRotation = 0,
): { x: number; y: number } {
  const { width, height } = getBuildingFootprintForType(type, rotation);
  if (STRIP_SNAP_TYPES.has(type)) {
    if (width >= height) {
      return {
        x: Math.round(x / width) * width,
        y: snapToGrid(y, GRID_SIZE),
      };
    }
    return {
      x: snapToGrid(x, GRID_SIZE),
      y: Math.round(y / height) * height,
    };
  }
  return { x: snapToGrid(x, GRID_SIZE), y: snapToGrid(y, GRID_SIZE) };
}

export function isEntityOnBuilding(entityX: number, entityY: number, building: Building, margin = 12): boolean {
  // `building.x/y` is the footprint centre (`placementUtils.getBuildingCenter`), so the ground the
  // building stands on is the owner's rect, padded outwards by `margin`. Reading `x … x + width` here
  // treated the stored point as the top-left corner: for a 53 × 46 Farm it accepted ground up to
  // 13.5 px outside the drawn pad on the east/south and missed the whole west/north half, so
  // `isInsideCompletedBuilding` let settlers spawn inside a house and the cure-window sweep read a
  // howler in that half as outdoors (`LIVE-FINDINGS-STATUS.md`, X-6 / PARKED-1). The comparisons stay
  // inclusive at the padded edge, as the corner form's `>=`/`<=` were.
  const rect = getBuildingFootprintRect(building);
  return (
    entityX >= rect.left - margin
    && entityX <= rect.right + margin
    && entityY >= rect.top - margin
    && entityY <= rect.bottom + margin
  );
}