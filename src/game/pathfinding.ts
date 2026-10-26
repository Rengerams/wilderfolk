/**
 * Grid pathfinding over the terrain map — settlers/visitors stop walking in
 * straight lines through rivers and mountains.
 *
 * Design: the map's cached walkability grid owns walls, gates, roads and bridges.
 * Bounded A* routes around obstacles and chooses profitable road detours. Routes
 * are cached by walker; no route means stop rather than walk through a barrier.
 *
 * Occupancy and slope both come from Teraforge's four-layer model: the L0 path
 * grid decides what blocks a step, and the tile's projected elevation decides
 * what a step costs (`CLIFF_STEP` retires the old "water only" rule, which could
 * not express an unclimbable cliff).
 */
import type { Building, Entity, WorldMap } from './gameTypes';
import { BuildingType, PATH_CELL } from './gameTypes';
import {
  Walkability,
  isWalkableTerrainType,
  tileAt,
} from './terrain/terrainGrid';
import { profileStart, profileEnd } from './performanceProfiler';
import {
  recordFindPathCall,
  recordGridRebuild,
  recordLineCheck,
  recordPathCacheHit,
  recordPathCacheMiss,
  recordPathEarlyReject,
  recordPathFailed,
  recordPathFound,
  recordPathMaxNodesExceeded,
  recordPathNodes,
} from './pathfindingMetrics';
import { faceVelocity, ROAD_SPEED_MULT } from './simulation/movementSteering';

/** Slope cost per unit elevation (0–100 scale) — steep climbs tax the route. */
const SLOPE_UP_COST = 0.015;
const SLOPE_DOWN_COST = 0.004;
/** Single-tile elevation step (0–100 scale) above which the edge is an impassable cliff. */
const CLIFF_STEP = 32;
/** A road tile costs this fraction of a normal step — exactly the travel time the road speed saves. */
const ROAD_STEP_COST = 1 / ROAD_SPEED_MULT;
const PATH_MAX_SEARCH_NODES = 6000;
const PATH_ARRIVAL_DISTANCE_PX = 8;
const ROAD_ROUTE_MIN_DISTANCE_PX = 150;
const ROAD_ROUTE_MIN_TIME_SAVING = 0.95;
const ROAD_DETOUR_RECHECK_TILES = 20;

/** Completed player walls block walking; gates are passable openings. */
function isBlockingWall(b: Building): boolean {
  return b.completed && b.type === BuildingType.Wall;
}

/** Completed player roads and bridges: walkable, and cheaper than open ground. */
function isWalkableRoad(b: Building): boolean {
  return (
    b.completed &&
    b.faction !== 'rival' &&
    (b.type === BuildingType.Road || b.type === BuildingType.Bridge)
  );
}

/** Stamps `value` over every grid tile a building's footprint covers, clamped to the grid. */
function stampBuildingFootprint(
  grid: Uint8Array,
  cols: number,
  rows: number,
  b: Building,
  value = 1,
): void {
  // Building positions are centres, not top-left corners. The walking mask must
  // cover the same footprint that placement and rendering use.
  const x0 = Math.max(0, Math.floor((b.x - b.width / 2) / PATH_CELL));
  const y0 = Math.max(0, Math.floor((b.y - b.height / 2) / PATH_CELL));
  const x1 = Math.min(cols - 1, Math.ceil((b.x + b.width / 2) / PATH_CELL) - 1);
  const y1 = Math.min(rows - 1, Math.ceil((b.y + b.height / 2) / PATH_CELL) - 1);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      grid[y * cols + x] = value;
    }
  }
}

/** Lightweight signature of the buildings matching `matches`, so the grid rebuilds only when they change. */
function buildingSignature(
  buildings: Building[] | undefined,
  matches: (b: Building) => boolean,
): string {
  if (!buildings?.length) return '';
  let hash = 0;
  let count = 0;
  for (const b of buildings) {
    if (!matches(b)) continue;
    hash = (hash + b.id * 31 + Math.round(b.x) * 17 + Math.round(b.y) * 13 + (b.rotation ?? 0) * 7) >>> 0;
    count++;
  }
  return `${count}:${hash}`;
}

export interface PathGrid {
  cols: number;
  rows: number;
  blocked: Uint8Array;
  /** Per-tile elevation (0–100) for slope-aware A*. Absent on legacy maps. */
  elevation?: Float32Array;
  /** 1 on every tile a completed road or bridge covers. Absent when the map has none. */
  road?: Uint8Array;
}

