/**
 * Grid pathfinding over the terrain map — settlers/visitors stop walking in
 * straight lines through rivers and mountains.
 *
 * Design: the passability grid is built once per map (cached by seed, preset and
 * size). A* is only invoked when the direct line between an entity and its target
 * actually crosses a blocked tile (cheap sampling), and results are cached per
 * origin-target pair with a bounded cache. Every pathing call falls back to
 * direct movement when no path exists, so nothing can ever deadlock.
 *
 * Occupancy and slope both come from Teraforge's four-layer model: the L0 path
 * grid decides what blocks a step, and the tile's projected elevation decides
 * what a step costs (`CLIFF_STEP` retires the old "water only" rule, which could
 * not express an unclimbable cliff).
 */
import type { Building, Entity, WorldMap } from './gameTypes';
import { BuildingType, TERRAIN_TILE_SIZE } from './gameTypes';
import {
  Walkability,
  isWalkableTerrainType,
  tileAt,
} from './terrain/terrainGrid';
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
import { faceVelocity } from './simulation/movementSteering';

/** Slope cost per unit elevation (0–100 scale) — steep climbs tax the route. */
const SLOPE_UP_COST = 0.015;
const SLOPE_DOWN_COST = 0.004;
/** Single-tile elevation step (0–100 scale) above which the edge is an impassable cliff. */
const CLIFF_STEP = 32;

/** Completed player walls block walking; gates are passable openings. */
function isBlockingWall(b: Building): boolean {
  return b.completed && b.faction !== 'rival' && b.type === BuildingType.Wall;
}

function markBuildingBlocked(blocked: Uint8Array, cols: number, rows: number, b: Building): void {
  const x0 = Math.max(0, Math.floor(b.x / TERRAIN_TILE_SIZE));
  const y0 = Math.max(0, Math.floor(b.y / TERRAIN_TILE_SIZE));
  const x1 = Math.min(cols - 1, Math.floor((b.x + Math.max(0, b.width - 0.001)) / TERRAIN_TILE_SIZE));
  const y1 = Math.min(rows - 1, Math.floor((b.y + Math.max(0, b.height - 0.001)) / TERRAIN_TILE_SIZE));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      blocked[y * cols + x] = 1;
    }
  }
}

/** Lightweight buildings signature so the grid rebuilds only when walls change. */
function buildingSignature(buildings: Building[] | undefined): string {
  if (!buildings?.length) return '';
  let hash = 0;
  let count = 0;
  for (const b of buildings) {
    if (!isBlockingWall(b)) continue;
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
}

let gridCache: PathGrid | null = null;
let gridCacheSeed = '';

/**
 * The passability grid's cache identity. The seed alone does not identify the tiles: two maps can
 * share a seed and size while a different preset produces different terrain, and completed walls
 * change the grid too — so the signature carries all four.
 */
function pathGridCacheKey(map: WorldMap, buildings?: Building[]): string {
  const seed = typeof map.seed === 'number' ? map.seed : 1;
  return `${seed}|${map.preset}|${buildingSignature(buildings)}|${map.width}x${map.height}`;
}

/**
 * The one place a passability grid is built. Both accessors below share it so the blocked-terrain
 * rule and the wall rule exist once (AGENTS.md §5.2) — they differ only in who owns the cache.
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
  if (buildings) {
    for (const b of buildings) {
      if (isBlockingWall(b)) markBuildingBlocked(blocked, cols, rows, b);
    }
  }
  return { cols, rows, blocked, elevation };
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

/** Test seam: drop both grid caches so a case starts from a known state. */
export function resetPathGridCaches(): void {
  gridCache = null;
  gridCacheSeed = '';
  readOnlyGridCache = null;
  readOnlyGridCacheSeed = '';
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
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return true;
}

/** A* over the grid — returns tile path (start..goal inclusive) or null. */
export function findPath(
  grid: PathGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes = 6000,
): { x: number; y: number }[] | null {
  const { cols, rows, blocked, elevation } = grid;
  recordFindPathCall();
  if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) {
    recordPathEarlyReject();
    return null;
  }
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) {
    recordPathEarlyReject();
    return null;
  }

  // Resolve walkable neighbors if either endpoint falls on an obstacle
  const startPt = findNearestWalkable(grid, sx, sy);
  const goalPt = findNearestWalkable(grid, tx, ty);
  if (!startPt || !goalPt) {
    recordPathEarlyReject();
    return null;
  }

  const actualSx = startPt.x;
  const actualSy = startPt.y;
  const actualTx = goalPt.x;
  const actualTy = goalPt.y;

  if (actualSx === actualTx && actualSy === actualTy) {
    recordPathEarlyReject();
    return null;
  }

  const start = actualSy * cols + actualSx;
  const goal = actualTy * cols + actualTx;

  const gScore = new Map<number, number>();
  const came = new Map<number, number>();

  // Octile distance heuristic for 8-direction grids
  const h = (x: number, y: number) => {
    const adx = Math.abs(x - actualTx);
    const ady = Math.abs(y - actualTy);
    return Math.max(adx, ady) + 0.4142 * Math.min(adx, ady);
  };

  const open = new OpenSetMinHeap();
  gScore.set(start, 0);
  open.push({ node: start, g: 0, priority: h(actualSx, actualSy) });
  let nodes = 0;
  let hitNodeCap = false;

  while (open.length > 0) {
    const entry = open.pop();
    if (!entry) break;
    const cur = entry.node;
    if (entry.g !== (gScore.get(cur) ?? Infinity)) continue;
    if (nodes++ >= maxNodes) {
      hitNodeCap = true;
      break;
    }

    if (cur === goal) {
      const path: { x: number; y: number }[] = [];
      let c = cur;
      while (c !== start && c >= 0) {
        path.push({ x: c % cols, y: (c / cols) | 0 });
        c = came.get(c) ?? -1;
      }
      path.push({ x: actualSx, y: actualSy });
      path.reverse();

      // Smooth the route: drop intermediate tiles the walker can see past (line-of-sight).
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
      return simplified;
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
      if (elevation) {
        const nextElev = elevation[nIdx];
        const delta = nextElev - curElev;
        // An impassable cliff: a single-tile elevation jump too steep to climb.
        if (Math.abs(delta) > CLIFF_STEP) continue;
        step += delta > 0 ? delta * SLOPE_UP_COST : -delta * SLOPE_DOWN_COST;
      }

      const ng = (gScore.get(cur) ?? Infinity) + step;
      if (ng < (gScore.get(nIdx) ?? Infinity)) {
        gScore.set(nIdx, ng);
        came.set(nIdx, cur);
        open.push({ node: nIdx, g: ng, priority: ng + h(nx, ny) });
      }
    }
  }

  recordPathNodes(nodes);
  recordPathFailed();
  if (hitNodeCap) recordPathMaxNodesExceeded();
  return null;
}

