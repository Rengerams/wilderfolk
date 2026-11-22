/**
 * Grid pathfinding over the terrain map — bounded A* over the cached walkability grid, with
 * routes cached per walker; no route means stop rather than walk through a barrier.
 */
import type { Building, Entity, WorldMap } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType, PATH_CELL } from './gameTypes';
import {
  Walkability,
  getTerrainRevision,
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
const PATH_MAX_SEARCH_NODES = 12000;
const PATH_ARRIVAL_DISTANCE_PX = 8;
const ROAD_DETOUR_RECHECK_TILES = 20;
const BUILDING_SIGNATURE_WIDTH_FACTOR = 19;
const BUILDING_SIGNATURE_HEIGHT_FACTOR = 23;
const BUILDING_SIGNATURE_BRIDGE_FACTOR = 29;
const BUILDING_SIGNATURE_GATE_FACTOR = 31;

/** Footprints that stay walkable even when the structure is complete. */
const WALKABLE_BUILDING_TYPES = new Set<Building['type']>([
  BuildingType.Road,
  BuildingType.Bridge,
  BuildingType.Square,
  BuildingType.GroundReinforcement,
]);

/**
 * Completed structures are solid to walkers; a closed gate and a legacy wall block.
 * An open gate, roads, bridges, the square and reinforced ground remain walkable.
 */
function isWalkingObstacle(b: Building): boolean {
  if (!b.completed) return false;
  if (b.type === BuildingType.WallGate) return b.gateClosed === true;
  if (BUILDING_CONFIGS[b.type]?.decor) return false;
  return !WALKABLE_BUILDING_TYPES.has(b.type);
}

/** Completed player roads and bridges: walkable, and cheaper than open ground. */
export function isWalkableRoad(b: Building): boolean {
  return (
    b.completed &&
    (b.type === BuildingType.Road || b.type === BuildingType.Bridge)
  );
}

/** Exact footprint test shared by path pricing and the per-walker speed bonus. */
function isRoadSurfacePoint(b: Building, x: number, y: number): boolean {
  return x >= b.x - b.width / 2 && x < b.x + b.width / 2
    && y >= b.y - b.height / 2 && y < b.y + b.height / 2;
}

/** Stamps `value` over every grid tile a building's footprint covers, clamped to the grid. */
function stampBuildingFootprint(
  grid: Uint8Array,
  cols: number,
  rows: number,
  b: Building,
  value = 1,
  surfaces?: Map<number, Building[]>,
): void {
  // Building positions are centres, not top-left corners. The walking mask must
  // cover the same footprint that placement and rendering use.
  const x0 = Math.max(0, Math.floor((b.x - b.width / 2) / PATH_CELL));
  const y0 = Math.max(0, Math.floor((b.y - b.height / 2) / PATH_CELL));
  const x1 = Math.min(cols - 1, Math.ceil((b.x + b.width / 2) / PATH_CELL) - 1);
  const y1 = Math.min(rows - 1, Math.ceil((b.y + b.height / 2) / PATH_CELL) - 1);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = y * cols + x;
      grid[index] = value;
      if (surfaces) {
        const entries = surfaces.get(index);
        if (entries) entries.push(b);
        else surfaces.set(index, [b]);
      }
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
    hash = (hash + b.id * 31 + b.x * 17 + b.y * 13 + (b.rotation ?? 0) * 7
      + b.width * BUILDING_SIGNATURE_WIDTH_FACTOR + b.height * BUILDING_SIGNATURE_HEIGHT_FACTOR
      + (b.type === BuildingType.Bridge ? BUILDING_SIGNATURE_BRIDGE_FACTOR : 0)
      + (b.gateClosed === true ? BUILDING_SIGNATURE_GATE_FACTOR : 0)) >>> 0;
    count++;
  }
  return `${count}:${hash}`;
}

export interface PathGrid {
  cols: number;
  rows: number;
  blocked: Uint8Array;
  /** Terrain and bridge passability before completed solid-building footprints are applied. */
  terrainBlocked?: Uint8Array;
  /** Per-tile elevation (0–100) for slope-aware A*. Absent on legacy maps. */
  elevation?: Float32Array;
  /** 1 on every tile a completed road or bridge covers. Absent when the map has none. */
  road?: Uint8Array;
  /** A* discount only where the waypoint at the tile centre is actually on a paved footprint. */
  roadCost?: Uint8Array;
  /** Bridge decks remain traversable even above deep riverbeds. */
  bridge?: Uint8Array;
  /** Partial-cell footprint index for exact point-speed checks (including narrow legacy roads). */
  roadSurfaces?: Map<number, Building[]>;
}

let gridCache: PathGrid | null = null;
let gridCacheSeed = '';
let gridCacheMap: WorldMap | null = null;

/**
 * The passability grid's cache identity: seed alone does not identify the tiles, so preset,
 * blocking/cheapening buildings, size and runtime terrain overrides are all part of it.
 */
function pathGridCacheKey(map: WorldMap, buildings?: Building[]): string {
  const seed = typeof map.seed === 'number' ? map.seed : 1;
  const obstacles = buildingSignature(buildings, isWalkingObstacle);
  const roads = buildingSignature(buildings, isWalkableRoad);
  return `${seed}|${map.preset}|${obstacles}|${roads}|${map.width}x${map.height}|t${getTerrainRevision()}`;
}