let gridCache: PathGrid | null = null;
let gridCacheSeed = '';

/**
 * The passability grid's cache identity. The seed alone does not identify the tiles: two maps can
 * share a seed and size while a different preset produces different terrain, and buildings that
 * block or cheapen a step change the grid too — so the signature carries all of them.
 */
function pathGridCacheKey(map: WorldMap, buildings?: Building[]): string {
  const seed = typeof map.seed === 'number' ? map.seed : 1;
  const walls = buildingSignature(buildings, isBlockingWall);
  const roads = buildingSignature(buildings, isWalkableRoad);
  return `${seed}|${map.preset}|${walls}|${roads}|${map.width}x${map.height}`;
}

/**
 * The one place a passability grid is built. Both accessors below share the blocked-terrain
 * and wall rules — they differ only in who owns the cache.
 */
function buildPathGrid(map: WorldMap, buildings?: Building[]): PathGrid {
  const cols = map.width;
  const rows = map.height;
  const blocked = new Uint8Array(cols * rows);
  const elevation = new Float32Array(cols * rows);

  // Teraforge's L0 path grid is the authoritative occupancy layer for a generated map:
  // water from the tile classification plus any cell the L3 decor pass reserved. Maps
  // without one (test fixtures, hand-built maps) fall back to the tile owner, so both
  // representations answer "can a walker stand here?" through one rule.
  const hasPathGrid = !!map.pathGrid && map.pCols === cols && map.pRows === rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const t = tileAt(map, x, y);
      if (!t) continue;
      elevation[i] = t.elevation;
      blocked[i] = hasPathGrid
        ? (map.pathGrid![i] !== Walkability.Open ? 1 : 0)
        : (isWalkableTerrainType(t.type) ? 0 : 1);
    }
  }
  let road: Uint8Array | null = null;
  if (buildings) {
    // Bridges open water first. Walls always win at overlapping footprints,
    // regardless of building array order. A gate remains an intentional gap.
    for (const b of buildings) {
      if (!isWalkableRoad(b)) continue;
      road ??= new Uint8Array(cols * rows);
      stampBuildingFootprint(road, cols, rows, b);
      stampBuildingFootprint(blocked, cols, rows, b, 0);
    }
    for (const b of buildings) {
      if (isBlockingWall(b)) stampBuildingFootprint(blocked, cols, rows, b);
    }
  }
  return road ? { cols, rows, blocked, elevation, road } : { cols, rows, blocked, elevation };
}

/** The simulation's grid. `setCurrentPathMap` swaps `currentGrid` and clears the waypoint cache. */
export function getPathGrid(map: WorldMap, buildings?: Building[]): PathGrid {
  const cacheKey = pathGridCacheKey(map, buildings);
  if (gridCache && gridCacheSeed === cacheKey) {
    return gridCache;
  }
  recordGridRebuild();
  gridCache = buildPathGrid(map, buildings);
  gridCacheSeed = cacheKey;
  return gridCache;
}

/**
 * A **second**, independent cache of the same grid for consumers that must not disturb the
 * simulation — today the logistics overlay's blocked-path classification.
 *
 * Why this exists rather than reusing {@link getPathGrid}: `setCurrentPathMap` treats a change of
 * the shared grid's *identity* as a new map and calls `pathCache.clear()`. The logistics overlay is
 * recomputed on every render snapshot, and it passes its own `buildings` array, so a projection
 * calling `getPathGrid` would flip the identity back and forth and clear the simulation's waypoint
 * cache from the render path — a simulation side-effect produced by a read-only projection, which
 * the architecture forbids ("the renderer decides nothing"). This accessor therefore touches
 * neither `gridCache` nor `gridCacheSeed`, and additionally skips {@link recordGridRebuild} so the
 * pathfinder metric keeps counting *simulation* grid builds only.
 */
let readOnlyGridCache: PathGrid | null = null;
let readOnlyGridCacheSeed = '';

export function getReadOnlyPathGrid(map: WorldMap, buildings?: Building[]): PathGrid {
  const cacheKey = pathGridCacheKey(map, buildings);
  if (readOnlyGridCache && readOnlyGridCacheSeed === cacheKey) {
    return readOnlyGridCache;
  }
  readOnlyGridCache = buildPathGrid(map, buildings);
  readOnlyGridCacheSeed = cacheKey;
  return readOnlyGridCache;
}

