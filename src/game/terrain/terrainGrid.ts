/**
 * The terrain data model's single reader: the four-layer grid.
 *
 * Teraforge bakes the world into flat typed arrays and keeps **no** `TerrainTile[][]`
 * (roadmap v0.6.5, Theme 1). This module is the one place that projects a
 * per-tile `TerrainTile` back out of them, and the one place that owns the
 * sparse override layer, the L0 path grid and the L1 build grid:
 *
 * ```text
 * L1 build grid  20 px   buildGrid  (0 buildable · 1 water · 2 hard · 3 mixed)
 * L0 path grid   10 px   pathGrid   (0 walkable · 1 water · 2 hard decor)
 * L2 continuous   64 px   elevation · moisture · temperature · terrain · riverDist
 * L3 decor               map.decorations
 * ```
 *
 * Every consumer that used to index `map.tiles[ty][tx]` goes through
 * {@link tileAt} / {@link tileTypeAt} instead, so the representation can change
 * without touching the ~60 call sites again. `WorldMap.overrides` (camp and
 * forest clearing) is applied on read and {@link rebakeTerrainGrids} keeps the
 * two grids consistent with it.
 *
 * Ids are raw 0/1/2 values because these arrays are written by hand in hot
 * loops; {@link Walkability} and {@link Buildability} are the named owners of
 * their meaning.
 */
import { TerrainType, TERRAIN_TILE_SIZE, type TerrainTile, type WorldMap } from '../gameTypes';
import { BIOME_BY_IDX, type BiomeDef } from './biomes';
import { clamp, lerp, valueNoise, hashString } from './noise';
// The unbuildable-terrain rule lives in a leaf module (`terrainTraits`) precisely so this file can
// read it without importing `placementUtils`, which imports `tileAt` from here — that pair was a
// runtime cycle (audit T16).
import { isUnbuildableTerrainType } from './terrainTraits';

/**
 * L2 cell edge (px) — the biome / continuous-field resolution.
 *
 * This is the model's sharpest visual limit: a biome boundary lands on this lattice, so the
 * constant sets how coarse a climate edge is. It is one number because the generator, the L0 grid,
 * the tile projection and the per-pixel bake must all agree on it — a second copy anywhere would
 * let terrain and the ground art disagree about where a cell ends.
 *
 * It is **16**, down from Teraforge's 64 (2026-09-24): the water layer was split onto its own
 * lattice first (see {@link WATER_CELL}), which meant dropping this one reclassified nothing any
 * fixture pinned. Changing it again is *not* a safe one-line change — a map built on a different
 * lattice reclassifies tiles, and that reaches tests which pin terrain-dependent outcomes
 * (`workerMainThread.parity` diverged between the worker and the main thread when this moved, and
 * the hand-built pathfinding fixture pins a river by cell coordinate).
 */
export const TERRAIN_CELL = 16;

/**
 * Water mask edge (px). Deliberately **not** the biome cell size.
 *
 * One resolution cannot serve both layers: the climate/biome field is smooth and happy at 64 px,
 * while the water mask is where the eye sees structure — a coastline, a river bank — and at 64 px
 * a channel and its banks are whole cells, so the waterline is a staircase. Real map generators
 * give the water layer its own finer resolution, and so does this: rivers and the shoreline are
 * rasterised at 16 px, which is the smallest step the 10 px path grid can represent without
 * aliasing, and the biome field is left exactly where it was. That is what makes this change safe
 * — not one tile reclassifies, so no fixture and no determinism check moves.
 */
export const WATER_CELL = 16;

/** L1 build-cell edge (px). */
export const BUILD_CELL = 20;
/** L0 path-cell edge (px) — equal to Wilderfolk's `TERRAIN_TILE_SIZE`. */
export const PATH_CELL = TERRAIN_TILE_SIZE;

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

/** The 15-biome classification at fractional cell coordinates. */
export function biomeIndexAt(
  map: WorldMap,
  cellX: number,
  cellY: number,
): number {
  const { cols, rows, terrain } = map;
  if (!cols || !rows || !terrain) return 0;
  const x = clamp(Math.floor(cellX), 0, cols - 1);
  const y = clamp(Math.floor(cellY), 0, rows - 1);
  return terrain[idx(x, y, cols)];
}