/**
 * The one place a passability grid is built. Both accessors below share the blocked-terrain
 * and wall rules — they differ only in who owns the cache.
 */
function buildPathGrid(map: WorldMap, buildings?: Building[]): PathGrid {
  const cols = map.width;
  const rows = map.height;
  const blocked = new Uint8Array(cols * rows);
  const terrainBlocked = new Uint8Array(cols * rows);
  const elevation = new Float32Array(cols * rows);

  // Teraforge's L0 path grid is the authoritative occupancy layer; maps without one fall back to
  // the tile owner, so both answer "can a walker stand here?" through one rule.
  const hasPathGrid = !!map.pathGrid && map.pCols === cols && map.pRows === rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const t = tileAt(map, x, y);
      if (!t) continue;
      elevation[i] = t.elevation;
      blocked[i] = hasPathGrid
        ? (map.pathGrid![i] === Walkability.Water ? 1 : 0)
        : (isWalkableTerrainType(t.type) ? 0 : 1);
      terrainBlocked[i] = blocked[i];
    }
  }
  let road: Uint8Array | null = null;
  let bridge: Uint8Array | undefined;
  const roadSurfaces = new Map<number, Building[]>();
  if (buildings) {
    // Only a bridge opens water; a road never makes impassable ground walkable.
    for (const b of buildings) {
      if (!isWalkableRoad(b)) continue;
      road ??= new Uint8Array(cols * rows);
      stampBuildingFootprint(road, cols, rows, b, 1, roadSurfaces);
      if (b.type === BuildingType.Bridge) {
        bridge ??= new Uint8Array(cols * rows);
        stampBuildingFootprint(bridge, cols, rows, b);
        stampBuildingFootprint(blocked, cols, rows, b, 0);
        stampBuildingFootprint(terrainBlocked, cols, rows, b, 0);
      }
    }
    for (const b of buildings) {
      if (isWalkingObstacle(b)) stampBuildingFootprint(blocked, cols, rows, b);
    }
  }
  // A* prices only paved tile centres; the footprint index still supports
  // exact speed eligibility on narrow roads between tile centres.
  let roadCost: Uint8Array | undefined;
  if (road) {
    const centreMask = new Uint8Array(cols * rows);
    for (const [index, surfaces] of roadSurfaces) {
      const x = ((index % cols) + 0.5) * PATH_CELL;
      const y = (Math.floor(index / cols) + 0.5) * PATH_CELL;
      if (surfaces.some((b) => isRoadSurfacePoint(b, x, y))) {
        centreMask[index] = 1;
        roadCost ??= centreMask;
      }
    }
  }
  return road ? { cols, rows, blocked, terrainBlocked, elevation, road, roadCost, roadSurfaces, bridge }
    : { cols, rows, blocked, terrainBlocked, elevation };
}

/** The simulation's grid. `setCurrentPathMap` swaps `currentGrid` and clears the waypoint cache. */
export function getPathGrid(map: WorldMap, buildings?: Building[]): PathGrid {
  const cacheKey = pathGridCacheKey(map, buildings);
  if (gridCache && gridCacheMap === map && gridCacheSeed === cacheKey) {
    return gridCache;
  }
  recordGridRebuild();
  gridCache = buildPathGrid(map, buildings);
  gridCacheSeed = cacheKey;
  gridCacheMap = map;
  return gridCache;
}

/**
 * A second, independent grid cache for read-only consumers (the logistics overlay) that must not
 * clear the simulation's waypoint cache or its grid-build metric.
 */
let readOnlyGridCache: PathGrid | null = null;
let readOnlyGridCacheSeed = '';
let readOnlyGridCacheMap: WorldMap | null = null;

export function getReadOnlyPathGrid(map: WorldMap, buildings?: Building[]): PathGrid {
  const cacheKey = pathGridCacheKey(map, buildings);
  if (readOnlyGridCache && readOnlyGridCacheMap === map && readOnlyGridCacheSeed === cacheKey) {
    return readOnlyGridCache;
  }
  readOnlyGridCache = buildPathGrid(map, buildings);
  readOnlyGridCacheSeed = cacheKey;
  readOnlyGridCacheMap = map;
  return readOnlyGridCache;
}

/**
 * Choose the geometrically closest walkable tile centre. Scan Chebyshev rings in order, but
 * keep looking while a future ring can still contain a *closer* centre than the best so far.
 * This shared owner also lets A* recover from a blocked endpoint more than three tiles deep.
 */