/**
 * Find the closest world-space stand point for an entity restored onto blocked ground.
 *
 * The same grid used by movement is authoritative here: water, reserved decor and completed walls
 * are all rejected, while a bridge or road can make its covered cells valid again.
 */
export function nearestWalkableWorldPoint(
  map: WorldMap,
  buildings: Building[] | undefined,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const grid = getReadOnlyPathGrid(map, buildings);
  const startX = Math.max(0, Math.min(grid.cols - 1, Math.floor(x / PATH_CELL)));
  const startY = Math.max(0, Math.min(grid.rows - 1, Math.floor(y / PATH_CELL)));
  const startIndex = startY * grid.cols + startX;
  if (grid.blocked[startIndex] === 0) return { x, y };
  const maxRadius = Math.max(grid.cols, grid.rows);
  for (let radius = 1; radius <= maxRadius; radius++) {
    let best: { x: number; y: number; distance: number } | null = null;
    const minX = Math.max(0, startX - radius);
    const maxX = Math.min(grid.cols - 1, startX + radius);
    const minY = Math.max(0, startY - radius);
    const maxY = Math.min(grid.rows - 1, startY + radius);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (Math.max(Math.abs(tx - startX), Math.abs(ty - startY)) !== radius) continue;
        if (grid.blocked[ty * grid.cols + tx] !== 0) continue;
        const point = { x: tx * PATH_CELL + PATH_CELL / 2, y: ty * PATH_CELL + PATH_CELL / 2 };
        const distance = Math.hypot(point.x - x, point.y - y);
        if (!best || distance < best.distance) best = { ...point, distance };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return null;
}

/** Test seam: drop both grid caches so a case starts from a known state. */
export function resetPathGridCaches(): void {
  gridCache = null;
  gridCacheSeed = '';
  readOnlyGridCache = null;
  readOnlyGridCacheSeed = '';
  searchWorkspace = undefined;
}

interface PathSearchWorkspace {
  scores: Float64Array;
  parents: Int32Array;
  stamps: Uint32Array;
  generation: number;
}

let searchWorkspace: PathSearchWorkspace | undefined;

/** Searches are synchronous; one bounded workspace serves the active grid in each realm. */
function beginPathSearch(cellCount: number): PathSearchWorkspace {
  if (!searchWorkspace || searchWorkspace.scores.length !== cellCount) {
    searchWorkspace = {
      scores: new Float64Array(cellCount),
      parents: new Int32Array(cellCount),
      stamps: new Uint32Array(cellCount),
      generation: 0,
    };
  }
  searchWorkspace.generation = (searchWorkspace.generation + 1) >>> 0;
  if (searchWorkspace.generation === 0) {
    searchWorkspace.stamps.fill(0);
    searchWorkspace.generation = 1;
  }
  return searchWorkspace;
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

interface OpenSetEntry {
  node: number;
  g: number;
  priority: number;
}

/**
 * Deterministic binary min-heap for the A* open set.
 */
class OpenSetMinHeap {
  private readonly entries: OpenSetEntry[] = [];

  get length(): number {
    return this.entries.length;
  }

  push(entry: OpenSetEntry): void {
    const entries = this.entries;
    entries.push(entry);
    let index = entries.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.isHigherPriority(entries[index]!, entries[parent]!)) break;
      [entries[index], entries[parent]] = [entries[parent]!, entries[index]!];
      index = parent;
    }
  }

  pop(): OpenSetEntry | undefined {
    const entries = this.entries;
    const first = entries[0];
    const last = entries.pop();
    if (!first) return undefined;
    if (!last || entries.length === 0) return first;

    entries[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < entries.length && this.isHigherPriority(entries[left]!, entries[best]!)) best = left;
      if (right < entries.length && this.isHigherPriority(entries[right]!, entries[best]!)) best = right;
      if (best === index) break;
      [entries[index], entries[best]] = [entries[best]!, entries[index]!];
      index = best;
    }
    return first;
  }

  private isHigherPriority(a: OpenSetEntry, b: OpenSetEntry): boolean {
    return a.priority < b.priority || (a.priority === b.priority && a.node < b.node);
  }
}

