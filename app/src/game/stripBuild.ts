import { BuildingType } from './gameTypes';
import type { EnclosedArea } from './stripTopology';
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
]);

export const MAX_STRIP_SEGMENTS = 72;

export interface StripSegment {
  x: number;
  y: number;
  valid: boolean;
  /** Resolved piece type (wall, corner, gate, road). */
  placeType: BuildingType;
  rotation: BuildingRotation | CornerRotation;
  /** Tee/cross/elbow topology for procedural junction rendering. */
  junctionInfo?: StripJunctionInfo;
  /** Existing building removed when placing (refunded at 50%). */
  replacesBuildingId?: number;
}

export interface StripBuildPreview {
  segments: StripSegment[];
  rotation: BuildingRotation;
  /** Regions fully enclosed by walls (preview + existing). */
  enclosedAreas?: EnclosedArea[];
}

export function isStripBuildType(type: BuildingType): boolean {
  return STRIP_BUILD_TYPES.has(type);
}

/** Pick horizontal vs vertical from drag vector (R still overrides in UI). */
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

export function computeStripSegmentCenters(
  type: BuildingType,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  rotation: BuildingRotation,
): { x: number; y: number }[] {
  const start = snapBuildingCenter(type, startX, startY, rotation);
  const end = snapBuildingCenter(type, endX, endY, rotation);
  const { width, height } = getBuildingFootprintForType(type, rotation);
  const along = Math.max(width, height);

  let centers: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    const snapped = snapBuildingCenter(type, x, y, rotation);
    const key = `${snapped.x},${snapped.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    centers.push(snapped);
  };

  if (rotation === 0) {
    const y = start.y;
    const xMin = Math.min(start.x, end.x);
    const xMax = Math.max(start.x, end.x);
    for (let x = xMin; x <= xMax + 0.01; x += along) {
      push(x, y);
    }
    if (centers.length === 0) push(start.x, y);
    if (Math.abs(end.x - centers[centers.length - 1].x) > along * 0.35) {
      push(end.x, y);
    }
  } else {
    const x = start.x;
    const yMin = Math.min(start.y, end.y);
    const yMax = Math.max(start.y, end.y);
    for (let y = yMin; y <= yMax + 0.01; y += along) {
      push(x, y);
    }
    if (centers.length === 0) push(x, start.y);
    if (Math.abs(end.y - centers[centers.length - 1].y) > along * 0.35) {
      push(x, end.y);
    }
  }

  if (centers.length > MAX_STRIP_SEGMENTS) {
    const end = centers[centers.length - 1];
    centers = centers.slice(0, MAX_STRIP_SEGMENTS - 1);
    centers.push(end);
  }
  return centers;
}

