/**
 * The terrain data model's single reader: the four-layer grid (L1 build, L0 path, L2 continuous
 * fields, L3 decorations). Consumers go through `tileAt`/`tileTypeAt`; there is no `map.tiles`.
 */
import { TerrainType, PATH_CELL, type TerrainTile, type WorldMap } from '../gameTypes';
import { clamp, lerp, valueNoise, hashString } from './noise';
// The unbuildable-terrain rule lives in the leaf `terrainTraits` so this file can read it without
// importing `placementUtils`, which imports `tileAt` from here (a cycle).
import { isUnbuildableTerrainType } from './terrainTraits';

/**
 * L2 cell edge (px) — the biome / continuous-field resolution. One number because the generator,
 * the L0 grid, the tile projection and the per-pixel bake must agree; changing it reclassifies tiles.
 */
export const TERRAIN_CELL = 16;

/**
 * Water mask edge (px), sampled in the map's own water dimensions (`waterCols`/`waterRows`), so a
 * finer shoreline does not force the climate field to the same resolution.
 */
export const WATER_CELL = 16;

/** L1 build-cell edge (px). */
export const BUILD_CELL = 20;

/** Default effective sea level when a map predates the stored field. */
export const DEFAULT_SEA_LEVEL = 0.24;

const idx = (x: number, y: number, w: number): number => y * w + x;

/* ===== Continuous fields (L2) ===== */

/** Bilinear sample of a cell field at fractional cell coordinates. */
export function sampleElev(
  el: Float32Array,
  cols: number,
  rows: number,
  x: number,
  y: number,
): number {
  const xi = clamp(Math.floor(x), 0, cols - 1);
  const yi = clamp(Math.floor(y), 0, rows - 1);
  const xi2 = Math.min(xi + 1, cols - 1);
  const yi2 = Math.min(yi + 1, rows - 1);
  const fx = clamp(x - xi, 0, 1);
  const fy = clamp(y - yi, 0, 1);
  return lerp(
    lerp(el[idx(xi, yi, cols)], el[idx(xi2, yi, cols)], fx),
    lerp(el[idx(xi, yi2, cols)], el[idx(xi2, yi2, cols)], fx),
    fy,
  );
}

/**
 * The 13 Wilderfolk terrain types, projected from the continuous fields. Owner of the biome-band
 * thresholds: the L0 path grid and every `tileAt` call read this, so tile type cannot disagree.
 */
export const DEFAULT_MOISTURE_FOREST = 0.6;
const DEFAULT_MOISTURE_DARK_FOREST = 0.72;
/** How far below the forest cut the dry end of the moisture range sits. Exported beside the cut
 *  itself because the ground bake decides grass-versus-dirt on the same two numbers. */
export const MOISTURE_DRY_BELOW_FOREST = 0.14;
/**
 * 0–1 temperature below which the land is boreal rather than temperate, and cold enough for snow on
 * the high ground. Exported because the ground bake gates its snow the same way.
 */
export const COLD_TEMPERATURE = 0.3;
/** Hot enough, and dry enough, to be desert rather than steppe. */
const DESERT_TEMPERATURE = 0.58;
const DESERT_MOISTURE_DEFICIT = 0.05;
/**
 * Shore band as a fraction of the land range, so beach width stays constant across presets.
 * Exported so the ground bake's sand ends exactly where the `Beach` tile ends.
 */
export const BEACH_BAND_OF_LAND_RANGE = 0.045;

/**
 * Where each relief band begins, as a fraction of the land range (0 = waterline, 1 = highest land);
 * `classifyTile`'s own axis. Exported so the ground bake and the walkable tile agree.
 */
export const LAND_BANDS = {
  hills: 0.5,
  rocky: 0.62,
  mountains: 0.72,
  snow: 0.84,
} as const;


/**
 * Biome-boundary dither, in band units: a coherent zero-mean shift moves where a boundary falls,
 * never which biomes exist, so edges interlock instead of meeting on a lattice line.
 */
export const BIOME_EDGE_DITHER = 0.055;

/** Shared biome-edge offset for L0/L1 projection and static scenery placement. */
export function biomeEdgeDither(e: number, seaLevel: number): number {
  return e >= seaLevel ? (e - seaLevel - (1 - seaLevel) * 0.5) * BIOME_EDGE_DITHER : 0;
}

/**
 * `dither` shifts every band at once. Callers pass a coherent zero-mean sample (the cell's own
 * elevation) so neighbouring cells agree on which way to lean.
 */