/** Find nearest unblocked tile if start/target is on an impassable tile */
function findNearestWalkable(grid: PathGrid, x: number, y: number): { x: number; y: number } | null {
  const { cols, rows, blocked } = grid;
  if (!blocked[y * cols + x]) return { x, y };

  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !blocked[ny * cols + nx]) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return null;
}

/** Bresenham line-of-sight: true when the straight tile line is walkable (no water, no cliff). */
function hasLineOfSight(grid: PathGrid, x0: number, y0: number, x1: number, y1: number): boolean {
  const { cols, blocked, elevation } = grid;
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  let prevElev = elevation ? elevation[y * cols + x] : 0;
  for (;;) {
    const idx = y * cols + x;
    if (blocked[idx]) return false;
    if (elevation) {
      const e = elevation[idx];
      if (Math.abs(e - prevElev) > CLIFF_STEP) return false;
      prevElev = e;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    const stepX = e2 > -dy;
    const stepY = e2 < dx;
    if (stepX && stepY) {
      // Match A*: no diagonal crossing between blocked orthogonal neighbours.
      if (blocked[y * cols + (x + sx)] || blocked[(y + sy) * cols + x]) return false;
      if (elevation && (Math.abs(elevation[y * cols + (x + sx)] - prevElev) > CLIFF_STEP
        || Math.abs(elevation[(y + sy) * cols + x] - prevElev) > CLIFF_STEP)) return false;
    }
    if (stepX) { err -= dy; x += sx; }
    if (stepY) { err += dx; y += sy; }
  }
  return true;
}

/** The A* core: the cheapest route's tile path (start..goal inclusive) and its cost, or null. */
/** A route search's verdict; `hitNodeCap` separates a spent node budget from a finished no-route search. */
interface RouteSearchResult {
  path: { x: number; y: number }[] | null;
  cost: number | null;
  hitNodeCap: boolean;
}

function searchRoute(
  grid: PathGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes: number,
  scaleHeuristicForRoadCost: boolean,
): RouteSearchResult {
  const pathProfileStart = profileStart();
  try {
  const { cols, rows, blocked, elevation, road } = grid;
  recordFindPathCall();
  const rejected: RouteSearchResult = { path: null, cost: null, hitNodeCap: false };
  if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) {
    recordPathEarlyReject();
    return rejected;
  }
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) {
    recordPathEarlyReject();
    return rejected;
  }

  // Resolve walkable neighbors if either endpoint falls on an obstacle
  const startPt = findNearestWalkable(grid, sx, sy);
  const goalPt = findNearestWalkable(grid, tx, ty);
  if (!startPt || !goalPt) {
    recordPathEarlyReject();
    return rejected;
  }

  const actualSx = startPt.x;
  const actualSy = startPt.y;
  const actualTx = goalPt.x;
  const actualTy = goalPt.y;

  if (actualSx === actualTx && actualSy === actualTy) {
    recordPathEarlyReject();
    return rejected;
  }

  const start = actualSy * cols + actualSx;
  const goal = actualTy * cols + actualTx;

  const { scores, parents, stamps, generation } = beginPathSearch(cols * rows);

  // Cost searches need the discounted road heuristic for optimality. Bounded movement searches
  // use the stronger unscaled heuristic to avoid exhausting their node budget on remote roads.
  const cheapestStep = scaleHeuristicForRoadCost && road ? ROAD_STEP_COST : 1;
  const h = (x: number, y: number) => {
    const adx = Math.abs(x - actualTx);
    const ady = Math.abs(y - actualTy);
    return (Math.max(adx, ady) + 0.4142 * Math.min(adx, ady)) * cheapestStep;
  };

  const open = new OpenSetMinHeap();
  scores[start] = 0;
  stamps[start] = generation;
  open.push({ node: start, g: 0, priority: h(actualSx, actualSy) });
  let nodes = 0;
  let hitNodeCap = false;

  while (open.length > 0) {
    const entry = open.pop();
    if (!entry) break;
    const cur = entry.node;
    if (entry.g !== scores[cur]) continue;
    if (nodes++ >= maxNodes) {
      hitNodeCap = true;
      break;
    }

    if (cur === goal) {
      const path: { x: number; y: number }[] = [];
      let c = cur;
      while (c !== start && c >= 0) {
        path.push({ x: c % cols, y: (c / cols) | 0 });
        c = parents[c];
      }
      path.push({ x: actualSx, y: actualSy });
      path.reverse();

      // Preserve road tiles: line-of-sight smoothing can erase the faster road detour.
      if (road) {
        recordPathNodes(nodes);
        recordPathFound();
        return { path, cost: scores[goal], hitNodeCap: false };
      }
      const simplified: { x: number; y: number }[] = [path[0]];
      for (let i = 1; i < path.length - 1; i++) {
        const last = simplified[simplified.length - 1];
        if (!hasLineOfSight(grid, last.x, last.y, path[i + 1].x, path[i + 1].y)) {
          simplified.push(path[i]);
        }
      }
      simplified.push(path[path.length - 1]);

      recordPathNodes(nodes);
      recordPathFound();
      return { path: simplified, cost: scores[goal], hitNodeCap: false };
    }

    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    const curElev = elevation ? elevation[cur] : 0;

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nIdx = ny * cols + nx;
      if (blocked[nIdx]) continue;
      // Prevent corner squeezing through diagonal blocked tiles
      if (dx !== 0 && dy !== 0 && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;

      let step = dx !== 0 && dy !== 0 ? 1.4142 : 1;
      // A built road is cheaper than open ground, so the route follows the player's own paths.
      if (road?.[nIdx]) step *= ROAD_STEP_COST;
      if (elevation) {
        const nextElev = elevation[nIdx];
        const delta = nextElev - curElev;
        // An impassable cliff: a single-tile elevation jump too steep to climb.
        if (Math.abs(delta) > CLIFF_STEP) continue;
        step += delta > 0 ? delta * SLOPE_UP_COST : -delta * SLOPE_DOWN_COST;
      }

      const ng = scores[cur] + step;
      if (ng < (stamps[nIdx] === generation ? scores[nIdx] : Infinity)) {
        scores[nIdx] = ng;
        parents[nIdx] = cur;
        stamps[nIdx] = generation;
        open.push({ node: nIdx, g: ng, priority: ng + h(nx, ny) });
      }
    }
  }

  recordPathNodes(nodes);
  recordPathFailed();
  if (hitNodeCap) recordPathMaxNodesExceeded();
  return { path: null, cost: null, hitNodeCap };
  } finally {
    profileEnd('pathfinding.findPath', pathProfileStart);
  }
}

