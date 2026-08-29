import { BuildingType } from './gameTypes';
import type { StripJunctionInfo } from './stripJunction';
import {
  getBuildingFootprintForType,
  snapBuildingCenter,
  type BuildingRotation,
  type CornerRotation,
} from './buildingRotation';

export const STRIP_BUILD_TYPES = new Set<BuildingType>([
  BuildingType.Road,
  BuildingType.Wall,
  BuildingType.WallGate,
  BuildingType.Fence,
]);

export const MAX_STRIP_SEGMENTS = 72;

export interface StripSegment {
  readonly x: number;
  readonly y: number;
  readonly valid: boolean;
  /** Resolved piece type (e.g. wall, corner, gate, road). */
  readonly placeType: BuildingType;
  readonly rotation: BuildingRotation | CornerRotation;
  /** Tee, cross, or elbow topology for procedural junction rendering. */
  readonly junctionInfo?: StripJunctionInfo;
  /** Existing building to be demolished/replaced (refunded at 50%). */
  readonly replacesBuildingId?: number;
}

export interface EnclosedArea {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface StripBuildPreview {
  readonly segments: readonly StripSegment[];
  readonly rotation: BuildingRotation;
  /** Regions fully enclosed by walls (preview + existing). */
  readonly enclosedAreas?: readonly EnclosedArea[];
}

/**
 * Returns true if the building type supports multi-tile drag placement.
 */
export function isStripBuildType(type: BuildingType): boolean {
  return STRIP_BUILD_TYPES.has(type);
}

/**
 * Infers horizontal (0°) vs. vertical (90°) placement rotation from the drag vector.
 */
export function inferStripRotation(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): BuildingRotation {
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  return dx >= dy ? 0 : 90;
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Computes contiguous, grid-snapped segment centers along a drag vector.
 * Preserves drag direction, eliminates floating-point drift, and clamps cleanly to MAX_STRIP_SEGMENTS.
 */
export function computeStripSegmentCenters(
  type: BuildingType,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  rotation: BuildingRotation,
): Point2D[] {
  const start = snapBuildingCenter(type, startX, startY, rotation);
  const end = snapBuildingCenter(type, endX, endY, rotation);
  const { width, height } = getBuildingFootprintForType(type, rotation);
  const pitch = Math.max(width, height);

  if (pitch <= 0) return [start];

  const centers: Point2D[] = [];

  if (rotation === 0) {
    const totalDist = Math.abs(end.x - start.x);
    const stepDir = end.x >= start.x ? 1 : -1;
    const rawSteps = Math.round(totalDist / pitch);
    const totalSteps = Math.min(MAX_STRIP_SEGMENTS - 1, Math.max(0, rawSteps));

    for (let i = 0; i <= totalSteps; i++) {
      centers.push({
        x: start.x + i * pitch * stepDir,
        y: start.y,
      });
    }
  } else {
    const totalDist = Math.abs(end.y - start.y);
    const stepDir = end.y >= start.y ? 1 : -1;
    const rawSteps = Math.round(totalDist / pitch);
    const totalSteps = Math.min(MAX_STRIP_SEGMENTS - 1, Math.max(0, rawSteps));

    for (let i = 0; i <= totalSteps; i++) {
      centers.push({
        x: start.x,
        y: start.y + i * pitch * stepDir,
      });
    }
  }

  return centers;
}