export function classifyTile(
  e: number,
  mo: number,
  te: number,
  rd: number,
  seaLevel: number,
  moistureForest = DEFAULT_MOISTURE_FOREST,
  moistureDarkForest = DEFAULT_MOISTURE_DARK_FOREST,
  dither = 0,
): TerrainType {
  if (rd > 0.55) return TerrainType.River;
  if (rd > 0.32) return TerrainType.RiverBank;
  if (e < seaLevel - 0.09) return TerrainType.DeepWater;
  if (e < seaLevel) return TerrainType.ShallowWater;

  const landRange = 1 - seaLevel;
  if (e < seaLevel + (BEACH_BAND_OF_LAND_RANGE + dither) * landRange) return TerrainType.Beach;

  const h = (e - seaLevel) / landRange;
  const dryCut = moistureForest - MOISTURE_DRY_BELOW_FOREST;

  // Elevation is the outer gate: below the alpine line climate decides what grows, above it rock
  // and then snow wherever the air is cold enough.
  if (h >= LAND_BANDS.snow + dither) return te < COLD_TEMPERATURE ? TerrainType.Snow : TerrainType.Mountains;
  if (h >= LAND_BANDS.mountains + dither) return TerrainType.Mountains;
  if (h >= LAND_BANDS.rocky + dither) return TerrainType.Rocky;
  if (h >= LAND_BANDS.hills + dither) return TerrainType.Hills;

  // Cold ground: temperature, not height, is what makes taiga out of a forest.
  if (te < COLD_TEMPERATURE + dither) return TerrainType.DarkForest;
  // Hot + dry corner of the chart — real desert, not grassland, so the minimap, footstep surface
  // and fallback tile bake can tell arid ground from pasture.
  if (te > DESERT_TEMPERATURE + dither && mo < dryCut + DESERT_MOISTURE_DEFICIT) return TerrainType.Desert;
  if (mo > moistureDarkForest + dither) return TerrainType.DarkForest;
  if (mo > moistureForest + dither) return TerrainType.Forest;
  return TerrainType.Grassland;
}
/** True when the map carries the L2 continuous fields Teraforge reads. */
export function hasContinuousFields(map: WorldMap): boolean {
  return !!(
    map.cols
    && map.rows
    && map.elevation
    && map.moisture
    && map.temperature
    && map.terrain
    && map.riverDist
  );
}

/** World pixel → tile coordinate (floored), no bounds check. */
export function worldToTile(worldX: number, worldY: number): { tx: number; ty: number } {
  return {
    tx: Math.floor(worldX / PATH_CELL),
    ty: Math.floor(worldY / PATH_CELL),
  };
}

/* ===== Tile projection ===== */

/**
 * Cached projections, one `Map` per world keyed by tile index, held on a `WeakMap` so a discarded
 * world takes its entries with it.
 */
const projectionCache = new WeakMap<WorldMap, Map<number, TerrainTile>>();

/** Tile (tx, ty) → world pixel of the tile centre. */
export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  const half = PATH_CELL / 2;
  return { x: tx * PATH_CELL + half, y: ty * PATH_CELL + half };
}

/** True when a tile coordinate is inside the map's L0 tile grid. */
export function isInsideTileGrid(map: WorldMap, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
}

/**
 * The `TerrainTile` at (tx, ty), or `undefined` when the coordinate is off-map or the map has no
 * continuous fields.
 */
export function tileAt(map: WorldMap, tx: number, ty: number): TerrainTile | undefined {
  if (!isInsideTileGrid(map, tx, ty)) return undefined;

  const override = map.overrides?.get(ty * map.width + tx);
  if (override) return override;

  let cache = projectionCache.get(map);
  const key = ty * map.width + tx;
  const cached = cache?.get(key);
  if (cached) return cached;

  const projected = projectTile(map, tx, ty);
  if (!projected) return undefined;

  if (!cache) {
    cache = new Map<number, TerrainTile>();
    projectionCache.set(map, cache);
  }
  cache.set(key, projected);
  return projected;
}

/** The `TerrainType` at (tx, ty), or `null` when off-map / unprojectable. */
export function tileTypeAt(map: WorldMap, tx: number, ty: number): TerrainType | null {
  return tileAt(map, tx, ty)?.type ?? null;
}

/** World pixel → tile type, or `null` when off-map. The audio/UI convenience form. */
export function tileTypeAtWorld(map: WorldMap | null, worldX: number, worldY: number): TerrainType | null {
  if (!map) return null;
  const { tx, ty } = worldToTile(worldX, worldY);
  return tileTypeAt(map, tx, ty);
}