/** Time-aware walking route; bounded recovery remains safe when a distant road expands A*. */
function walkRoute(
  grid: PathGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes: number,
): RouteSearchResult {
  const optimal = searchRoute(grid, sx, sy, tx, ty, maxNodes, true);
  if (optimal.path || !optimal.hitNodeCap || !grid.road) return optimal;
  return searchRoute(grid, sx, sy, tx, ty, maxNodes, false);
}

/** A* over the grid — returns tile path (start..goal inclusive) or null. */
export function findPath(
  grid: PathGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes = PATH_MAX_SEARCH_NODES,
): { x: number; y: number }[] | null {
  return walkRoute(grid, sx, sy, tx, ty, maxNodes).path;
}

/** The cheapest route's step cost in tile units (roads cheaper, slopes taxed), or null if none. */
export function findRouteCost(
  grid: PathGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes = PATH_MAX_SEARCH_NODES,
): number | null {
  return findRouteCostOutcome(grid, sx, sy, tx, ty, maxNodes).cost;
}

/** The same cost search with its budget verdict, so a caller can tell no-route from a spent budget. */
export function findRouteCostOutcome(
  grid: PathGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes = PATH_MAX_SEARCH_NODES,
): { cost: number | null; budgetExhausted: boolean } {
  const result = searchRoute(grid, sx, sy, tx, ty, maxNodes, true);
  return { cost: result.cost, budgetExhausted: result.hitNodeCap };
}

/** Tile path → world-coordinate waypoints (tile centers). */
export function pathWaypoints(path: { x: number; y: number }[]): { x: number; y: number }[] {
  const half = PATH_CELL / 2;
  return path.map((p) => ({ x: p.x * PATH_CELL + half, y: p.y * PATH_CELL + half }));
}