function nearestWalkableTile(
  grid: PathGrid,
  startX: number,
  startY: number,
  worldX: number,
  worldY: number,
): { x: number; y: number } | null {
  const { cols, rows, blocked } = grid;
  let best: { x: number; y: number } | null = null;
  let bestDistanceSq = Infinity;
  const maxRadius = Math.max(cols, rows);
  const worldInsideStart = worldX >= startX * PATH_CELL && worldX < (startX + 1) * PATH_CELL
    && worldY >= startY * PATH_CELL && worldY < (startY + 1) * PATH_CELL;
  for (let radius = 1; radius <= maxRadius; radius++) {
    const minX = Math.max(0, startX - radius);
    const maxX = Math.min(cols - 1, startX + radius);
    const minY = Math.max(0, startY - radius);
    const maxY = Math.min(rows - 1, startY + radius);
    for (let ty = minY; ty <= maxY; ty++) {
      const onEdgeRow = ty === minY || ty === maxY;
      for (let tx = minX; tx <= maxX; tx++) {
        if (!onEdgeRow && tx !== minX && tx !== maxX) continue;
        if (blocked[ty * cols + tx] !== 0) continue;
        const dx = (tx + 0.5) * PATH_CELL - worldX;
        const dy = (ty + 0.5) * PATH_CELL - worldY;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq >= bestDistanceSq) continue;
        bestDistanceSq = distanceSq;
        best = { x: tx, y: ty };
      }
    }
    // Any as-yet-unvisited ring is at least (radius + 0.5) tile widths away.
    // Outside-map recovery scans all rings; its origin need not be in the start cell.
    if (best && worldInsideStart && bestDistanceSq <= ((radius + 0.5) * PATH_CELL) ** 2) break;
  }
  return best;
}

/** Find a valid stand point for a restored entity, with bridge and building masks applied. */
export function nearestWalkableWorldPoint(
  map: WorldMap,
  buildings: Building[] | undefined,
  x: number,
  y: number,
): { x: number; y: number } | null {
  if (![x, y].every(Number.isFinite)) return null;
  const grid = getReadOnlyPathGrid(map, buildings);
  if (grid.cols <= 0 || grid.rows <= 0) return null;
  const startX = Math.max(0, Math.min(grid.cols - 1, Math.floor(x / PATH_CELL)));
  const startY = Math.max(0, Math.min(grid.rows - 1, Math.floor(y / PATH_CELL)));
  if (grid.blocked[startY * grid.cols + startX] === 0) {
    return { x: Math.min(Math.max(x, 0), grid.cols * PATH_CELL - 1),
      y: Math.min(Math.max(y, 0), grid.rows * PATH_CELL - 1) };
  }
  const tile = nearestWalkableTile(grid, startX, startY, x, y);
  return tile ? { x: (tile.x + 0.5) * PATH_CELL, y: (tile.y + 0.5) * PATH_CELL } : null;
}

/** Test seam: drop both grid caches so a case starts from a known state. */
export function resetPathGridCaches(): void {
  gridCache = null;
  gridCacheSeed = '';
  gridCacheMap = null;
  readOnlyGridCache = null;
  readOnlyGridCacheSeed = '';
  readOnlyGridCacheMap = null;
  searchWorkspace = undefined;
  searchOpenSet = undefined;
  sharedRouteCaches = new WeakMap<PathGrid, SharedNavigationCache>();
  pathCache.clear();
  currentGrid = null;
}

interface PathSearchWorkspace {
  scores: Float64Array;
  parents: Int32Array;
  stamps: Uint32Array;
  generation: number;
}

let searchWorkspace: PathSearchWorkspace | undefined;

/** Searches are synchronous, so one open set serves every route on this realm. */
let searchOpenSet: OpenSetMinHeap | undefined;

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

const DIR_COUNT = 8;
const DIR_DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const DIR_DY = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);

/** Deterministic binary min-heap in parallel arrays: no object or pair allocation per node. */
class OpenSetMinHeap {
  private nodes: Int32Array;
  private costs: Float64Array;
  private priorities: Float64Array;
  private count = 0;
  private poppedNode = -1;
  private poppedCost = 0;

  constructor(capacity = 1024) {
    this.nodes = new Int32Array(capacity);
    this.costs = new Float64Array(capacity);
    this.priorities = new Float64Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  /** Node index of the entry the last `pop` removed. */
  get lastNode(): number {
    return this.poppedNode;
  }

  /** Path cost of the entry the last `pop` removed. */
  get lastCost(): number {
    return this.poppedCost;
  }

  reset(): void {
    this.count = 0;
    this.poppedNode = -1;
    this.poppedCost = 0;
  }

  push(node: number, g: number, priority: number): void {
    if (this.count === this.nodes.length) this.grow();
    let index = this.count++;
    this.nodes[index] = node;
    this.costs[index] = g;
    this.priorities[index] = priority;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.isHigherPriority(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): void {
    if (this.count === 0) {
      this.poppedNode = -1;
      this.poppedCost = 0;
      return;
    }
    this.poppedNode = this.nodes[0]!;
    this.poppedCost = this.costs[0]!;
    this.count--;
    if (this.count === 0) return;
    this.nodes[0] = this.nodes[this.count]!;
    this.costs[0] = this.costs[this.count]!;
    this.priorities[0] = this.priorities[this.count]!;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < this.count && this.isHigherPriority(left, best)) best = left;
      if (right < this.count && this.isHigherPriority(right, best)) best = right;
      if (best === index) break;
      this.swap(index, best);
      index = best;
    }
  }

  private isHigherPriority(a: number, b: number): boolean {
    const pa = this.priorities[a]!;
    const pb = this.priorities[b]!;
    return pa < pb || (pa === pb && this.nodes[a]! < this.nodes[b]!);
  }

  private swap(a: number, b: number): void {
    const node = this.nodes[a]!;
    this.nodes[a] = this.nodes[b]!;
    this.nodes[b] = node;
    const cost = this.costs[a]!;
    this.costs[a] = this.costs[b]!;
    this.costs[b] = cost;
    const priority = this.priorities[a]!;
    this.priorities[a] = this.priorities[b]!;
    this.priorities[b] = priority;
  }