/** Tile path → world-coordinate waypoints (tile centers). */
export function pathWaypoints(path: { x: number; y: number }[]): { x: number; y: number }[] {
  const half = TERRAIN_TILE_SIZE / 2;
  return path.map((p) => ({ x: p.x * TERRAIN_TILE_SIZE + half, y: p.y * TERRAIN_TILE_SIZE + half }));
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
  const steps = Math.max(4, Math.min(128, Math.ceil(span / (TERRAIN_TILE_SIZE * 0.5))));
  let prevElev: number | null = null;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    const tx = Math.floor(px / TERRAIN_TILE_SIZE);
    const ty = Math.floor(py / TERRAIN_TILE_SIZE);
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

/**
 * Cached waypoints are only valid while the entity is still near the tile the path
 * was computed from: cache keys name a commute leg, not an origin, so a leg begun
 * from somewhere else must not steer the entity back to the old path start.
 */
const PATH_CACHE_ORIGIN_TOLERANCE = TERRAIN_TILE_SIZE * 2;

interface CachedPath {
  originX: number;
  originY: number;
  waypoints: { x: number; y: number }[] | null;
}

const pathCache = new Map<string, CachedPath>();

export function setCurrentPathMap(map: WorldMap | null, buildings?: Building[]): void {
  const next = map ? getPathGrid(map, buildings) : null;
  if (next !== currentGrid) {
    currentGrid = next;
    pathCache.clear();
  }
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
    Math.floor(from.x / TERRAIN_TILE_SIZE),
    Math.floor(from.y / TERRAIN_TILE_SIZE),
    Math.floor(to.x / TERRAIN_TILE_SIZE),
    Math.floor(to.y / TERRAIN_TILE_SIZE),
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
 * - 'direct': no pathing needed/found — caller does its usual straight move.
 */
export function steerWithPath(
  entity: Entity,
  targetX: number,
  targetY: number,
  speed: number,
  cacheKey: string,
): 'arrived' | 'path' | 'direct' {
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist <= 8) {
    entity.vx = 0;
    entity.vy = 0;
    return 'arrived';
  }
  if (!currentGrid) return 'direct';

  if (lineCrossesBlocked(currentGrid, entity.x, entity.y, targetX, targetY)) {
    let cached = pathCache.get(cacheKey);
    if (
      cached === undefined
      || Math.hypot(cached.originX - entity.x, cached.originY - entity.y) > PATH_CACHE_ORIGIN_TOLERANCE
    ) {
      recordPathCacheMiss();
      const path = findPath(
        currentGrid,
        Math.floor(entity.x / TERRAIN_TILE_SIZE),
        Math.floor(entity.y / TERRAIN_TILE_SIZE),
        Math.floor(targetX / TERRAIN_TILE_SIZE),
        Math.floor(targetY / TERRAIN_TILE_SIZE),
      );
      cached = {
        originX: entity.x,
        originY: entity.y,
        waypoints: path ? pathWaypoints(path) : null,
      };
      if (pathCache.size > 200) pathCache.clear();
      pathCache.set(cacheKey, cached);
    } else {
      recordPathCacheHit();
    }

    const wp = cached.waypoints;
    if (wp && wp.length > 1) {
      let i = 0;
      while (i < wp.length - 1 && Math.hypot(wp[i].x - entity.x, wp[i].y - entity.y) < 14) i++;
      const next = wp[i];
      const ndx = next.x - entity.x;
      const ndy = next.y - entity.y;
      const nd = Math.hypot(ndx, ndy) || 1;

      entity.vx = (ndx / nd) * speed;
      entity.vy = (ndy / nd) * speed;
      faceVelocity(entity);
      return 'path';
    }
  }
  return 'direct';
}