/** True when the straight line from (x0,y0) to (x1,y1) crosses a blocked tile. */
export function lineCrossesBlocked(
  grid: PathGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  recordLineCheck();
  const span = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  // Sub-tile sampling steps prevent tunneling through 1-tile diagonal obstacles
  const steps = Math.max(4, Math.min(128, Math.ceil(span / (PATH_CELL * 0.5))));
  const startTx = Math.floor(x0 / PATH_CELL);
  const startTy = Math.floor(y0 / PATH_CELL);
  let prevElev: number | null = grid.elevation && startTx >= 0 && startTy >= 0
    && startTx < grid.cols && startTy < grid.rows
    ? grid.elevation[startTy * grid.cols + startTx] : null;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    const tx = Math.floor(px / PATH_CELL);
    const ty = Math.floor(py / PATH_CELL);
    if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) continue;
    const idx = ty * grid.cols + tx;
    if (grid.blocked[idx]) return true;
    // A cliff step along the line also forces a detour, matching the A* cliff rule.
    if (grid.elevation) {
      const e = grid.elevation[idx];
      if (prevElev !== null && Math.abs(e - prevElev) > CLIFF_STEP) return true;
      prevElev = e;
    }
  }
  return false;
}

/** Module-level "current map" for pathing — set once per tick by the sim. */
let currentGrid: PathGrid | null = null;

/** A cached route stays valid while the settler walks it; reuse ends only when the settler leaves
 *  the current segment (interrupted elsewhere), not on ordinary forward progress. */
const PATH_CACHE_OFF_ROUTE_TOLERANCE = PATH_CELL * 2;

/**
 * How close a walker must come to a waypoint before the route advances to the next one.
 *
 * Half a tile, so a corner is **reached** and not passed at a tile's distance. The old 14 px radius
 * let a walker cut a one-tile gap diagonally: the step into the water was refused, and it then
 * crawled along the bank toward the next waypoint on the far side.
 */
const PATH_WAYPOINT_REACHED_PX = PATH_CELL * 0.5;

/** Perpendicular distance from (px,py) to the segment (ax,ay)-(bx,by). */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

const PATH_CACHE_LIMIT = 4096;

interface CachedPath {
  targetX: number;
  targetY: number;
  startTileX: number;
  startTileY: number;
  waypoints: { x: number; y: number }[] | null;
  /** A clear walk rejected a road detour; keep direct travel cached across tiles. */
  directDetourRejected?: boolean;
  /** Waypoint the settler is currently walking toward, so progress survives a cache hit. */
  nextIndex: number;
}

const pathCache = new Map<string, CachedPath>();

/** Discard a walker's stale commute routes after its movement step repeatedly fails. */
export function invalidateCommutePathsForWalker(entityId: number): void {
  const prefix = `c_${entityId}_`;
  for (const key of pathCache.keys()) {
    if (key.startsWith(prefix)) pathCache.delete(key);
  }
}


export function setCurrentPathMap(map: WorldMap | null, buildings?: Building[]): void {
  const next = map ? getPathGrid(map, buildings) : null;
  if (next !== currentGrid) {
    currentGrid = next;
    pathCache.clear();
  }
}

/** The grid the sim last handed the path owner; null before the first tick or in a bare fixture. */
export function getCurrentPathGrid(): PathGrid | null {
  return currentGrid;
}

/** What the path owner has to say about one leg of a walk. */
export type RouteObstruction =
  /** The straight line is walkable — the sim steers directly, no route needed. */
  | 'clear'
  /** The line is blocked but a detour exists: the walk follows waypoints around it. */
  | 'rerouting'
  /** The line is blocked and no route exists — the walk falls back to the straight line. */
  | 'blocked';

/**
 * Read-only twin of {@link steerWithPath}: reports what the path owner would do for this leg without
 * writing velocity, position, or the steering cache. The inspector renders this so a blocked commute
 * is legible instead of looking like a settler walking into a river.
 *
 * Uses the map's cached grid (`getPathGrid`) rather than the per-tick `currentGrid`, because the
 * projection is also evaluated outside the sim tick — on the render side of a worker-mode session,
 * where `currentGrid` has never been set. A missing map reports `clear`: no obstacle is known, which
 * is different from "the way is known to be open" but is the honest answer when there is no grid.
 */
export function getRouteObstruction(
  map: WorldMap | null,
  buildings: Building[] | undefined,
  from: { x: number; y: number },
  to: { x: number; y: number },
): RouteObstruction {
  if (!map) return 'clear';
  const grid = getPathGrid(map, buildings);
  if (!lineCrossesBlocked(grid, from.x, from.y, to.x, to.y)) return 'clear';

  const path = findPath(
    grid,
    Math.floor(from.x / PATH_CELL),
    Math.floor(from.y / PATH_CELL),
    Math.floor(to.x / PATH_CELL),
    Math.floor(to.y / PATH_CELL),
  );
  return path && path.length > 1 ? 'rerouting' : 'blocked';
}