/** The biome definition at fractional cell coordinates. */
export function biomeAt(map: WorldMap, cellX: number, cellY: number): BiomeDef {
  return BIOME_BY_IDX[biomeIndexAt(map, cellX, cellY)];
}

/**
 * The 12 Wilderfolk terrain types, projected from the continuous fields.
 *
 * Owner of the biome-band thresholds: the L0 path grid and every `tileAt` call
 * read this one function, so a tile can never be `River` for the renderer and
 * walkable for the pathfinder.
 *
 * The land rules follow the biome chart the overhaul is modelled on — precipitation against
 * temperature — where **grassland is the dry-temperate biome**, not a catch-all: open grass
 * sits in the middle of the moisture range, forest above it, desert at the hot-and-dry
 * corner, and tundra/taiga wherever the air is cold. The first version of this used grassland
 * as the fallback for every unmatched cell, which is why a generated map came out either
 * 40 % grass with 1 % forest or 1 % grass with 47 % forest depending on one threshold.
 *
 * The moisture cuts are supplied by the generator from each map's own precipitation
 * distribution (`WorldMap.moistureForestThreshold`). Absolute constants cannot work: the
 * tile-level field runs 0.47 at p50 on an arid preset and 0.73 on a wet one, so a fixed cut
 * paints one map entirely grass and the next entirely canopy.
 */
export const DEFAULT_MOISTURE_FOREST = 0.6;
const DEFAULT_MOISTURE_DARK_FOREST = 0.72;
/** How far below the forest cut the dry end of the moisture range sits. Exported beside the cut
 *  itself because the ground bake decides grass-versus-dirt on the same two numbers. */
export const MOISTURE_DRY_BELOW_FOREST = 0.14;
/**
 * 0–1 temperature below which the land is cold enough to be boreal rather than temperate — and,
 * above the snow line, cold enough for snow rather than bare rock.
 *
 * Exported because the ground bake gates its snow the same way: a `Mountains` tile that the air is
 * too warm to cap must not be painted white.
 */
export const COLD_TEMPERATURE = 0.3;
/** Hot enough, and dry enough, to be desert rather than steppe. */
const DESERT_TEMPERATURE = 0.58;
const DESERT_MOISTURE_DEFICIT = 0.05;
/**
 * Shore band as a fraction of the land range. Teraforge's `seaLevel + 0.04` is in *absolute*
 * elevation units and covers 5.6 % of the land range at sea 0.28 — but a low-sea preset has a
 * far wider land range, so the same literal painted 14 % of a `rivers` map as beach. Scaling
 * it by the land range keeps one beach width across presets.
 *
 * Exported so the ground bake's sand ends exactly where the `Beach` tile ends: an absolute sand
 * ramp bled its pale band onto the first grass tiles of every shore.
 */
export const BEACH_BAND_OF_LAND_RANGE = 0.045;

/**
 * Where each relief band begins, as a fraction of the **land range** (0 = the waterline, 1 = the
 * highest land on the map) — `classifyTile`'s own axis, and the reason it is exported.
 *
 * The per-pixel ground bake colours land on absolute elevation above sea level, which on a preset
 * with `seaLevel ≥ 0.12` puts `snow` (0.88 absolute) beyond the map's maximum height: measured on a
 * 2560×1920 scandinavia map the field tops out at 1.077 while the ramp only turned white at 1.176,
 * so **0.0 % of the land could ever paint snow** while 1.0 % of its tiles were `Snow` — and the same
 * map's 2.9 % `Rocky` / 1.2 % `Mountains` tiles were painted lawn green. These numbers are the
 * classification's, so the ground art and the tile a settler walks on cannot disagree about where
 * the mountains start.
 */
export const LAND_BANDS = {
  hills: 0.5,
  rocky: 0.62,
  mountains: 0.72,
  snow: 0.84,
} as const;


/**
 * Biome-boundary dither, in band units. A coherent zero-mean value shifts every threshold at
 * once, so two biomes interlock along a ragged edge instead of meeting on a lattice line — the
 * standard way a precipitation × temperature classifier stops looking like a Voronoi diagram.
 * It moves *where* a boundary falls, never which biomes exist or in what proportion.
 */
export const BIOME_EDGE_DITHER = 0.055;