  private grow(): void {
    const capacity = this.nodes.length * 2;
    const nodes = new Int32Array(capacity);
    nodes.set(this.nodes);
    this.nodes = nodes;
    const costs = new Float64Array(capacity);
    costs.set(this.costs);
    this.costs = costs;
    const priorities = new Float64Array(capacity);
    priorities.set(this.priorities);
    this.priorities = priorities;
  }
}

/** Resolve a blocked route endpoint through the same nearest-stand-point owner used by restored settlers. */
function findNearestWalkable(grid: PathGrid, x: number, y: number): { x: number; y: number } | null {
  if (!grid.blocked[y * grid.cols + x]) return { x, y };
  return nearestWalkableTile(grid, x, y, (x + 0.5) * PATH_CELL, (y + 0.5) * PATH_CELL);
}

/** A* smoothing uses the same exact tile, corner and cliff traversal as the movement integrator. */
function hasLineOfSight(grid: PathGrid, x0: number, y0: number, x1: number, y1: number): boolean {
  return !segmentCrossesBlocked(grid,
    (x0 + 0.5) * PATH_CELL, (y0 + 0.5) * PATH_CELL,
    (x1 + 0.5) * PATH_CELL, (y1 + 0.5) * PATH_CELL, false);
}

/** A route search's verdict; `hitNodeCap` separates a spent node budget from a finished no-route search. */
interface RouteSearchResult {
  path: { x: number; y: number }[] | null;
  cost: number | null;
  hitNodeCap: boolean;
}

/** The road mask that actually grants tile-centre A* discounts. */
function pricedRoadMask(grid: PathGrid): Uint8Array | undefined {
  return grid.roadCost ?? (grid.roadSurfaces ? undefined : grid.road);
}