/**
 * Steer an entity toward a target, routing around obstacles when the direct line
 * is blocked. Returns how the caller should proceed:
 * - 'arrived': entity is close enough, stopped.
 * - 'path': velocity is set along the route and **the caller applies this tick's step** (the
 *   commute leaves it to the human loop, the hotel walk moves the visitor itself). The stepper
 *   never writes a position: doing that *and* letting the caller move advanced entities twice per
 *   tick, which is the 2026-09-13 movement regression.
 * - 'direct': the direct leg is traversable — caller does its usual straight move.
 * - 'blocked': no safe route exists; caller must not advance.
 */
export function steerWithPath(
  entity: Entity,
  targetX: number,
  targetY: number,
  speed: number,
  cacheKey: string,
): 'arrived' | 'path' | 'direct' | 'blocked' {
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist <= PATH_ARRIVAL_DISTANCE_PX) {
    entity.vx = 0;
    entity.vy = 0;
    return 'arrived';
  }
  if (!currentGrid) return 'direct';

  const directBlocked = lineCrossesBlocked(currentGrid, entity.x, entity.y, targetX, targetY);
  const considerRoadDetour = !directBlocked && !!currentGrid.road && dist >= ROAD_ROUTE_MIN_DISTANCE_PX;
  if (directBlocked || considerRoadDetour) {
    let cached = pathCache.get(cacheKey);
    if (cached && (cached.targetX !== targetX || cached.targetY !== targetY
      || (cached.directDetourRejected && (directBlocked
        || Math.abs(cached.startTileX - Math.floor(entity.x / PATH_CELL))
          + Math.abs(cached.startTileY - Math.floor(entity.y / PATH_CELL)) >= ROAD_DETOUR_RECHECK_TILES))
      || (cached.waypoints === null && !cached.directDetourRejected && (cached.startTileX !== Math.floor(entity.x / PATH_CELL)
        || cached.startTileY !== Math.floor(entity.y / PATH_CELL))))) {
      cached = undefined;
    }
    // Reuse the route while the settler is still walking it; advance past reached waypoints and
    // recompute only when the settler has left the current segment (interrupted elsewhere).
    if (cached !== undefined && cached.waypoints !== null && cached.waypoints.length > 1) {
      while (
        cached.nextIndex < cached.waypoints.length - 1
        && Math.hypot(
          cached.waypoints[cached.nextIndex].x - entity.x,
          cached.waypoints[cached.nextIndex].y - entity.y,
        ) < PATH_WAYPOINT_REACHED_PX
      ) {
        cached.nextIndex++;
      }
      const prev = cached.waypoints[cached.nextIndex - 1];
      const next = cached.waypoints[cached.nextIndex];
      if (distanceToSegment(entity.x, entity.y, prev.x, prev.y, next.x, next.y) > PATH_CACHE_OFF_ROUTE_TOLERANCE) {
        cached = undefined;
      }
    }
    if (cached === undefined) {
      recordPathCacheMiss();
      const route = walkRoute(
        currentGrid,
        Math.floor(entity.x / PATH_CELL),
        Math.floor(entity.y / PATH_CELL),
        Math.floor(targetX / PATH_CELL),
        Math.floor(targetY / PATH_CELL),
        PATH_MAX_SEARCH_NODES,
      );
      const savesTime = route.cost !== null && route.cost * PATH_CELL < dist * ROAD_ROUTE_MIN_TIME_SAVING;
      let waypoints = route.path && (directBlocked || savesTime) ? pathWaypoints(route.path) : null;
      const startTx = Math.floor(entity.x / PATH_CELL);
      const startTy = Math.floor(entity.y / PATH_CELL);
      const startIsBlocked = startTx >= 0 && startTy >= 0
        && startTx < currentGrid.cols && startTy < currentGrid.rows
        && currentGrid.blocked[startTy * currentGrid.cols + startTx] === 1;
      if (waypoints && startIsBlocked) {
        waypoints = [{ x: entity.x, y: entity.y }, ...waypoints];
      }
      cached = {
        waypoints, nextIndex: waypoints && waypoints.length > 1 ? 1 : 0,
        targetX, targetY, startTileX: startTx, startTileY: startTy,
        directDetourRejected: !directBlocked && !savesTime,
      };
      pathCache.delete(cacheKey);
      if (pathCache.size >= PATH_CACHE_LIMIT) {
        const oldestKey = pathCache.keys().next().value;
        if (oldestKey !== undefined) pathCache.delete(oldestKey);
      }
      pathCache.set(cacheKey, cached);
    } else {
      pathCache.delete(cacheKey);
      pathCache.set(cacheKey, cached);
      recordPathCacheHit();
    }

    const wp = cached.waypoints;
    if (wp && wp.length > 1) {
      const next = wp[cached.nextIndex];
      const ndx = next.x - entity.x;
      const ndy = next.y - entity.y;
      const nd = Math.hypot(ndx, ndy) || 1;

      entity.vx = (ndx / nd) * speed;
      entity.vy = (ndy / nd) * speed;
      faceVelocity(entity);
      return 'path';
    }
  }
  if (directBlocked) {
    entity.vx = 0;
    entity.vy = 0;
    return 'blocked';
  }
  return 'direct';
}

