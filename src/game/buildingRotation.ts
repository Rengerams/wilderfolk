import { BUILDING_CONFIGS, BuildingType, GRID_SIZE, snapToGrid, type Building, type BuildingConfig } from './gameTypes';

/** Degrees — 0 (horizontal) and 90 (vertical) for straight strips. */
export type BuildingRotation = 0 | 90;

/** L-corner orientation for wall junctions. */
export type CornerRotation = 0 | 90 | 180 | 270;

const ROTATABLE = new Set<BuildingType>([
  BuildingType.Road,
  BuildingType.Wall,
  BuildingType.WallGate,
]);

/** Strip buildings snap along their long axis so segments chain edge-to-edge. */
const STRIP_SNAP_TYPES = new Set<BuildingType>([
  BuildingType.Road,
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

export function isCornerRotation(rotation: unknown): rotation is CornerRotation {
  return rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270;
}

export function toggleBuildingRotation(rotation: BuildingRotation): BuildingRotation {
  return rotation === 0 ? 90 : 0;
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
  return (
    entityX >= building.x - margin
    && entityX <= building.x + building.width + margin
    && entityY >= building.y - margin
    && entityY <= building.y + building.height + margin
  );
}