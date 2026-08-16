/**
 * Painted terrain atlas — "grass biome" 16×16 tileset (2.5D Painted Relief).
 *
 * Source art: TilesetGrass/overworld_tileset_grass.ase (Aseprite) +
 * grass_biome.tsx (Tiled). Runtime copy: /sprites/tileset_grass.png.
 * The tileset encodes Tiled corner terrains (TL,TR,BL,BR): 0=grass, 1=water,
 * 2=forest, 3=swampgrass, 4=swamp — we consume the grass↔water corner set
 * (16 combos) and complete the 6 missing pieces with mirror flips of the
 * authored tiles (the art is symmetric pixel work, flips are invisible).
 *
 * Also carries the elevation→raise curve used by the relief bake and by the
 * renderer so entities/buildings/props ride the terrain.
 */
import { TerrainType, TERRAIN_TILE_SIZE, type WorldMap } from './gameTypes';
import { getSprite } from './spriteLoader';

export const TERRAIN_ATLAS_PATH = '/sprites/tileset_grass.png';
/** Atlas tile edge (px) in the source PNG. */
export const ATLAS_TILE_SIZE = 16;
const ATLAS_COLUMNS = 12;

/** Atlas terrain families we can paint. */
export type AtlasFamily = 0 | 1; // 0 = grass, 1 = water
const GRASS: AtlasFamily = 0;
const WATER: AtlasFamily = 1;

/**
 * Map a game terrain type to an atlas family, or null when the atlas has no
 * art. Forest/DarkForest count as grass — their cells render painted grass
 * (the forest look comes from the dark tint + tree entities on top), so
 * grass↔forest and forest↔water boundaries stay painted too.
 */
export function atlasFamily(type: TerrainType): AtlasFamily | null {
  switch (type) {
    case TerrainType.Grassland:
    case TerrainType.Forest:
    case TerrainType.DarkForest:
      return GRASS;
    case TerrainType.ShallowWater:
    case TerrainType.River:
    case TerrainType.DeepWater:
      return WATER;
    default:
      // Hills/Rocky/Mountains/Beach/Snow have no atlas art — fall back to
      // seamless fills (they extrude in the relief pass instead).
      return null;
  }
}

export interface AtlasPick {
  /** Atlas tile id (0-based, row-major 12-column grid). */
  id: number;
  flipH: boolean;
  flipV: boolean;
}

interface AtlasTileRef {
  id: number;
  flipH?: boolean;
  flipV?: boolean;
}

/**
 * Corner combos → authored tile. Bits: 8=TL, 4=TR, 2=BL, 1=BR (1 = water).
 * Derived from grass_biome.tsx terrain tags. The two diagonal checkerboards
 * (0110, 1001) have no authored tile — substitute the nearest straight edge.
 */
const ATLAS_TILES: Partial<Record<number, AtlasTileRef>> = {
  [0b0001]: { id: 72, flipV: true }, // single water corner, BR
  [0b0010]: { id: 74, flipV: true }, // single water corner, BL
  [0b0011]: { id: 73, flipV: true }, // water along the bottom
  [0b0100]: { id: 72 },              // single water corner, TR
  [0b0101]: { id: 60 },              // vertical edge — grass left, water right
  [0b0110]: { id: 60 },              // diagonal — nearest straight edge
  [0b0111]: { id: 97 },              // water everywhere but TL
  [0b1000]: { id: 74 },              // single water corner, TL
  [0b1001]: { id: 62 },              // diagonal — nearest straight edge
  [0b1010]: { id: 62 },              // vertical edge — water left, grass right
  [0b1011]: { id: 96 },              // water everywhere but TR
  [0b1100]: { id: 73 },              // water along the top
  [0b1101]: { id: 85 },              // water everywhere but BL
  [0b1110]: { id: 84 },              // water everywhere but BR
  [0b1111]: { id: 61 },              // all water
};

/** Grass base variants (all-grass corners, tsx ids) — picked by hash. */
const GRASS_BASE_IDS = [0, 1, 2, 3, 4, 13, 14, 25, 26, 37, 38];