/**
 * `dither` shifts every band at once. Callers pass a coherent zero-mean noise sample
 * (`terrainGrid` uses the cell's own elevation, which is already a smooth field at exactly the
 * scale a boundary should wander at) so neighbouring cells agree on which way to lean.
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

  // Elevation is the outer gate. Below the alpine line, climate decides what grows; above it
  // there is rock, and then snow wherever the air is actually cold enough for it. Order
  // matters: the first version tested moisture before height, so a forested highland never
  // reached the rock bands at all and generated 66 % forest with 0 % mountain.
  if (h >= LAND_BANDS.snow + dither) return te < COLD_TEMPERATURE ? TerrainType.Snow : TerrainType.Mountains;
  if (h >= LAND_BANDS.mountains + dither) return TerrainType.Mountains;
  if (h >= LAND_BANDS.rocky + dither) return TerrainType.Rocky;
  if (h >= LAND_BANDS.hills + dither) return TerrainType.Hills;

  // Cold ground: temperature, not height, is what makes taiga out of a forest.
  if (te < COLD_TEMPERATURE + dither) return TerrainType.DarkForest;
  // Hot + dry corner of the chart — sand and scrub, which Wilderfolk reads as grassland.
  // Hot + dry corner of the chart — real desert, not grassland. It classifies as its own type so the
  // minimap, the footstep surface and the fallback tile bake can all tell arid ground from pasture;
  // before this the corner returned `Grassland` and an Arabian map read as grass to every one of them
  // while the per-pixel bake painted it sand.
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
    tx: Math.floor(worldX / TERRAIN_TILE_SIZE),
    ty: Math.floor(worldY / TERRAIN_TILE_SIZE),
  };
}

/* ===== Tile projection ===== */

/**
 * Cached projections, one `Map` per world keyed by tile index. Held on a
 * `WeakMap` so a discarded world (new game, loaded save) takes its entries with
 * it; the rendered/queried tiles are a small fraction of a Huge map, so this
 * costs far less than materialising the whole grid.
 */
const projectionCache = new WeakMap<WorldMap, Map<number, TerrainTile>>();

/** Tile (tx, ty) → world pixel of the tile centre. */
export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  const half = TERRAIN_TILE_SIZE / 2;
  return { x: tx * TERRAIN_TILE_SIZE + half, y: ty * TERRAIN_TILE_SIZE + half };
}

/** True when a tile coordinate is inside the map's L0 tile grid. */
export function isInsideTileGrid(map: WorldMap, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
}

/** The sparse per-tile override (camp clearing / cleared forest), if any. */
export function tileOverrideAt(map: WorldMap, tx: number, ty: number): TerrainTile | undefined {
  if (!isInsideTileGrid(map, tx, ty)) return undefined;
  return map.overrides?.get(ty * map.width + tx);
}

/**
 * The `TerrainTile` at (tx, ty), or `undefined` when the coordinate is off-map
 * or the map has no continuous fields (a map stored by an older build).
 *
 * This is the replacement for `map.tiles[ty][tx]`.
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
  // Water carries its own dimensions; a map written before the split falls back to the biome
  // lattice, which is where the field used to live.
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

  // The cell's own elevation is a smooth field already sitting in cache, so it doubles as the
  // coherent zero-mean source for the boundary dither — no second noise evaluation, and it
  // varies across the cell grid rather than per tile, which is what keeps an edge ragged
  // instead of noisy. Underwater cells keep a straight shoreline: a dithered coast reads as a
  // ragged delta at low zoom, and the water/land boundary is the one a player navigates by.
  const dither = e >= seaLevel ? (e - seaLevel - (1 - seaLevel) * 0.5) * BIOME_EDGE_DITHER : 0;

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

/* ===== Overrides ===== */

/** Write one sparse tile override (camp clearing / forest clearing). */
export function setTileOverride(map: WorldMap, tx: number, ty: number, tile: TerrainTile): void {
  if (!isInsideTileGrid(map, tx, ty)) return;
  if (!map.overrides) map.overrides = new Map();
  map.overrides.set(ty * map.width + tx, tile);
  projectionCache.get(map)?.delete(ty * map.width + tx);
}

/** Patch one field of a tile in place (e.g. clear forest → grassland). */
export function patchTile(map: WorldMap, tx: number, ty: number, patch: Partial<TerrainTile>): void {
  const cur = tileAt(map, tx, ty);
  if (!cur) return;
  setTileOverride(map, tx, ty, { ...cur, ...patch });
}

