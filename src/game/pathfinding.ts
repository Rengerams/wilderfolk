/**
 * Grid pathfinding over the terrain map — settlers/visitors stop walking in
 * straight lines through rivers and mountains.
 *
 * Design: the passability grid is built once per map (cached by seed). A* is
 * only invoked when the direct line between an entity and its target actually
 * crosses a blocked tile (cheap sampling), and results are cached per
 * origin-target pair with a bounded cache. Every pathing call falls back to
 * direct movement when no path exists, so nothing can ever deadlock.
 */
import type { Entity, WorldMap } from './gameTypes';
import { TERRAIN_TILE_SIZE, TerrainType } from './gameTypes';

/** Terrain that blocks walking (water + mountains). Snowy ground stays walkable. */
const BLOCKED_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.Mountains,
]);

export interface PathGrid {
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

let gridCache: PathGrid | null = null;
let gridCacheSeed = -1;

export function getPathGrid(map: WorldMap): PathGrid {
  const seed = typeof map.seed === 'number' ? map.seed : 1;
  if (gridCache && gridCacheSeed === seed && gridCache.cols === map.width && gridCache.rows === map.height) {
    return gridCache;
  }
  const cols = map.width;
  const rows = map.height;
  const blocked = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = map.tiles[y]?.[x];
      if (t && BLOCKED_TERRAIN.has(t.type)) blocked[y * cols + x] = 1;
    }
  }
  gridCache = { cols, rows, blocked };
  gridCacheSeed = seed;
  return gridCache;
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

/** A* over the grid — returns tile path (start..goal inclusive) or null. */
export function findPath(
  grid: PathGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes = 6000,
): { x: number; y: number }[] | null {
  const { cols, rows, blocked } = grid;
  if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) return null;
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return null;
  if (blocked[sy * cols + sx] || blocked[ty * cols + tx]) return null;
  if (sx === tx && sy === ty) return null;

  const start = sy * cols + sx;
  const goal = ty * cols + tx;
  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  gScore[start] = 0;
  const open: number[] = [start];
  let nodes = 0;

  const h = (x: number, y: number) => Math.max(Math.abs(x - tx), Math.abs(y - ty));

  while (open.length > 0 && nodes++ < maxNodes) {
    let bi = 0;
    let bf = Infinity;
    for (let i = 0; i < open.length; i++) {
      const idx = open[i];
      const f = gScore[idx] + h(idx % cols, (idx / cols) | 0);
      if (f < bf) {
        bf = f;
        bi = i;
      }
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) {
      const path: { x: number; y: number }[] = [];
      let c = cur;
      while (c !== start && c >= 0) {
        path.push({ x: c % cols, y: (c / cols) | 0 });
        c = came[c];
      }
      path.push({ x: sx, y: sy });
      path.reverse();
      return path;
    }
    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (blocked[ny * cols + nx]) continue;
      if (dx !== 0 && dy !== 0 && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
      const nIdx = ny * cols + nx;
      const ng = gScore[cur] + (dx !== 0 && dy !== 0 ? 1.4142 : 1);
      if (ng < gScore[nIdx]) {
        gScore[nIdx] = ng;
        came[nIdx] = cur;
        if (!open.includes(nIdx)) open.push(nIdx);
      }
    }
  }
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
  const steps = Math.max(4, Math.min(24, (Math.abs(x1 - x0) / TERRAIN_TILE_SIZE) | 0));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    const tx = Math.floor(px / TERRAIN_TILE_SIZE);
    const ty = Math.floor(py / TERRAIN_TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) continue;
    if (grid.blocked[ty * grid.cols + tx]) return true;
  }
  return false;
}

/** Module-level "current map" for pathing — set once per tick by the sim. */
let currentGrid: PathGrid | null = null;
const pathCache = new Map<string, { x: number; y: number }[] | null>();

export function setCurrentPathMap(map: WorldMap | null): void {
  const next = map ? getPathGrid(map) : null;
  if (next !== currentGrid) {
    currentGrid = next;
    pathCache.clear();
  }
}

/**
 * Steer an entity toward a target, routing around water when the direct line
 * is blocked. Returns how the caller should proceed:
 * - 'arrived': entity is close enough, stop it.
 * - 'path': entity was moved along waypoints (caller must not move it again).
 * - 'direct': no pathing needed/found — caller does its usual straight move.
 * Only kicks in for long hops (> 90 world px); short movement stays direct.
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
  if (!currentGrid || dist <= 90) return 'direct';

  if (lineCrossesBlocked(currentGrid, entity.x, entity.y, targetX, targetY)) {
    let wp = pathCache.get(cacheKey);
    if (wp === undefined) {
      const path = findPath(
        currentGrid,
        Math.floor(entity.x / TERRAIN_TILE_SIZE),
        Math.floor(entity.y / TERRAIN_TILE_SIZE),
        Math.floor(targetX / TERRAIN_TILE_SIZE),
        Math.floor(targetY / TERRAIN_TILE_SIZE),
      );
      wp = path ? pathWaypoints(path) : null;
      if (pathCache.size > 200) pathCache.clear();
      pathCache.set(cacheKey, wp);
    }
    if (wp && wp.length > 1) {
      let i = 0;
      while (i < wp.length - 1 && Math.hypot(wp[i].x - entity.x, wp[i].y - entity.y) < 14) i++;
      const next = wp[i];
      const ndx = next.x - entity.x;
      const ndy = next.y - entity.y;
      const nd = Math.hypot(ndx, ndy) || 1;
      entity.vx = (ndx / nd) * speed;
      entity.vy = (ndy / nd) * speed;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      return 'path';
    }
  }
  return 'direct';
}
