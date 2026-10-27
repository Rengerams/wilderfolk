import { MapPreset, MapSize, MAP_SIZE_DIMENSIONS, TerrainType, type WorldMap } from './gameTypes';
import { getSimRng } from './simRng';
import { isUnbuildableTerrainType, isWaterTerrainType } from './terrain/terrainTraits';
import { generateRawTerrain } from './terrain/terragen';
import {
  rebakeTerrainGrids,
  setTileOverride,
  tileAt,
  tileTypeAt,
} from './terrain/terrainGrid';

/**
 * Wilderfolk's world-generation entry point.
 *
 * Teraforge owns the landscape (`terrain/terragen`) and the four-layer tile model
 * (`terrain/terrainGrid`); this module is only the thin Wilderfolk-specific shell on
 * top: it picks dimensions and a preset, carves a buildable camp clearing, and strips
 * the start-area forest so the founding pioneers have usable ground.
 *
 * **Every read and write here goes through `terrainGrid`.** The 10px
 * `TerrainTile[][]` grid no longer exists — a tile is projected from the L2
 * continuous fields on demand and cleared tiles are held in the sparse
 * `WorldMap.overrides` layer (roadmap v0.6.5, Theme 1).
 */

/** Water-heavy presets need a beach ring + wider camp clearing near the centre. */
function isCoastalPreset(preset: MapPreset): boolean {
  return preset === 'coastal' || preset === 'islands';
}

/** Tile edge in px — the L0 path-cell edge, i.e. Wilderfolk's terrain tile size. */
const TILE = 10;

// ─── Buildability ────────────────────────────────────────────────────────────

/**
 * Whether a building footprint centred on `worldX/worldY` sits entirely on buildable
 * ground, read through the tile owner.
 */
export function isFootprintBuildable(
  map: WorldMap | null,
  footprintW: number,
  footprintH: number,
  worldX: number,
  worldY: number,
): boolean {
  if (!map || map.width <= 0 || map.height <= 0) return false;

  const left = worldX - footprintW / 2;
  const right = worldX + footprintW / 2;
  const top = worldY - footprintH / 2;
  const bottom = worldY + footprintH / 2;
  const startTx = Math.floor(left / TILE);
  const endTx = Math.floor(right / TILE);
  const startTy = Math.floor(top / TILE);
  const endTy = Math.floor(bottom / TILE);

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const type = tileTypeAt(map, tx, ty);
      if (type === null || isUnbuildableTerrainType(type)) return false;
    }
  }
  return true;
}

interface TileRect {
  startTx: number;
  endTx: number;
  startTy: number;
  endTy: number;
}

/** The tile rectangle enclosing a disc, clamped to the map. */
function rectAroundTile(map: WorldMap, cx: number, cy: number, radiusTiles: number): TileRect {
  return {
    startTx: Math.max(0, Math.floor(cx - radiusTiles)),
    endTx: Math.min(map.width - 1, Math.ceil(cx + radiusTiles)),
    startTy: Math.max(0, Math.floor(cy - radiusTiles)),
    endTy: Math.min(map.height - 1, Math.ceil(cy + radiusTiles)),
  };
}

/**
 * Flatten the ground around the camp into a buildable clearing. Water stays water — a filled tile
 * is walkable land the ground bake still paints as sea, so settlers wade across open water.
 */
export function ensureCampClearing(
  map: WorldMap,
  worldX: number,
  worldY: number,
  radiusTiles: number,
  preset: MapPreset,
): void {
  if (map.width <= 0 || map.height <= 0) return;

  const cx = Math.floor(worldX / TILE);
  const cy = Math.floor(worldY / TILE);
  const rect = rectAroundTile(map, cx, cy, radiusTiles);
  const coastal = isCoastalPreset(preset);

  for (let ty = rect.startTy; ty <= rect.endTy; ty++) {
    for (let tx = rect.startTx; tx <= rect.endTx; tx++) {
      const dist = Math.hypot(tx - cx, ty - cy);
      if (dist > radiusTiles) continue;
      const type = tileTypeAt(map, tx, ty);
      if (type === null || type === TerrainType.RiverBank || isWaterTerrainType(type)) continue;

      const inner = dist < radiusTiles * 0.55;
      // A coastal preset keeps a beach ring so the camp still reads as a shore landing.
      setTileOverride(map, tx, ty, {
        type: inner || !coastal ? TerrainType.Grassland : TerrainType.Beach,
        elevation: inner ? 48 : 42,
        moisture: inner ? 45 : coastal ? 70 : 50,
        variation: 0.5,
      });
    }
  }
  rebakeTerrainGrids(map, rect);
}

/** Strip the start-area forest so the founders are not boxed in by canopy. */
function clearStartAreaForest(map: WorldMap, worldX: number, worldY: number, radiusTiles: number): void {
  const cx = Math.floor(worldX / TILE);
  const cy = Math.floor(worldY / TILE);
  const rect = rectAroundTile(map, cx, cy, radiusTiles);

  for (let ty = rect.startTy; ty <= rect.endTy; ty++) {
    for (let tx = rect.startTx; tx <= rect.endTx; tx++) {
      if (Math.hypot(tx - cx, ty - cy) > radiusTiles) continue;
      const tile = tileAt(map, tx, ty);
      if (!tile) continue;
      if (tile.type !== TerrainType.Forest && tile.type !== TerrainType.DarkForest) continue;
      setTileOverride(map, tx, ty, { ...tile, type: TerrainType.Grassland });
    }
  }
  rebakeTerrainGrids(map, rect);
}