function projectTile(map: WorldMap, tx: number, ty: number): TerrainTile | undefined {
  const { cols, rows, elevation, moisture, temperature, riverDist } = map;
  if (!cols || !rows || !elevation || !moisture || !temperature || !riverDist) return undefined;
  // Water carries its own dimensions; a map without them falls back to the biome lattice.
  const waterCols = map.waterCols ?? cols;
  const waterRows = map.waterRows ?? rows;

  const { x: wx, y: wy } = tileToWorld(tx, ty);
  const cx = wx / TERRAIN_CELL;
  const cy = wy / TERRAIN_CELL;
  const e = sampleElev(elevation, cols, rows, cx, cy);
  const mo = sampleElev(moisture, cols, rows, cx, cy);
  const te = sampleElev(temperature, cols, rows, cx, cy);
  // Water has its own, finer lattice (see `WATER_CELL`) — sampled in its own cell coordinates,
  // which cover the same world span, so the coast is drawn at 16 px instead of 64 px.
  const rd = sampleElev(riverDist, waterCols, waterRows, wx / WATER_CELL, wy / WATER_CELL);
  const seaLevel = map.seaLevel ?? DEFAULT_SEA_LEVEL;

  // The cell's own elevation is the coherent zero-mean dither source: no second noise pass, and it
  // varies per cell grid, keeping edges ragged rather than noisy. Underwater keeps a straight coast.
  const dither = biomeEdgeDither(e, seaLevel);

  return {
    type: classifyTile(
      e, mo, te, rd, seaLevel,
      map.moistureForestThreshold,
      map.moistureDarkForestThreshold,
      dither,
    ),
    elevation: e * 100,
    moisture: mo * 100,
    variation: valueNoise(wx * 0.032, wy * 0.032, hashString(String(map.seed)) + 7777),
  };
}

/* ===== Render invalidation ===== */

/** Invalidation cell (world px): the smallest ground chunk, so a footprint dirties only its own. */
export const TERRAIN_RENDER_CELL = 256;

export interface TerrainDirtyRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

let terrainRevision = 0;
const dirtyCells = new Map<string, number>();

/** Visit every render cell a world rect covers; an empty rect visits none. */
function forEachDirtyCell(rect: TerrainDirtyRect, visit: (key: string) => void): void {
  if (rect.right <= rect.left || rect.bottom <= rect.top) return;
  const x0 = Math.floor(rect.left / TERRAIN_RENDER_CELL);
  const x1 = Math.floor((rect.right - 1) / TERRAIN_RENDER_CELL);
  const y0 = Math.floor(rect.top / TERRAIN_RENDER_CELL);
  const y1 = Math.floor((rect.bottom - 1) / TERRAIN_RENDER_CELL);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) visit(`${cx},${cy}`);
  }
}

/**
 * Bump the terrain revision. Passing the changed world rect invalidates only the render cells it
 * covers, so a forest-clearing footprint does not dispose every other ground chunk.
 */
export function bumpTerrainRevision(rect?: TerrainDirtyRect): void {
  terrainRevision++;
  if (!rect) return;
  forEachDirtyCell(rect, (key) => dirtyCells.set(key, (dirtyCells.get(key) ?? 0) + 1));
}

/** Monotonic whole-terrain revision — the path grid keys on it. */
export function getTerrainRevision(): number {
  return terrainRevision;
}

/** Exact per-cell revision identity for one ground-chunk rect. */
export function terrainRegionRevision(rect: TerrainDirtyRect): string {
  const parts: string[] = [];
  forEachDirtyCell(rect, (key) => parts.push(String(dirtyCells.get(key) ?? 0)));
  return parts.length > 0 ? parts.join(',') : '0';
}

/* ===== Overrides ===== */

/** Write one sparse tile override (camp clearing / forest clearing). */
export function setTileOverride(map: WorldMap, tx: number, ty: number, tile: TerrainTile): void {
  if (!isInsideTileGrid(map, tx, ty)) return;
  if (!map.overrides) map.overrides = new Map();
  map.overrides.set(ty * map.width + tx, tile);
  projectionCache.get(map)?.delete(ty * map.width + tx);
}

/** One tile change recorded for a cross-realm replica; the worker ships these with its delta. */
export interface TerrainTilePatch {
  tx: number;
  ty: number;
  tile: TerrainTile;
}

const MAX_PENDING_TERRAIN_PATCHES = 256;

/** Take the patches recorded on this map since the last call, so a command result can carry them. */
export function takeTerrainPatches(map: WorldMap | null | undefined): TerrainTilePatch[] {
  if (!map?.pendingTerrainPatches) return [];
  const patches = map.pendingTerrainPatches.splice(0);
  delete map.pendingTerrainPatches;
  return patches;
}

