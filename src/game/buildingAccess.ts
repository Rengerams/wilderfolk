/**
 * Canonical building access geometry: every reachable facade has a valid stand point.
 * The selected approach may vary with the settler; arrival uses one shared reach rule.
 */
import { PATH_CELL } from './gameTypes';
import type { Building, Entity } from './gameTypes';
import { getBuildingFootprintRect } from './buildingGeometry';
import { getTerrainRevision } from './terrain/terrainGrid';
import { getCurrentPathGrid, isGroundWalkableAt, isWalkStepAllowed, type PathGrid } from './pathfinding';

type BuildingAccessSide = 'south' | 'east' | 'west' | 'north';

export interface BuildingAccessPoint {
  x: number;
  y: number;
  side: BuildingAccessSide;
}

/** Clearance between the foundation and the doorstep, in world px. */
const BUILDING_ACCESS_STANDOFF_PX = 12;
/** How close to the footprint perimeter counts as reaching the building, in world px. */
export const BUILDING_REACH_RADIUS_PX = 24;
/** Outward cells a doorstep may move to leave a neighbouring footprint's tile behind. */
const BUILDING_ACCESS_MAX_OUTWARD_STEPS = 1;

/**
 * Footprint stamping marks every touched cell, even when its centre lies just outside the wall, so a
 * cell that only partly overlaps the building is the wall itself rather than the street beside it.
 */
function cellOverlapsFootprint(
  rect: { left: number; top: number; right: number; bottom: number },
  tx: number,
  ty: number,
): boolean {
  return (tx + 1) * PATH_CELL > rect.left && tx * PATH_CELL < rect.right
    && (ty + 1) * PATH_CELL > rect.top && ty * PATH_CELL < rect.bottom;
}

/**
 * A doorstep is usable when the walker can step off it: one walkable orthogonal neighbour outside
 * the building's own stamped footprint. Requiring open ground straight out made every street
 * narrower than the standoff plus two cells a dead end, so a house packed between neighbours had
 * no door at all and its owner stood at the wall forever.
 */
function doorstepHasExit(building: Building, x: number, y: number, grid: PathGrid): boolean {
  const rect = getBuildingFootprintRect(building);
  const tx = Math.floor(x / PATH_CELL);
  const ty = Math.floor(y / PATH_CELL);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
    if (grid.blocked[ny * grid.cols + nx]) continue;
    if (cellOverlapsFootprint(rect, nx, ny)) continue;
    if (isWalkStepAllowed(x, y, (nx + 0.5) * PATH_CELL, (ny + 0.5) * PATH_CELL, grid)) return true;
  }
  return false;
}

/** Deterministic enumeration only; any side may be entered when its approach is actually clear. */
const BUILDING_ACCESS_SIDES = [
  { side: 'south', normalX: 0, normalY: 1 },
  { side: 'east', normalX: 1, normalY: 0 },
  { side: 'west', normalX: -1, normalY: 0 },
  { side: 'north', normalX: 0, normalY: -1 },
] as const satisfies readonly { side: BuildingAccessSide; normalX: number; normalY: number }[];

/**
 * Check every cell from the actual facade to the proposed stand point. A stand point beyond
 * an immediate river or wall must not count as an entrance, even if its own tile is dry.
 * The terrain-only mask distinguishes a building's overlapping footprint from a water cell.
 */
function isOpenDoorstep(
  building: Building, edgeX: number, edgeY: number,
  x: number, y: number, normalX: number, normalY: number, grid: PathGrid | null,
): boolean {
  if (!isGroundWalkableAt(x, y, grid)) return false;
  if (!grid) return true;
  if (!doorstepHasExit(building, x, y, grid)) return false;
  const rect = getBuildingFootprintRect(building);
  const length = Math.hypot(x - edgeX, y - edgeY);
  for (let distance = PATH_CELL / 4; distance <= length; distance += PATH_CELL / 4) {
    const px = edgeX + normalX * distance;
    const py = edgeY + normalY * distance;
    const tx = Math.floor(px / PATH_CELL);
    const ty = Math.floor(py / PATH_CELL);
    if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) return false;
    const index = ty * grid.cols + tx;
    if (grid.terrainBlocked?.[index]) return false;
    // Exempt the building's own partial edge cells from its collision mask.
    if (grid.blocked[index] && !cellOverlapsFootprint(rect, tx, ty)) return false;
  }
  return true;
}

/**
 * A street narrower than the doorstep standoff leaves the fixed offset inside a neighbour, so the
 * nearest open point outward is the stand the walker's body still fits on. Every open side keeps
 * an entrance instead of the building losing that approach.
 */
