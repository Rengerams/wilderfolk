/**
 * Neighborhood beauty (Phase 3.2). Decor buildings (gardens, statues, lamps,
 * fences) stamp beauty into a tile grid; settlers drift toward pretty spots in
 * free time and the village gains a small happiness readout from beauty.
 *
 * The grid is transient (rebuilt from buildings each day — decor is rare and
 * static, so a daily rebuild is trivially cheap).
 */
import type { Building, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType } from './buildings';
import { EntityType, TERRAIN_TILE_SIZE } from './gameTypes';

export interface BeautyGrid {
  cols: number;
  rows: number;
  values: Int16Array;
}

/** Beauty falloff radius in tiles around each decor building. */
export const BEAUTY_RADIUS_TILES = 3;
/** Happiness mapping — base 50, +2 per beauty point at a settler's feet. */
export const HAPPINESS_BASE = 50;
export const HAPPINESS_PER_BEAUTY = 2;

export function createBeautyGrid(cols: number, rows: number): BeautyGrid {
  return { cols, rows, values: new Int16Array(cols * rows) };
}

/** Stamp one decor building's beauty into the grid with linear falloff. */
function stampDecor(grid: BeautyGrid, b: Building, beauty: number): void {
  const cx = Math.floor((b.x + b.width / 2) / TERRAIN_TILE_SIZE);
  const cy = Math.floor((b.y + b.height / 2) / TERRAIN_TILE_SIZE);
  const radius = BEAUTY_RADIUS_TILES;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) continue;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const fall = Math.max(0, 1 - (dist - 1) / radius);
      const idx = ty * grid.cols + tx;
      grid.values[idx] = Math.min(127, grid.values[idx] + Math.round(beauty * fall));
    }
  }
}

/** Rebuild the beauty grid from the world's completed player decor buildings. */
export function rebuildBeautyGrid(
  state: WorldState,
  cols: number,
  rows: number,
): BeautyGrid {
  const grid = createBeautyGrid(cols, rows);
  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    const beauty = BUILDING_CONFIGS[b.type]?.beauty;
    if (beauty) stampDecor(grid, b, beauty);
  }
  return grid;
}

/** Beauty value at a world position (0 when outside the map). */
export function beautyAt(grid: BeautyGrid | null, x: number, y: number): number {
  if (!grid) return 0;
  const tx = Math.floor(x / TERRAIN_TILE_SIZE);
  const ty = Math.floor(y / TERRAIN_TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) return 0;
  return grid.values[ty * grid.cols + tx] ?? 0;
}

/** Village happiness 0–100 from the average beauty under each settler. */
export function computeVillageHappiness(
  grid: BeautyGrid | null,
  positions: readonly { x: number; y: number }[],
): number {
  if (!grid || positions.length === 0) return HAPPINESS_BASE;
  let sum = 0;
  for (const p of positions) sum += beautyAt(grid, p.x, p.y);
  const avg = sum / positions.length;
  return Math.max(0, Math.min(100, HAPPINESS_BASE + avg * HAPPINESS_PER_BEAUTY));
}

/** True if a decor building type exists (kept for fast checks in the renderer). */
export function isDecorType(type: BuildingType): boolean {
  return BUILDING_CONFIGS[type]?.decor === true;
}

/** Daily: rebuild the beauty grid from buildings and refresh village happiness. */
export function tickBeauty(state: WorldState): void {
  const map = state.worldMap;
  if (!map) return;
  const grid = rebuildBeautyGrid(state, map.width, map.height);
  state.beautyGrid = grid;
  state.villageHappiness = computeVillageHappiness(
    grid,
    state.entities.filter((e) => e.type === EntityType.Human && e.alive),
  );
}

/**
 * The prettiest world spot within `radiusTiles` of (cx, cy) — used to nudge
 * free-time destinations. Falls back to (cx, cy) when the grid is missing, so
 * callers can always steer somewhere.
 */
export function pickBeautySpot(
  grid: BeautyGrid | null,
  cx: number,
  cy: number,
  radiusTiles = 5,
): { x: number; y: number } {
  if (!grid) return { x: cx, y: cy };
  const tx = Math.floor(cx / TERRAIN_TILE_SIZE);
  const ty = Math.floor(cy / TERRAIN_TILE_SIZE);
  let best = { x: cx, y: cy };
  let bestValue = -1;
  for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
    for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
      const gx = tx + dx;
      const gy = ty + dy;
      if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) continue;
      const v = grid.values[gy * grid.cols + gx] ?? 0;
      if (v > bestValue) {
        bestValue = v;
        best = { x: (gx + 0.5) * TERRAIN_TILE_SIZE, y: (gy + 0.5) * TERRAIN_TILE_SIZE };
      }
    }
  }
  return best;
}
