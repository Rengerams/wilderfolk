/**
 * The one building access — the doorstep every walker, route, frontage slot and view shares.
 * Chosen from the footprint and the walk grid alone, never from the approaching settler's side.
 */
import { PATH_CELL } from './gameTypes';
import type { Building, Entity } from './gameTypes';
import { getBuildingFootprintRect } from './buildingGeometry';
import { isGroundWalkableAt, isWalkStepAllowed } from './pathfinding';

export type BuildingAccessSide = 'south' | 'east' | 'west' | 'north';

export interface BuildingAccessPoint {
  x: number;
  y: number;
  side: BuildingAccessSide;
}

/** Clearance between the foundation and the doorstep, in world px. */
const BUILDING_ACCESS_STANDOFF_PX = 12;
/** How close to the footprint perimeter counts as reaching the building, in world px. */
const BUILDING_REACH_RADIUS_PX = 24;
/** Outward cells a doorstep may move to leave a neighbouring footprint's tile behind. */
const BUILDING_ACCESS_MAX_OUTWARD_STEPS = 1;
/** Cells of open ground the doorstep must have in front of it to count as a way in. */
const BUILDING_ACCESS_OPEN_CELLS = 2;

/** Fixed side order: the south facade is a building's front, the others only stand in when blocked. */
const BUILDING_ACCESS_SIDES = [
  { side: 'south', normalX: 0, normalY: 1 },
  { side: 'east', normalX: 1, normalY: 0 },
  { side: 'west', normalX: -1, normalY: 0 },
  { side: 'north', normalX: 0, normalY: -1 },
] as const satisfies readonly { side: BuildingAccessSide; normalX: number; normalY: number }[];

/** A doorstep is usable when a walker can stand on it and step away from the wall. */
function isOpenDoorstep(x: number, y: number, normalX: number, normalY: number): boolean {
  if (!isGroundWalkableAt(x, y)) return false;
  const reach = PATH_CELL * BUILDING_ACCESS_OPEN_CELLS;
  const outX = x + normalX * reach;
  const outY = y + normalY * reach;
  return isGroundWalkableAt(outX, outY) && isWalkStepAllowed(x, y, outX, outY);
}

/**
 * The one access of a building: just outside the collision footprint, on the first side whose
 * doorstep is walkable ground with open ground in front of it. Independent of the walker, so
 * route, arrival, porch slots and the dashboard cannot disagree about where the door is.
 */
export function buildingAccessPoint(building: Building): BuildingAccessPoint {
  const rect = getBuildingFootprintRect(building);
  // A fully enclosed building keeps its south front; the path owner reports the blocked walk.
  const front: BuildingAccessPoint = {
    x: building.x,
    y: rect.bottom + BUILDING_ACCESS_STANDOFF_PX,
    side: 'south',
  };
  for (const { side, normalX, normalY } of BUILDING_ACCESS_SIDES) {
    const edgeX = normalX > 0 ? rect.right : normalX < 0 ? rect.left : building.x;
    const edgeY = normalY > 0 ? rect.bottom : normalY < 0 ? rect.top : building.y;
    const baseX = edgeX + normalX * BUILDING_ACCESS_STANDOFF_PX;
    const baseY = edgeY + normalY * BUILDING_ACCESS_STANDOFF_PX;
    for (let step = 0; step <= BUILDING_ACCESS_MAX_OUTWARD_STEPS; step++) {
      const x = baseX + normalX * PATH_CELL * step;
      const y = baseY + normalY * PATH_CELL * step;
      if (isOpenDoorstep(x, y, normalX, normalY)) return { x, y, side };
    }
  }
  return front;
}

/**
 * The one arrival test: the settler stands on walkable ground within reach of any facade, so every
 * side they can actually walk to counts and no caller needs its own distance rule.
 */
export function isAtBuildingReach(entity: Pick<Entity, 'x' | 'y'>, building: Building): boolean {
  const rect = getBuildingFootprintRect(building);
  const nearestX = Math.max(rect.left, Math.min(rect.right, entity.x));
  const nearestY = Math.max(rect.top, Math.min(rect.bottom, entity.y));
  if (Math.hypot(entity.x - nearestX, entity.y - nearestY) > BUILDING_REACH_RADIUS_PX) return false;
  // Halfway ground must be walkable too, or a river/wall between the settler and the facade would
  // count as reach without ever crossing.
  return isGroundWalkableAt(entity.x, entity.y)
    && isGroundWalkableAt((entity.x + nearestX) / 2, (entity.y + nearestY) / 2);
}
