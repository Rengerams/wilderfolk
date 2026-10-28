import type { RivalSettlement } from './gameTypes';

export interface StrategicMapPoint {
  readonly x: number;
  readonly y: number;
}

export interface StrategicMapExtent {
  readonly width: number;
  readonly height: number;
}

export const STRATEGIC_MAP_WIDTH = 1376;
export const STRATEGIC_MAP_HEIGHT = 768;
export const STRATEGIC_VILLAGE_POINT: StrategicMapPoint = { x: 626, y: 342 };

const MAP_RADIUS_X = 420;
const MAP_RADIUS_Y = 210;
const MARKER_BOUNDS = { minX: 160, maxX: 1075, minY: 116, maxY: 565 };
const RIVAL_FOUNDING_RADIUS_RATIO = 0.38;

/** A stable illustration projection, independent of how many camps have spawned. */
export function projectStrategicCamp(
  camp: Pick<RivalSettlement, 'campX' | 'campY'>,
  village: StrategicMapPoint,
  world: StrategicMapExtent,
): StrategicMapPoint {
  const radius = Math.max(1, Math.min(world.width, world.height) * RIVAL_FOUNDING_RADIUS_RATIO);
  const x = STRATEGIC_VILLAGE_POINT.x + ((camp.campX - village.x) / radius) * MAP_RADIUS_X;
  const y = STRATEGIC_VILLAGE_POINT.y + ((camp.campY - village.y) / radius) * MAP_RADIUS_Y;
  return {
    x: Math.max(MARKER_BOUNDS.minX, Math.min(MARKER_BOUNDS.maxX, x)),
    y: Math.max(MARKER_BOUNDS.minY, Math.min(MARKER_BOUNDS.maxY, y)),
  };
}