/* ===== L0 / L1 occupancy ===== */

/** Terrain that blocks walking. Land is climbable, however high. */
const WALK_BLOCKED_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
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
 * Whether the world behind a 10px cell is passable, from the L0 grid when the
 * map has one and from the projected tile type otherwise — one answer for both
 * representations, so a legacy map and a Teraforge map cannot disagree.
 */
export function isTileWalkable(map: WorldMap, tx: number, ty: number): boolean {
  if (!isInsideTileGrid(map, tx, ty)) return false;
  const grid = map.pathGrid;
  if (grid && map.pCols === map.width && map.pRows === map.height) {
    return grid[ty * map.width + tx] === Walkability.Open;
  }
  const tile = tileAt(map, tx, ty);
  return !!tile && isWalkableTerrainType(tile.type);
}

/**
 * Whether the terrain behind a 10px cell accepts a structure. Reads the same
 * `isUnbuildableTerrainType` owner the placement rules use (`terrainTraits`), so the L1 grid and
 * the build-mode blocker can never disagree about what "hard ground" means.
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
  if (type === null) {
    grid[ty * map.width + tx] = previous === Walkability.Reserved ? previous : Walkability.Open;
    return;
  }
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
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const tx = Math.min(map.width - 1, bx * per + i);
      const ty = Math.min(map.height - 1, by * per + j);
      const value = map.pathGrid?.[ty * map.width + tx] ?? Walkability.Open;
      if (value === Walkability.Water) water++;
      else if (value === Walkability.Reserved) reserved++;
    }
  }
  const hard = isTileBuildable(map, Math.min(map.width - 1, bx * per), Math.min(map.height - 1, by * per))
    ? 0
    : 1;
  grid[by * bCols + bx] = water
    ? Buildability.Water
    : hard
      ? Buildability.Hard
      : reserved
        ? Buildability.Mixed
        : Buildability.Open;
}

/**
 * Re-derive the L0 path grid and the L1 build grid over a tile rectangle after
 * terrain edits. Worldgen clears the camp area **after** the bake, so without
 * this the cleared tiles would still be flagged un-walkable and un-buildable —
 * the pioneer clearing would be invisible to the pathfinder and to build mode.
 *
 * `margin` widens the refresh by whole tiles because the L1 grid and the
 * neighbour-sensitive classification read one tile further out.
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

/* ===== Bulk reads ===== */

/**
 * A row-scoped, bounds-free view of the map, for loops that already know their
 * rectangle (the terrain bake, the minimap, the decor pass). `type()` returns
 * `null` off-map, so callers keep their existing "skip if missing" shape.
 */
export interface TerrainReader {
  width: number;
  height: number;
  type(tx: number, ty: number): TerrainType | null;
  tile(tx: number, ty: number): TerrainTile | undefined;
  /** The tile type at a world pixel, `null` off-map. */
  typeAtWorld(worldX: number, worldY: number): TerrainType | null;
}

export function terrainReader(map: WorldMap): TerrainReader {
  return {
    width: map.width,
    height: map.height,
    type: (tx, ty) => tileTypeAt(map, tx, ty),
    tile: (tx, ty) => tileAt(map, tx, ty),
    typeAtWorld: (worldX, worldY) => tileTypeAtWorld(map, worldX, worldY),
  };
}

/**
 * Materialise the whole tile grid as `TerrainTile[][]`, for the few consumers
 * that genuinely need a dense 2D array (test fixtures, the map-preview canvas).
 * Prefer {@link tileAt} / {@link terrainReader}: this allocates one object per
 * tile — 283 000 of them on a 2560×1920 map.
 */
export function tileGridSnapshot(map: WorldMap): TerrainTile[][] {
  const rows: TerrainTile[][] = [];
  for (let ty = 0; ty < map.height; ty++) {
    const row: TerrainTile[] = new Array(map.width);
    for (let tx = 0; tx < map.width; tx++) {
      row[tx] = tileAt(map, tx, ty) ?? {
        type: TerrainType.Grassland,
        elevation: 0,
        moisture: 0,
        variation: 0,
      };
    }
    rows.push(row);
  }
  return rows;
}