/** Patch one field of a tile in place (e.g. clear forest → grassland). */
export function patchTile(map: WorldMap, tx: number, ty: number, patch: Partial<TerrainTile>): void {
  const cur = tileAt(map, tx, ty);
  if (!cur) return;
  const tile = { ...cur, ...patch };
  setTileOverride(map, tx, ty, tile);
  const pending = map.pendingTerrainPatches ?? (map.pendingTerrainPatches = []);
  if (pending.length >= MAX_PENDING_TERRAIN_PATCHES) pending.shift();
  pending.push({ tx, ty, tile });
}

/* ===== L0 / L1 occupancy ===== */

/** Deep water and rivers block walking; shallow water is wadeable. */
const WALK_BLOCKED_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.River,
]);

export const Walkability = {
  /** Free to walk. */
  Open: 0,
  /** Water — bars walking and building alike. */
  Water: 1,
  /** Hard decor the generator reserved (big rock) — bars walking. */
  Reserved: 2,
} as const;

export const Buildability = {
  /** Free to build on. */
  Open: 0,
  /** Water. */
  Water: 1,
  /** Hard ground (mountain / snow / swamp) or reserved decor. */
  Hard: 2,
  /** Partially water or hard — a footprint that only clips it is still refused. */
  Mixed: 3,
} as const;

/** True when the terrain type alone permits walking (the L0 rule without the grid). */
export function isWalkableTerrainType(type: TerrainType): boolean {
  return !WALK_BLOCKED_TERRAIN.has(type);
}

/**
 * Whether the terrain behind a 10px cell accepts a structure. Reads the same
 * `isUnbuildableTerrainType` owner as the placement rules, so the two cannot disagree.
 */
export function isTileBuildable(map: WorldMap, tx: number, ty: number): boolean {
  const tile = tileAt(map, tx, ty);
  if (!tile) return false;
  return !isUnbuildableTerrainType(tile.type);
}

/* ===== Re-bake after generation edits ===== */

function rebakePathCell(map: WorldMap, tx: number, ty: number): void {
  const grid = map.pathGrid;
  if (!grid) return;
  const previous = grid[ty * map.width + tx];
  const type = tileTypeAt(map, tx, ty);
  // Reserved decor cells (a big rock the L3 pass blocked) are not terrain, so a
  // clearing must not un-reserve one that survived the edit.
  if (type === null) return;
  // Preserve generator decor reservations unless this tile was explicitly edited.
  if (previous === Walkability.Reserved && !map.overrides?.has(ty * map.width + tx)) return;
  grid[ty * map.width + tx] = isWalkableTerrainType(type) ? Walkability.Open : Walkability.Water;
}

function rebakeBuildCell(map: WorldMap, bx: number, by: number): void {
  const grid = map.buildGrid;
  const bCols = map.bCols;
  const bRows = map.bRows;
  if (!grid || !bCols || !bRows) return;

  const per = BUILD_CELL / PATH_CELL;
  let water = 0;
  let reserved = 0;
  let hard = 0;
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const tx = Math.min(map.width - 1, bx * per + i);
      const ty = Math.min(map.height - 1, by * per + j);
      const value = map.pathGrid?.[ty * map.width + tx] ?? Walkability.Open;
      if (value === Walkability.Water) water++;
      else if (value === Walkability.Reserved) reserved++;
      if (!isTileBuildable(map, tx, ty)) hard++;
    }
  }
  grid[by * bCols + bx] = water
    ? Buildability.Water
    : hard
      ? Buildability.Hard
      : reserved
        ? Buildability.Mixed
        : Buildability.Open;
}

/**
 * Re-derive the L0 path grid and the L1 build grid over a tile rectangle after terrain edits;
 * worldgen clears the camp area after the bake. `margin` widens the refresh by whole tiles.
 */
export function rebakeTerrainGrids(
  map: WorldMap,
  opts: { startTx: number; endTx: number; startTy: number; endTy: number; margin?: number },
): void {
  if (!map.pathGrid) return;
  const margin = opts.margin ?? 1;
  const startTx = Math.max(0, Math.floor(opts.startTx) - margin);
  const endTx = Math.min(map.width - 1, Math.ceil(opts.endTx) + margin);
  const startTy = Math.max(0, Math.floor(opts.startTy) - margin);
  const endTy = Math.min(map.height - 1, Math.ceil(opts.endTy) + margin);

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) rebakePathCell(map, tx, ty);
  }

  const per = BUILD_CELL / PATH_CELL;
  for (let by = Math.floor(startTy / per); by <= Math.ceil(endTy / per); by++) {
    for (let bx = Math.floor(startTx / per); bx <= Math.ceil(endTx / per); bx++) {
      rebakeBuildCell(map, bx, by);
    }
  }
}