/**
 * Whether a walker may move between two world points, by the grid's own rule.
 *
 * The integration asks this every tick. `steerWithPath` only routes the leg a caller hands it, so
 * movement no steerer saw — idle drift, a leisure walk, or the last stretch of a leg whose line is
 * blocked — entered water and walls freely.
 *
 * The cell the walker already stands in is not an obstacle to leaving it. A settler can end up on a
 * blocked tile (shoved by a neighbour, snapped to a doorstep, or restored from an older save that
 * waded), and testing the whole step instead of the ground ahead would freeze it there for good.
 */
export function isWalkStepAllowed(fromX: number, fromY: number, toX: number, toY: number): boolean {
  const grid = currentGrid;
  if (!grid) return true;
  const startTx = Math.floor(fromX / PATH_CELL);
  const startTy = Math.floor(fromY / PATH_CELL);
  const startIdx =
    startTx >= 0 && startTy >= 0 && startTx < grid.cols && startTy < grid.rows
      ? startTy * grid.cols + startTx
      : -1;
  // A blocked start may be escaped, but cells beyond it must still be walkable.
  const span = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
  const steps = Math.max(4, Math.min(128, Math.ceil(span / (PATH_CELL * 0.5))));
  let prevElev: number | null = grid.elevation && startIdx >= 0
    ? grid.elevation[startIdx] : null;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tx = Math.floor((fromX + (toX - fromX) * t) / PATH_CELL);
    const ty = Math.floor((fromY + (toY - fromY) * t) / PATH_CELL);
    if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) continue;
    const idx = ty * grid.cols + tx;
    if (idx === startIdx) continue;
    if (grid.blocked[idx]) return false;
    // A cliff step along the way is impassable too, matching the A* cliff rule.
    if (grid.elevation) {
      const e = grid.elevation[idx];
      if (prevElev !== null && Math.abs(e - prevElev) > CLIFF_STEP) return false;
      prevElev = e;
    }
  }
  return true;
}

/**
 * Whether a walker may **stand** on the ground at a world point — the grid's verdict with no step
 * exemption.
 *
 * A destination has to be a cell a walker can occupy, not merely one it can reach from where it
 * already is. This is what lets a stand point (a workplace row, a home arc, a hotel doorstep) move
 * off water, a reserved decor cell or a completed wall's footprint instead of leaving a settler
 * hovering at its edge. Out-of-bounds reads as open, the tolerance the step rule takes.
 */
export function isGroundWalkableAt(x: number, y: number): boolean {
  const grid = currentGrid;
  if (!grid) return true;
  const tx = Math.floor(x / PATH_CELL);
  const ty = Math.floor(y / PATH_CELL);
  if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) return true;
  return grid.blocked[ty * grid.cols + tx] !== 1;
}

/** Walk-speed ownership uses the same completed-road mask as A* and commute pricing. */
export function isOnWalkableRoadAt(x: number, y: number): boolean {
  const grid = currentGrid;
  if (!grid?.road) return false;
  const tx = Math.floor(x / PATH_CELL);
  const ty = Math.floor(y / PATH_CELL);
  return tx >= 0 && ty >= 0 && tx < grid.cols && ty < grid.rows
    && grid.road[ty * grid.cols + tx] === 1;
}
