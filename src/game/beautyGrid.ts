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
import { EntityType, PATH_CELL } from './gameTypes';

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
  const cx = Math.floor((b.x + b.width / 2) / PATH_CELL);
  const cy = Math.floor((b.y + b.height / 2) / PATH_CELL);
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
  const tx = Math.floor(x / PATH_CELL);
  const ty = Math.floor(y / PATH_CELL);
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

/**
 * Rebuild only the beauty **grid** on `state`, leaving `villageHappiness` alone.
 *
 * Split out of {@link tickBeauty} so a caller that has just reconstituted a world can restore the
 * derived field without discarding the happiness value that was persisted alongside it.
 * `villageHappiness` is in the save allow-list on purpose (`saveSchema.ts`: "derived daily by
 * `beautyGrid` but rendered by the Population panel"), so a load keeps the stored value and the next
 * daily tick may refine it — recomputing here would silently replace the saved number with
 * `HAPPINESS_BASE` for a world whose decor has not been re-stamped yet.
 *
 * No-op without a world map, because the grid's dimensions come from it.
 */
export function rebuildBeautyGridFromWorld(state: WorldState): void {
  const map = state.worldMap;
  if (!map) return;
  state.beautyGrid = rebuildBeautyGrid(state, map.width, map.height);
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
  const tx = Math.floor(cx / PATH_CELL);
  const ty = Math.floor(cy / PATH_CELL);
  let best = { x: cx, y: cy };
  // Start at 0, not -1: a grid with no beauty anywhere then keeps the documented
  // fallback of the caller's own position instead of returning the up-left corner of the
  // search window (the first scanned cell always beat -1).
  let bestValue = 0;
  for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
    for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
      const gx = tx + dx;
      const gy = ty + dy;
      if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) continue;
      const v = grid.values[gy * grid.cols + gx] ?? 0;
      if (v > bestValue) {
        bestValue = v;
        best = { x: (gx + 0.5) * PATH_CELL, y: (gy + 0.5) * PATH_CELL };
      }
    }
  }
  return best;
}