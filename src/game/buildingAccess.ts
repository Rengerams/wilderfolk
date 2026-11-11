/**
 * Canonical building access geometry: every reachable facade has a valid stand point.
 * The selected approach may vary with the settler; arrival uses one shared reach rule.
 */
import { PATH_CELL } from './gameTypes';
import type { Building, Entity } from './gameTypes';
import { getBuildingFootprintRect } from './buildingGeometry';
import { getCurrentPathGrid, isGroundWalkableAt, isWalkStepAllowed, type PathGrid } from './pathfinding';

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
function isOpenDoorstep(x: number, y: number, normalX: number, normalY: number, grid: PathGrid | null): boolean {
  if (!isGroundWalkableAt(x, y, grid)) return false;
  const reach = PATH_CELL * BUILDING_ACCESS_OPEN_CELLS;
  const outX = x + normalX * reach;
  const outY = y + normalY * reach;
  return isGroundWalkableAt(outX, outY, grid) && isWalkStepAllowed(x, y, outX, outY, grid);
}

/**
 * Every facade that has a walkable, reachable access point. Order is deterministic for stable
 * presentation: the first entry remains the canonical south-first frontage used by UI consumers.
 * Movement can choose another entry when arriving from another side or when a wall blocks one side.
 */
export function buildingAccessPoints(building: Building, grid: PathGrid | null = getCurrentPathGrid()): BuildingAccessPoint[] {
  const rect = getBuildingFootprintRect(building);
  const points: BuildingAccessPoint[] = [];
  for (const { side, normalX, normalY } of BUILDING_ACCESS_SIDES) {
    const edgeX = normalX > 0 ? rect.right : normalX < 0 ? rect.left : building.x;
    const edgeY = normalY > 0 ? rect.bottom : normalY < 0 ? rect.top : building.y;
    const baseX = edgeX + normalX * BUILDING_ACCESS_STANDOFF_PX;
    const baseY = edgeY + normalY * BUILDING_ACCESS_STANDOFF_PX;
    for (let step = 0; step <= BUILDING_ACCESS_MAX_OUTWARD_STEPS; step++) {
      const x = baseX + normalX * PATH_CELL * step;
      const y = baseY + normalY * PATH_CELL * step;
      if (isOpenDoorstep(x, y, normalX, normalY, grid) && isAtBuildingReach({ x, y }, building, grid)) {
        points.push({ x, y, side });
        break;
      }
    }
  }
  return points;
}

/**
 * Canonical stable frontage for house/venue presentation and distance estimates.
 * A fully enclosed building retains its south marker, but movement only selects the
 * validated candidates from buildingAccessPoints and never walks toward this fallback.
 */
export function buildingAccessPoint(building: Building, grid: PathGrid | null = getCurrentPathGrid()): BuildingAccessPoint {
  const rect = getBuildingFootprintRect(building);
  return buildingAccessPoints(building, grid)[0] ?? {
    x: building.x,
    y: rect.bottom + BUILDING_ACCESS_STANDOFF_PX,
    side: 'south',
  };
}

/**
 * The one arrival test: the settler stands on walkable ground within reach of any facade, so every
 * side they can actually walk to counts and no caller needs its own distance rule.
 */
export function isAtBuildingReach(entity: Pick<Entity, 'x' | 'y'>, building: Building, grid: PathGrid | null = getCurrentPathGrid()): boolean {
  const rect = getBuildingFootprintRect(building);
  const nearestX = Math.max(rect.left, Math.min(rect.right, entity.x));
  const nearestY = Math.max(rect.top, Math.min(rect.bottom, entity.y));
  if (Math.hypot(entity.x - nearestX, entity.y - nearestY) > BUILDING_REACH_RADIUS_PX) return false;
  // Halfway ground must be walkable too, or a river/wall between the settler and the facade would
  // count as reach without ever crossing.
  return isGroundWalkableAt(entity.x, entity.y, grid)
    && isGroundWalkableAt((entity.x + nearestX) / 2, (entity.y + nearestY) / 2, grid);
}