/** The A* core: the cheapest route's tile path (start..goal inclusive) and its cost, or null. */
function searchRoute(
  grid: PathGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes: number,
  scaleHeuristicForRoadCost: boolean,
  keepFullPath = false,
): RouteSearchResult {
  const pathProfileStart = profileStart();
  try {
  const { cols, rows, blocked, elevation } = grid;
  // Generated grids distinguish partial footprint coverage from tile-centre speed
  // eligibility. Older test grids without surface geometry retain their road mask.
  const pricedRoad = pricedRoadMask(grid);
  recordFindPathCall();
  const rejected: RouteSearchResult = { path: null, cost: null, hitNodeCap: false };
  if (![sx, sy, tx, ty].every(Number.isInteger) || !Number.isFinite(maxNodes) || maxNodes < 0
    || sx < 0 || sy < 0 || sx >= cols || sy >= rows) {
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
    // A restored walker inside a blocked tile must be able to escape to the
    // neighbouring snapped endpoint, rather than receiving a false no-route.
    const escaped = (sx !== actualSx || sy !== actualSy)
      && !segmentCrossesBlocked(grid,
        (sx + 0.5) * PATH_CELL, (sy + 0.5) * PATH_CELL,
        (actualSx + 0.5) * PATH_CELL, (actualSy + 0.5) * PATH_CELL, true);
    const path = escaped
      ? [{ x: sx, y: sy }, { x: actualSx, y: actualSy }]
      : [{ x: actualSx, y: actualSy }];
    return { path, cost: escaped ? Math.hypot(actualSx - sx, actualSy - sy) : 0, hitNodeCap: false };
  }

  const start = actualSy * cols + actualSx;
  const goal = actualTy * cols + actualTx;

  const { scores, parents, stamps, generation } = beginPathSearch(cols * rows);

  // Cost searches need the discounted road heuristic for optimality. Bounded movement searches
  // use the stronger unscaled heuristic to avoid exhausting their node budget on remote roads.
  const cheapestStep = scaleHeuristicForRoadCost && pricedRoad ? ROAD_STEP_COST : 1;
  const h = (x: number, y: number) => {
    const adx = Math.abs(x - actualTx);
    const ady = Math.abs(y - actualTy);
    return (Math.max(adx, ady) + 0.4142 * Math.min(adx, ady)) * cheapestStep;
  };

  const open = searchOpenSet ??= new OpenSetMinHeap();
  open.reset();
  scores[start] = 0;
  stamps[start] = generation;
  open.push(start, 0, h(actualSx, actualSy));
  let nodes = 0;
  let hitNodeCap = false;

  while (open.length > 0) {
    open.pop();
    const cur = open.lastNode;
    if (cur < 0) break;
    if (open.lastCost !== scores[cur]) continue;
    // A popped goal needs no further expansion even at the node budget.
    if (cur !== goal && nodes >= maxNodes) {
      hitNodeCap = true;
      break;
    }
    nodes++;

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
      if (pricedRoad || keepFullPath) {
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

    for (let dir = 0; dir < DIR_COUNT; dir++) {
      const dx = DIR_DX[dir]!;
      const dy = DIR_DY[dir]!;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nIdx = ny * cols + nx;
      if (blocked[nIdx]) continue;
      // Match the integrator's exact corner and cliff rule: a diagonal is illegal if
      // either orthogonal neighbour is blocked or too steep from the current tile.
      // A* and physical movement must never disagree about traversable edges.
      if (dx !== 0 && dy !== 0 && segmentCrossesBlocked(grid,
        (cx + 0.5) * PATH_CELL, (cy + 0.5) * PATH_CELL,
        (nx + 0.5) * PATH_CELL, (ny + 0.5) * PATH_CELL, false)) continue;

      let step = dx !== 0 && dy !== 0 ? 1.4142 : 1;
      // A built road is cheaper than open ground, so the route follows the player's own paths.
      if (pricedRoad?.[nIdx]) step *= ROAD_STEP_COST;
      if (elevation) {
        const nextElev = elevation[nIdx];
        const delta = nextElev - curElev;
        // An impassable cliff: a single-tile elevation jump too steep to climb.
        if (Math.abs(delta) > CLIFF_STEP && !grid.bridge?.[cur] && !grid.bridge?.[nIdx]) continue;
        step += delta > 0 ? delta * SLOPE_UP_COST : -delta * SLOPE_DOWN_COST;
      }

      const ng = scores[cur] + step;
      if (ng < (stamps[nIdx] === generation ? scores[nIdx] : Infinity)) {
        scores[nIdx] = ng;
        parents[nIdx] = cur;
        stamps[nIdx] = generation;
        open.push(nIdx, ng, ng + h(nx, ny));
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
  if (optimal.path || !optimal.hitNodeCap || !pricedRoadMask(grid)) return optimal;
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

export type NavigationQuote =
  | { readonly status: 'priced'; readonly costTiles: number;
      readonly tiles: readonly Readonly<{ x: number; y: number }>[] }
  | { readonly status: 'unreachable' }
  | { readonly status: 'pending'; readonly reason: 'search-budget' | 'node-budget' | 'complexity-cap' | 'no-grid' };

interface SharedNavigationCache {
  entries: Map<string, Extract<NavigationQuote, { status: 'priced' | 'unreachable' }>>;
  tileCount: number;
}

const SHARED_ROUTE_CACHE_LIMIT = 1024;
const SHARED_ROUTE_TILE_LIMIT = 131072;
const SHARED_ROUTE_NODE_LIMIT = 131072;
let sharedRouteCaches = new WeakMap<PathGrid, SharedNavigationCache>();

/** One directed, immutable and generation-scoped route quote from the existing A*. */
export function getNavigationQuote(
  grid: PathGrid | null,
  start: Readonly<{ x: number; y: number }>,
  goal: Readonly<{ x: number; y: number }>,
  limits: Readonly<{ maxNodes: number }>,
): NavigationQuote {
  if (!grid) return { status: 'pending', reason: 'no-grid' };
  const { cols, rows, blocked } = grid;
  if (![start.x, start.y, goal.x, goal.y].every(Number.isInteger)
    || start.x < 0 || start.y < 0 || goal.x < 0 || goal.y < 0
    || start.x >= cols || goal.x >= cols || start.y >= rows || goal.y >= rows
    || blocked[start.y * cols + start.x] !== 0
    || blocked[goal.y * cols + goal.x] !== 0) {
    return { status: 'unreachable' };
  }
  let cache = sharedRouteCaches.get(grid);
  if (!cache) {
    cache = { entries: new Map(), tileCount: 0 };
    sharedRouteCaches.set(grid, cache);
  }
  const key = `${start.x},${start.y}>${goal.x},${goal.y}`;
  const existing = cache.entries.get(key);
  if (existing) {
    cache.entries.delete(key);
    cache.entries.set(key, existing);
    return existing;
  }
  if ((start.x !== goal.x || start.y !== goal.y)
    && (!Number.isFinite(limits.maxNodes) || Math.floor(limits.maxNodes) <= 0)) {
    return { status: 'pending', reason: 'search-budget' };
  }

  let quote: Extract<NavigationQuote, { status: 'priced' | 'unreachable' }>;
  if (start.x === goal.x && start.y === goal.y) {
    quote = Object.freeze({ status: 'priced' as const, costTiles: 0,
      tiles: Object.freeze([Object.freeze({ x: start.x, y: start.y })]) });
  } else {
    const maxNodes = Math.min(SHARED_ROUTE_NODE_LIMIT, Math.floor(limits.maxNodes));
    const found = searchRoute(grid, start.x, start.y, goal.x, goal.y, maxNodes, true, true);
    if (found.hitNodeCap) {
      return { status: 'pending',
        reason: maxNodes === SHARED_ROUTE_NODE_LIMIT ? 'complexity-cap' : 'node-budget' };
    }
    quote = found.path && found.cost !== null
      ? Object.freeze({ status: 'priced' as const, costTiles: found.cost,
          tiles: Object.freeze(found.path.map((p) => Object.freeze({ x: p.x, y: p.y }))) })
      : Object.freeze({ status: 'unreachable' as const });
  }
  const tiles = quote.status === 'priced' ? quote.tiles.length : 0;
  if (tiles <= SHARED_ROUTE_TILE_LIMIT) {
    while (cache.entries.size >= SHARED_ROUTE_CACHE_LIMIT
      || cache.tileCount + tiles > SHARED_ROUTE_TILE_LIMIT) {
      const oldest = cache.entries.keys().next().value;
      if (oldest === undefined) break;
      const removed = cache.entries.get(oldest)!;
      cache.tileCount -= removed.status === 'priced' ? removed.tiles.length : 0;
      cache.entries.delete(oldest);
    }
    cache.entries.set(key, quote);
    cache.tileCount += tiles;
  }
  return quote;
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
  const valid = [sx, sy, tx, ty].every(Number.isInteger)
    && sx >= 0 && sy >= 0 && tx >= 0 && ty >= 0
    && sx < grid.cols && tx < grid.cols && sy < grid.rows && ty < grid.rows
    && grid.blocked[sy * grid.cols + sx] === 0 && grid.blocked[ty * grid.cols + tx] === 0;
  if (valid) {
    const quote = getNavigationQuote(grid, { x: sx, y: sy }, { x: tx, y: ty }, { maxNodes });
    return { cost: quote.status === 'priced' ? quote.costTiles : null,
      budgetExhausted: quote.status === 'pending' };
  }
  const result = searchRoute(grid, sx, sy, tx, ty, maxNodes, true);
  return { cost: result.cost, budgetExhausted: result.hitNodeCap };
}

/** Tile path → world-coordinate waypoints (tile centers). */
export function pathWaypoints(path: { x: number; y: number }[]): { x: number; y: number }[] {
  const half = PATH_CELL / 2;
  return path.map((p) => ({ x: p.x * PATH_CELL + half, y: p.y * PATH_CELL + half }));
}

/** Keep road turns while merging collinear tiles into safe longer steering legs. */
function collapseStraightWaypoints(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1];
    const at = points[i];
    const after = points[i + 1];
    const ax = Math.sign(at.x - before.x);
    const ay = Math.sign(at.y - before.y);
    const bx = Math.sign(after.x - at.x);
    const by = Math.sign(after.y - at.y);
    if (ax !== bx || ay !== by) result.push(at);
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * The one exact supercover walkability traversal used by direct-line checks, waypoint smoothing
 * and physical walk steps. A blocked origin may be exited by the stepper, never entered later.
 */
function segmentCrossesBlocked(
  grid: PathGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  allowBlockedStart: boolean,
): boolean {
  if (!Number.isFinite(x0) || !Number.isFinite(y0)
    || !Number.isFinite(x1) || !Number.isFinite(y1)) return true;

  const { cols, rows, blocked, elevation } = grid;
  let tx = Math.floor(x0 / PATH_CELL);
  let ty = Math.floor(y0 / PATH_CELL);
  const originX = tx;
  const originY = ty;
  const goalX = Math.floor(x1 / PATH_CELL);
  const goalY = Math.floor(y1 / PATH_CELL);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : PATH_CELL / Math.abs(dx);
  const deltaY = dy === 0 ? Infinity : PATH_CELL / Math.abs(dy);
  let nextX = stepX > 0 ? ((tx + 1) * PATH_CELL - x0) / dx
    : stepX < 0 ? (tx * PATH_CELL - x0) / dx : Infinity;
  let nextY = stepY > 0 ? ((ty + 1) * PATH_CELL - y0) / dy
    : stepY < 0 ? (ty * PATH_CELL - y0) / dy : Infinity;
  let lastElevation: number | null = null;
  let lastBridge = false;

  const isBlocked = (cellX: number, cellY: number, fromElevation: number | null): boolean => {
    if (cellX < 0 || cellY < 0 || cellX >= cols || cellY >= rows) return true;
    const index = cellY * cols + cellX;
    if (blocked[index] && !(allowBlockedStart && cellX === originX && cellY === originY)) return true;
    return !!elevation && fromElevation !== null
      && !lastBridge && !grid.bridge?.[index]
      && Math.abs(elevation[index] - fromElevation) > CLIFF_STEP;
  };

  const maxTransitions = Math.abs(goalX - tx) + Math.abs(goalY - ty);
  for (let crossed = 0; crossed <= maxTransitions; crossed++) {
    if (isBlocked(tx, ty, lastElevation)) return true;
    if (elevation && tx >= 0 && ty >= 0 && tx < cols && ty < rows) {
      lastElevation = elevation[ty * cols + tx];
      lastBridge = !!grid.bridge?.[ty * cols + tx];
    }
    if (tx === goalX && ty === goalY) return false;

    if (tx === goalX && ty !== goalY) {
      ty += stepY;
      nextY += deltaY;
    } else if (ty === goalY && tx !== goalX) {
      tx += stepX;
      nextX += deltaX;
    } else if (nextX < nextY) {
      tx += stepX;
      nextX += deltaX;
    } else if (nextY < nextX) {
      ty += stepY;
      nextY += deltaY;
    } else {
      const crossX = tx !== goalX;
      const crossY = ty !== goalY;
      if (crossX && crossY && (isBlocked(tx + stepX, ty, lastElevation)
        || isBlocked(tx, ty + stepY, lastElevation))) return true;
      if (crossX) { tx += stepX; nextX += deltaX; }
      if (crossY) { ty += stepY; nextY += deltaY; }
    }
  }
  return true;
}

/** A direct line is blocked if any crossed tile, diagonal corner or cliff is impassable. */
export function lineCrossesBlocked(
  grid: PathGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  recordLineCheck();
  return segmentCrossesBlocked(grid, x0, y0, x1, y1, false);
}

/** Module-level "current map" for pathing — set once per tick by the sim. */
let currentGrid: PathGrid | null = null;

/** A cached route stays valid while the settler walks it; reuse ends only when the settler leaves
 *  the current segment (interrupted elsewhere), not on ordinary forward progress. */
const PATH_CACHE_OFF_ROUTE_TOLERANCE = PATH_CELL * 2;

/**
 * How close a walker must come to a waypoint before the route advances — half a tile, so a
 * corner is **reached** and not passed at a tile's distance.
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
  /** The mover that owns this entry, regardless of the activity-specific cache key. */
  walkerId: number;
  targetX: number;
  targetY: number;
  startTileX: number;
  startTileY: number;
  waypoints: { x: number; y: number }[] | null;
  /** A clear walk rejected a road detour; keep direct travel cached across tiles. */
  directDetourRejected?: boolean;
  /** Retry unresolved shared route searches after a bounded pause. */
  retryAfter?: number;
  /** Waypoint the settler is currently walking toward, so progress survives a cache hit. */
  nextIndex: number;
}

const pathCache = new Map<string, CachedPath>();

/** Discard every route for a stuck walker, including leisure and social destinations. */
export function invalidateCommutePathsForWalker(entityId: number): void {
  for (const [key, route] of pathCache) {
    if (route.walkerId === entityId) pathCache.delete(key);
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
  /** The line is blocked, but the bounded search has not proved reachability either way. */
  | 'pending'
  /** The line is blocked and no route exists — the walk stops. */
  | 'blocked';

/**
 * Read-only twin of {@link steerWithPath}: reports what the path owner would do for this leg
 * without writing velocity, position or the steering cache.
 */
export function getRouteObstruction(
  map: WorldMap | null,
  buildings: Building[] | undefined,
  from: { x: number; y: number },
  to: { x: number; y: number },
): RouteObstruction {
  if (!map) return 'clear';
  const grid = getReadOnlyPathGrid(map, buildings);
  if (!lineCrossesBlocked(grid, from.x, from.y, to.x, to.y)) return 'clear';

  const result = walkRoute(
    grid,
    Math.floor(from.x / PATH_CELL),
    Math.floor(from.y / PATH_CELL),
    Math.floor(to.x / PATH_CELL),
    Math.floor(to.y / PATH_CELL),
    PATH_MAX_SEARCH_NODES,
  );
  if (result.path && result.path.length > 1) return 'rerouting';
  return result.hitNodeCap ? 'pending' : 'blocked';
}

/**
 * Steer an entity toward a target, routing around obstacles when the direct line is blocked.
 * Returns how the caller should proceed; the stepper never writes a position.
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
  if (![entity.x, entity.y, targetX, targetY, speed].every(Number.isFinite) || speed < 0) {
    entity.vx = 0;
    entity.vy = 0;
    pathCache.delete(cacheKey);
    return 'blocked';
  }
  if (dist <= PATH_ARRIVAL_DISTANCE_PX) {
    pathCache.delete(cacheKey);
    entity.vx = 0;
    entity.vy = 0;
    return 'arrived';
  }
  if (!currentGrid) return 'direct';

  const directBlocked = lineCrossesBlocked(currentGrid, entity.x, entity.y, targetX, targetY);
  const acceptedRoute = pathCache.get(cacheKey);
  const continueAcceptedRoute = !!acceptedRoute?.waypoints && acceptedRoute.waypoints.length > 1
    && acceptedRoute.targetX === targetX && acceptedRoute.targetY === targetY;
  const considerRoadDetour = !directBlocked && !!pricedRoadMask(currentGrid);
  if (directBlocked || considerRoadDetour || continueAcceptedRoute) {
    let cached = pathCache.get(cacheKey);
    if (cached && (cached.targetX !== targetX || cached.targetY !== targetY
      || (cached.directDetourRejected && (directBlocked
        || Math.abs(cached.startTileX - Math.floor(entity.x / PATH_CELL))
          + Math.abs(cached.startTileY - Math.floor(entity.y / PATH_CELL)) >= ROAD_DETOUR_RECHECK_TILES))
      || (cached.waypoints === null && !cached.directDetourRejected && (cached.startTileX !== Math.floor(entity.x / PATH_CELL)
        || cached.startTileY !== Math.floor(entity.y / PATH_CELL))))) {
      cached = undefined;
    }
    // A pending search is not an unreachable route. Do not run expensive retries every tick.
    if (cached?.retryAfter !== undefined) {
      if (cached.retryAfter <= 1) cached = undefined;
      else cached.retryAfter--;
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
      if (distanceToSegment(entity.x, entity.y, prev.x, prev.y, next.x, next.y) > PATH_CACHE_OFF_ROUTE_TOLERANCE
        || segmentCrossesBlocked(currentGrid, entity.x, entity.y, next.x, next.y, true)) {
        cached = undefined;
      }
    }
    if (cached === undefined) {
      recordPathCacheMiss();
      const startTx = Math.floor(entity.x / PATH_CELL);
      const startTy = Math.floor(entity.y / PATH_CELL);
      const goalTx = Math.floor(targetX / PATH_CELL);
      const goalTy = Math.floor(targetY / PATH_CELL);
      const startBlocked = startTx < 0 || startTy < 0 || startTx >= currentGrid.cols
        || startTy >= currentGrid.rows || currentGrid.blocked[startTy * currentGrid.cols + startTx] !== 0;
      const goalBlocked = goalTx < 0 || goalTy < 0 || goalTx >= currentGrid.cols
        || goalTy >= currentGrid.rows || currentGrid.blocked[goalTy * currentGrid.cols + goalTx] !== 0;
      // Prefer shared optimal geometry; a remote road may exhaust its discounted A* budget.
      // In that case retry with the existing bounded movement heuristic and preserve its
      // path. Never downgrade a confirmed unreachable quote into an unbounded search.
      const shared = startBlocked || goalBlocked ? null : getNavigationQuote(currentGrid,
        { x: startTx, y: startTy }, { x: goalTx, y: goalTy }, { maxNodes: PATH_MAX_SEARCH_NODES });
      const fallback = startBlocked || goalBlocked
        ? walkRoute(currentGrid, startTx, startTy, goalTx, goalTy, PATH_MAX_SEARCH_NODES)
        : shared?.status === 'pending' && !!pricedRoadMask(currentGrid)
          ? searchRoute(currentGrid, startTx, startTy, goalTx, goalTy, PATH_MAX_SEARCH_NODES, false, true)
          : null;
      const routeCost = shared?.status === 'priced' ? shared.costTiles : fallback?.cost ?? null;
      const routeTiles = shared?.status === 'priced'
        ? shared.tiles.map((tile) => ({ x: tile.x, y: tile.y })) : fallback?.path ?? null;
      const routePending = shared?.status === 'pending' && (!fallback || fallback.hitNodeCap);
      // Compare costs with actual first/last legs, not tile-centre A* against exact world distance.
      const startCentreX = (startTx + 0.5) * PATH_CELL;
      const startCentreY = (startTy + 0.5) * PATH_CELL;
      const goalCentreX = (goalTx + 0.5) * PATH_CELL;
      const goalCentreY = (goalTy + 0.5) * PATH_CELL;
      const routeTravel = routeCost === null ? Infinity : routeCost * PATH_CELL
        + Math.hypot(entity.x - startCentreX, entity.y - startCentreY)
        + Math.hypot(targetX - goalCentreX, targetY - goalCentreY);
      const savesTime = !directBlocked && !!pricedRoadMask(currentGrid)
        && !!routeTiles && routeTiles.length > 1 && routeTravel < dist * 0.95;
      let waypoints = routeTiles && (directBlocked || savesTime)
        ? collapseStraightWaypoints(pathWaypoints(routeTiles)) : null;
      // The final A* tile centre is not necessarily the requested destination.
      if (waypoints && !goalBlocked && (waypoints.at(-1)!.x !== targetX || waypoints.at(-1)!.y !== targetY)) {
        waypoints.push({ x: targetX, y: targetY });
      }
      const startIsBlocked = startTx >= 0 && startTy >= 0
        && startTx < currentGrid.cols && startTy < currentGrid.rows
        && currentGrid.blocked[startTy * currentGrid.cols + startTx] === 1;
      if (waypoints && startIsBlocked) {
        waypoints = [{ x: entity.x, y: entity.y }, ...waypoints];
      }
      cached = {
        walkerId: entity.id,
        waypoints, nextIndex: waypoints && waypoints.length > 1 ? 1 : 0,
        targetX, targetY, startTileX: startTx, startTileY: startTy,
        directDetourRejected: !directBlocked && !savesTime,
        retryAfter: routePending && !waypoints ? 32 : undefined,
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

      // The step integrator applies the road multiplier later: cap the base velocity now.
      // This prevents skipping a corner waypoint while keeping long straight road legs fast.
      const boundedSpeed = Math.min(speed, nd / ROAD_SPEED_MULT);
      entity.vx = (ndx / nd) * boundedSpeed;
      entity.vy = (ndy / nd) * boundedSpeed;
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
 * Integrator verdict from the same traversal as A* smoothing and line checks.
 * A walker on blocked ground can leave its start cell, but cannot enter any other blocked cell.
 */
export function isWalkStepAllowed(
  fromX: number, fromY: number, toX: number, toY: number,
  grid: PathGrid | null = currentGrid,
): boolean {
  return !grid || !segmentCrossesBlocked(grid, fromX, fromY, toX, toY, true);
}

/**
 * Whether a walker may **stand** on the ground at a world point — the grid's verdict with no step
 * exemption, so a stand point can move off water, reserved decor or a wall footprint.
 */
export function isGroundWalkableAt(x: number, y: number, grid: PathGrid | null = currentGrid): boolean {
  if (!grid) return true;
  const tx = Math.floor(x / PATH_CELL);
  const ty = Math.floor(y / PATH_CELL);
  if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) return false;
  return grid.blocked[ty * grid.cols + tx] !== 1;
}

/** Walk-speed ownership uses the same completed-road mask as A* and commute pricing. */
export function isOnWalkableRoadAt(x: number, y: number): boolean {
  const grid = currentGrid;
  if (!grid?.road) return false;
  const tx = Math.floor(x / PATH_CELL);
  const ty = Math.floor(y / PATH_CELL);
  return tx >= 0 && ty >= 0 && tx < grid.cols && ty < grid.rows
    && grid.blocked[ty * grid.cols + tx] === 0
    && grid.road[ty * grid.cols + tx] === 1
    && (grid.roadSurfaces?.get(ty * grid.cols + tx)?.some((b) =>
      isRoadSurfacePoint(b, x, y)) ?? true);
}