/**
 * Resolve a footprint-sized camp site near `preferredX/preferredY`, widening the search
 * until buildable ground is found. Returns the preferred point when the map offers
 * nothing better (the caller's own placement rules then report the failure).
 */
export function findCampSite(
  map: WorldMap,
  mapPixelW: number,
  mapPixelH: number,
  footprintW: number,
  footprintH: number,
  preferredX: number,
  preferredY: number,
): { x: number; y: number } {
  if (isFootprintBuildable(map, footprintW, footprintH, preferredX, preferredY)) {
    return { x: preferredX, y: preferredY };
  }

  const step = 10;
  const margin = 40;

  for (let ring = 1; ring <= 40; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const x = preferredX + dx * step;
        const y = preferredY + dy * step;
        if (x < margin || y < margin || x > mapPixelW - margin || y > mapPixelH - margin) continue;
        if (isFootprintBuildable(map, footprintW, footprintH, x, y)) {
          return { x, y };
        }
      }
    }
  }

  const scanStep = 20;
  for (let y = margin; y <= mapPixelH - margin; y += scanStep) {
    for (let x = margin; x <= mapPixelW - margin; x += scanStep) {
      if (isFootprintBuildable(map, footprintW, footprintH, x, y)) {
        return { x, y };
      }
    }
  }

  for (let y = margin; y <= mapPixelH - margin; y += 10) {
    for (let x = margin; x <= mapPixelW - margin; x += 10) {
      if (isFootprintBuildable(map, footprintW, footprintH, x, y)) {
        return { x, y };
      }
    }
  }

  console.warn('[terrainGen] findCampSite: no buildable site found, returning preferred');
  return { x: preferredX, y: preferredY };
}

// ─── World generation ────────────────────────────────────────────────────────

export interface GenerateWorldMapOptions {
  size?: MapSize;
  preset?: MapPreset;
  seed?: number;
  width?: number;
  height?: number;
}

/** Preferred: `generateWorldMap(MapSize.Medium, MapPreset.Continental, seed)`. */
export function generateWorldMap(size: MapSize, preset?: MapPreset, seed?: number): WorldMap;
/** Legacy pixel dimensions — prefer MapSize overload. */
export function generateWorldMap(
  width: number,
  height: number,
  seed?: number,
  size?: MapSize,
  preset?: MapPreset,
  /** The noise seed a save recorded — see `terrainSeedFor`. Wins over `seed` + `size`. */
  terrainSeed?: number,
  generationVersion?: 1 | 2,
): WorldMap;
export function generateWorldMap(
  widthOrSize: number | MapSize = 1200,
  heightOrPreset: number | MapPreset = 900,
  seedOrUndefined?: number,
  sizeArg?: MapSize,
  presetArg: MapPreset = 'continental',
  terrainSeedArg?: number,
  generationVersion: 1 | 2 | 3 = 3,
): WorldMap {
  let width: number;
  let height: number;
  let size: MapSize;
  let preset: MapPreset;
  let seed: number;

  if (typeof widthOrSize === 'string') {
    const dims = MAP_SIZE_DIMENSIONS[widthOrSize];
    width = dims.width;
    height = dims.height;
    size = widthOrSize;
    preset = typeof heightOrPreset === 'string' ? heightOrPreset : presetArg;
    seed = seedOrUndefined ?? Math.floor(getSimRng('terrainGen')() * 100000);
  } else {
    width = widthOrSize;
    height = typeof heightOrPreset === 'number' ? heightOrPreset : 900;
    preset = typeof heightOrPreset === 'string' ? heightOrPreset : presetArg;
    seed = seedOrUndefined ?? Math.floor(getSimRng('terrainGen')() * 100000);

    if (sizeArg) {
      size = sizeArg;
    } else {
      const matched = (Object.keys(MAP_SIZE_DIMENSIONS) as MapSize[]).find(
        (s) => MAP_SIZE_DIMENSIONS[s].width === width && MAP_SIZE_DIMENSIONS[s].height === height,
      );
      size = matched ?? MapSize.Medium;
    }
  }

  // Teraforge engine: 64px cells → 10px tiles + continuous fields + L0/L1 grids.
  const map = generateRawTerrain(width, height, seed, size, preset, terrainSeedArg, generationVersion);

  // Carve a buildable camp clearing and strip the start-area forest so the founding pioneers and
  // first buildings have usable ground. The camp follows buildable ground, not the map centre —
  // on a coastal map the centre can be open sea. `initGame` reads the site back off the map.
  const houseFootprint = { w: 46, h: 40 };
  const camp = findCampSite(
    map,
    width,
    height,
    houseFootprint.w,
    houseFootprint.h,
    width / 2,
    height / 2,
  );
  map.campSite = camp;
  const campX = camp.x;
  const campY = camp.y;

  if (
    generationVersion >= 2
    || isCoastalPreset(preset)
    || !isFootprintBuildable(map, houseFootprint.w, houseFootprint.h, campX, campY)
  ) {
    ensureCampClearing(
      map, campX, campY,
      generationVersion >= 2 ? (isCoastalPreset(preset) ? 11 : 7) : (isCoastalPreset(preset) ? 18 : 12),
      preset,
    );
  }

  const startForestRadius = generationVersion >= 2
    ? Math.min(16, Math.max(10, Math.round(Math.min(map.width, map.height) * 0.055)))
    : Math.max(14, Math.round(Math.min(map.width, map.height) * 0.22));
  clearStartAreaForest(map, campX, campY, startForestRadius);

  return map;
}
