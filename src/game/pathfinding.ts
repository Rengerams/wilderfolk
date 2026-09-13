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
import type { Building, Entity, WorldMap } from './gameTypes';
import { BuildingType, TERRAIN_TILE_SIZE, TerrainType } from './gameTypes';

/** Terrain that blocks walking (water + mountains). Snowy ground stays walkable. */
const BLOCKED_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.Mountains,
]);

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
}

let gridCache: PathGrid | null = null;
let gridCacheSeed = '';

export function getPathGrid(map: WorldMap, buildings?: Building[]): PathGrid {
  const seed = typeof map.seed === 'number' ? map.seed : 1;
  const bldSig = buildingSignature(buildings);
  const cacheKey = `${seed}|${bldSig}|${map.width}x${map.height}`;
  if (gridCache && gridCacheSeed === cacheKey) {
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
  if (buildings) {
    for (const b of buildings) {
      if (isBlockingWall(b)) markBuildingBlocked(blocked, cols, rows, b);
    }
  }
  gridCache = { cols, rows, blocked };
  gridCacheSeed = cacheKey;
  return gridCache;
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

  // Resolve walkable neighbors if either endpoint falls on an obstacle
  const startPt = findNearestWalkable(grid, sx, sy);
  const goalPt = findNearestWalkable(grid, tx, ty);
  if (!startPt || !goalPt) return null;

  const actualSx = startPt.x;
  const actualSy = startPt.y;
  const actualTx = goalPt.x;
  const actualTy = goalPt.y;

  if (actualSx === actualTx && actualSy === actualTy) return null;

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

  while (open.length > 0) {
    const entry = open.pop();
    if (!entry) break;
    const cur = entry.node;
    if (entry.g !== (gScore.get(cur) ?? Infinity)) continue;
    if (nodes++ >= maxNodes) break;

    if (cur === goal) {
      const path: { x: number; y: number }[] = [];
      let c = cur;
      while (c !== start && c >= 0) {
        path.push({ x: c % cols, y: (c / cols) | 0 });
        c = came.get(c) ?? -1;
      }
      path.push({ x: actualSx, y: actualSy });
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
      // Prevent corner squeezing through diagonal blocked tiles
      if (dx !== 0 && dy !== 0 && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;

      const nIdx = ny * cols + nx;
      const ng = (gScore.get(cur) ?? Infinity) + (dx !== 0 && dy !== 0 ? 1.4142 : 1);
      if (ng < (gScore.get(nIdx) ?? Infinity)) {
        gScore.set(nIdx, ng);
        came.set(nIdx, cur);
        open.push({ node: nIdx, g: ng, priority: ng + h(nx, ny) });
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
  const span = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  // Sub-tile sampling steps prevent tunneling through 1-tile diagonal obstacles
  const steps = Math.max(4, Math.min(128, Math.ceil(span / (TERRAIN_TILE_SIZE * 0.5))));
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

export function setCurrentPathMap(map: WorldMap | null, buildings?: Building[]): void {
  const next = map ? getPathGrid(map, buildings) : null;
  if (next !== currentGrid) {
    currentGrid = next;
    pathCache.clear();
  }
}

/**
 * Steer an entity toward a target, routing around obstacles when the direct line
 * is blocked. Returns how the caller should proceed:
 * - 'arrived': entity is close enough, stopped.
 * - 'path': entity was moved along waypoints (caller must not move it again).
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
      entity.x += entity.vx;
      entity.y += entity.vy;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      return 'path';
    }
  }
  return 'direct';
}