function nearestOpenStandPoint(
  building: Building, edgeX: number, edgeY: number,
  normalX: number, normalY: number, grid: PathGrid | null,
): { x: number; y: number } | null {
  if (!grid) return null;
  for (let distance = PATH_CELL / 2; distance <= BUILDING_REACH_RADIUS_PX; distance += PATH_CELL / 2) {
    const x = edgeX + normalX * distance;
    const y = edgeY + normalY * distance;
    if (isOpenDoorstep(building, edgeX, edgeY, x, y, normalX, normalY, grid)) return { x, y };
  }
  return null;
}

/**
 * Cached facade validation: one probe per building per path-grid generation, not per settler per
 * tick. The grid object identity changes whenever terrain or footprints are rebaked.
 */
interface AccessPointsMemo {
  grid: PathGrid | null;
  terrainRevision: number;
  footprint: string;
  points: BuildingAccessPoint[];
}

const accessPointsMemo = new WeakMap<Building, AccessPointsMemo>();

function computeBuildingAccessPoints(building: Building, grid: PathGrid | null): BuildingAccessPoint[] {
  const rect = getBuildingFootprintRect(building);
  const points: BuildingAccessPoint[] = [];
  for (const { side, normalX, normalY } of BUILDING_ACCESS_SIDES) {
    // Sample each open facade at path-cell intervals so side obstacles cannot hide other entrances.
    // The per-grid memo avoids repeated probes.
    const length = normalX === 0 ? building.width : building.height;
    const maxOffset = Math.max(0, length / 2 - PATH_CELL / 2);
    const offsets = [0];
    for (let d = PATH_CELL; d <= maxOffset; d += PATH_CELL) offsets.push(-d, d);
    const edgeAt = (offset: number) => ({
      edgeX: (normalX > 0 ? rect.right : normalX < 0 ? rect.left : building.x) - normalY * offset,
      edgeY: (normalY > 0 ? rect.bottom : normalY < 0 ? rect.top : building.y) + normalX * offset,
    });
    const sidePoints: BuildingAccessPoint[] = [];
    for (const offset of offsets) {
      const { edgeX, edgeY } = edgeAt(offset);
      for (let step = 0; step <= BUILDING_ACCESS_MAX_OUTWARD_STEPS; step++) {
        const x = edgeX + normalX * (BUILDING_ACCESS_STANDOFF_PX + step * PATH_CELL);
        const y = edgeY + normalY * (BUILDING_ACCESS_STANDOFF_PX + step * PATH_CELL);
        if (isOpenDoorstep(building, edgeX, edgeY, x, y, normalX, normalY, grid)
          && Math.hypot(x - edgeX, y - edgeY) <= BUILDING_REACH_RADIUS_PX) {
          sidePoints.push({ x, y, side });
          break;
        }
      }
    }
    // A side whose whole frontage is narrower than the standoff still keeps one entrance, but a
    // side that already has a proper doorstep never gains a stand squeezed against the wall.
    if (sidePoints.length === 0) {
      for (const offset of offsets) {
        const { edgeX, edgeY } = edgeAt(offset);
        const narrow = nearestOpenStandPoint(building, edgeX, edgeY, normalX, normalY, grid);
        if (narrow && !sidePoints.some((point) => point.x === narrow.x && point.y === narrow.y)) {
          sidePoints.push({ ...narrow, side });
        }
      }
    }
    points.push(...sidePoints);
  }
  return points;
}

/**
 * Walkable frontage samples along every open building side. Order is deterministic for stable
 * presentation: the first entry remains the canonical south-first frontage used by UI consumers.
 * Movement can choose another entry when arriving from another side or when a wall blocks one side.
 */
export function buildingAccessPoints(building: Building, grid: PathGrid | null = getCurrentPathGrid()): BuildingAccessPoint[] {
  const terrainRevision = getTerrainRevision();
  const footprint = `${building.x}|${building.y}|${building.width}|${building.height}`;
  const memo = accessPointsMemo.get(building);
  if (memo && memo.grid === grid && memo.terrainRevision === terrainRevision
    && memo.footprint === footprint) {
    return memo.points;
  }
  const points = computeBuildingAccessPoints(building, grid);
  accessPointsMemo.set(building, { grid, terrainRevision, footprint, points });
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
  if (!isGroundWalkableAt(entity.x, entity.y, grid)) return false;
  const rect = getBuildingFootprintRect(building);
  const nearestX = Math.max(rect.left, Math.min(rect.right, entity.x));
  const nearestY = Math.max(rect.top, Math.min(rect.bottom, entity.y));
  if (Math.hypot(entity.x - nearestX, entity.y - nearestY) > BUILDING_REACH_RADIUS_PX) return false;
  // Bare-world fixtures have no obstacle map: use the established all-facade reach contract.
  // With a map, the selected facade must also be a validated approach, never a blocked wall.
  if (!grid) return true;
  return buildingAccessPoints(building, grid).some((point) =>
    Math.hypot(point.x - entity.x, point.y - entity.y) <= BUILDING_REACH_RADIUS_PX
    && isWalkStepAllowed(entity.x, entity.y, point.x, point.y, grid));
}