/** Hash the variant picker + fallback substitution use. */
function hash01(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

function isOpaqueFamily(f: AtlasFamily | null): f is AtlasFamily {
  return f === GRASS || f === WATER;
}

/**
 * Corner family at (dx,dy) ∈ {−1,0}² from the tile centre — the union rule:
 * a corner is water when ANY of the four tiles touching that point is water.
 * Out-of-map neighbours count as grass (island rims read as coastline).
 * Returns null when a touching tile is out-of-family (e.g. mountains).
 */
function cornerFamily(map: WorldMap, tx: number, ty: number, dx: number, dy: number): AtlasFamily | null {
  let water = false;
  for (let cy = 0; cy <= 1; cy++) {
    for (let cx = 0; cx <= 1; cx++) {
      const n = map.tiles[ty + dy + cy]?.[tx + dx + cx];
      if (!n) continue; // out-of-map → grass
      const f = atlasFamily(n.type);
      if (f === null) return null;
      if (f === WATER) water = true;
    }
  }
  return water ? WATER : GRASS;
}

/**
 * Pick the painted tile for a cell, or null when the atlas can't paint it
 * (uncovered family, or any 8-neighbour outside grass/water — the painted
 * edges wouldn't match the neighbouring rendering, so fall back).
 */
export function pickAtlasTile(map: WorldMap, tx: number, ty: number): AtlasPick | null {
  const self = map.tiles[ty]?.[tx];
  if (!self) return null;
  if (!isOpaqueFamily(atlasFamily(self.type))) return null;

  // 8-neighbour compatibility — out-of-map is fine, in-map out-of-family is not.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = map.tiles[ty + dy]?.[tx + dx];
      if (n && !isOpaqueFamily(atlasFamily(n.type))) return null;
    }
  }

  const tl = cornerFamily(map, tx, ty, -1, -1);
  const tr = cornerFamily(map, tx, ty, 0, -1);
  const bl = cornerFamily(map, tx, ty, -1, 0);
  const br = cornerFamily(map, tx, ty, 0, 0);
  if (tl === null || tr === null || bl === null || br === null) return null;

  const bits = (tl === WATER ? 8 : 0) | (tr === WATER ? 4 : 0) | (bl === WATER ? 2 : 0) | (br === WATER ? 1 : 0);
  if (bits === 0) {
    const seed = typeof map.seed === 'number' ? map.seed : 1;
    const v = Math.floor(hash01(tx * 31 + ty * 17, tx * 7 + ty * 41, seed) * GRASS_BASE_IDS.length);
    return { id: GRASS_BASE_IDS[v % GRASS_BASE_IDS.length], flipH: false, flipV: false };
  }
  const ref = ATLAS_TILES[bits];
  if (!ref) return null;
  return { id: ref.id, flipH: ref.flipH ?? false, flipV: ref.flipV ?? false };
}

/** True once the atlas PNG is in the sprite cache (bake waits for it). */
export function terrainAtlasReady(): boolean {
  return getSprite(TERRAIN_ATLAS_PATH) != null;
}

/**
 * Elevation → raise fraction of a tile. Water and lowland stay flat — the
 * painted atlas carries the shore look; only hills and peaks extrude, so the
 * relief reads without double cliffs at the coast. 0.5→~0.08, 0.6 (hills)→~0.15,
 * 0.85+ (mountains/snow)→~0.30–0.35.
 */
export function reliefY(type: TerrainType, elevation: number): number {
  switch (type) {
    case TerrainType.DeepWater:
    case TerrainType.ShallowWater:
    case TerrainType.River:
      return 0;
    default:
      break;
  }
  const e = Math.max(0, Math.min(100, elevation)) / 100;
  if (e < 0.5) return 0;
  return Math.min(0.35, (e - 0.5) * 0.7 + 0.08);
}

/** Elevation at a world position (10px tile grid), 0–100. */
export function elevationAt(map: WorldMap | null, x: number, y: number): number {
  if (!map) return 0;
  const tx = Math.floor(x / TERRAIN_TILE_SIZE);
  const ty = Math.floor(y / TERRAIN_TILE_SIZE);
  const tile = map.tiles[ty]?.[tx];
  return tile ? tile.elevation : 0;
}

/** World-unit rise at a world position — the offset entities/buildings ride by. */
export function terrainRiseAt(map: WorldMap | null, x: number, y: number): number {
  if (!map) return 0;
  const tx = Math.floor(x / TERRAIN_TILE_SIZE);
  const ty = Math.floor(y / TERRAIN_TILE_SIZE);
  const tile = map.tiles[ty]?.[tx];
  if (!tile) return 0;
  return reliefY(tile.type, tile.elevation) * TERRAIN_TILE_SIZE;
}

/** Source rect for an atlas tile id (0-based, 12-column grid). */
export function atlasSourceRect(id: number): { sx: number; sy: number } {
  return { sx: (id % ATLAS_COLUMNS) * ATLAS_TILE_SIZE, sy: Math.floor(id / ATLAS_COLUMNS) * ATLAS_TILE_SIZE };
}

/** Runtime scale — atlas tile px → baked tile px. */
export function atlasScale(tileSize: number): number {
  return tileSize / ATLAS_TILE_SIZE;
}
