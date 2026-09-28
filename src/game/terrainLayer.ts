


import { TerrainType, TERRAIN_TILE_SIZE, type MapPreset, type Season, type TerrainTile, type WorldMap } from './gameTypes';
import { tileAt } from './terrain/terrainGrid';
import {
  createCanvasSurface,
  disposeCanvasSurface,
  getCanvasContext,
  type CanvasContext2d,
  type CanvasSurface,
} from './canvasLayer';
import { getSprite } from './spriteLoader';
import {
  ATLAS_TILE_SIZE,
  atlasSourceRect,
  pickAtlasTile,
  pickSandWaterOverlay,
  reliefY,
  sandWaterOverlayReady,
  sandWaterOverlaySourceRect,
  SAND_WATER_OVERLAY_PATH,
  terrainAtlasReady,
  TERRAIN_ATLAS_PATH,
  TERRAIN_MATERIAL_ATLAS_REVISION,
  type AtlasPick,
  type SandWaterOverlayPick,
} from './terrainAtlas';

/** Seamless fills under public/sprites/ (terrain/ = procedural, root = painted). */
const TERRAIN_FILL_PATH: Partial<Record<TerrainType, string>> = {
  [TerrainType.Grassland]: '/sprites/terrain/grass_fill.png',
  [TerrainType.Forest]: '/sprites/terrain/forest.png',
  [TerrainType.DarkForest]: '/sprites/terrain/forest.png',
  [TerrainType.Hills]: '/sprites/terrain/dirt.png',
  [TerrainType.Rocky]: '/sprites/terrain/dirt.png',
  [TerrainType.Beach]: '/sprites/terrain/sand_fill.png',
  [TerrainType.Desert]: '/sprites/terrain/sand_fill.png',
  [TerrainType.RiverBank]: '/sprites/terrain/sand_fill.png',
  [TerrainType.ShallowWater]: '/sprites/terrain/water_shallow_fill.png',
  [TerrainType.River]: '/sprites/terrain/water_deep_fill.png',
  [TerrainType.DeepWater]: '/sprites/terrain/water_deep_fill.png',
  [TerrainType.Snow]: '/sprites/terrain/snow.png',
  [TerrainType.Mountains]: '/sprites/terrain/mountain.jpg',
};

/** Translucent azure re-glaze over every water tile for consistent blue depth. */
const WATER_GLAZE = 'rgba(38, 96, 178, 0.32)';
const RIVER_GLAZE = 'rgba(59, 130, 168, 0.48)';
const RIVER_GLINT = 'rgba(218, 242, 255, 0.22)';

/** Material family for transitions — same family = no edge blend needed. */
type FillFamily = 'grass' | 'dirt' | 'sand' | 'water' | 'other';

function fillFamily(type: TerrainType): FillFamily {
  switch (type) {
    case TerrainType.Grassland:
    case TerrainType.Forest:
    case TerrainType.DarkForest:
      return 'grass';
    case TerrainType.Hills:
    case TerrainType.Rocky:
    case TerrainType.Mountains:
      return 'dirt';
    case TerrainType.Beach:
    case TerrainType.Desert:
    case TerrainType.RiverBank:
    case TerrainType.Snow:
      return 'sand';
    case TerrainType.ShallowWater:
    case TerrainType.River:
    case TerrainType.DeepWater:
      return 'water';
    default:
      return 'other';
  }
}

function drawTerrainFill(
  ctx: CanvasContext2d,
  type: TerrainType,
  x0: number,
  y0: number,
  fillW: number,
  fillH: number,
  // Tile coords are kept in the signature for the call sites' shape; the per-tile phase they
  // used to drive was the D9 ghost (see below).
  _tx: number,
  _ty: number,
  alpha = 1,
): boolean {
  const path = TERRAIN_FILL_PATH[type];
  if (!path) return false;
  const img = getSprite(path);
  if (!img) return false;
  const iw = img.naturalWidth || (img as HTMLImageElement).width || 128;
  const ih = img.naturalHeight || (img as HTMLImageElement).height || 128;
  const prev = ctx.globalAlpha;
  try {
    ctx.globalAlpha = prev * alpha;
    // ONE stamp. A second "seam wrap" used to draw the *remainder* of the texture
    // (`sx, sy → iw, ih`) stretched over the whole tile at 35 % alpha to vary the repeat.
    // That is not a wrap: when `sx`/`sy` were small the crop was nearly the whole texture,
    // so the tile received the texture twice at two different scales — a double-exposed
    // ghost (audit `visuals-looks.md` D9). Repeat variety comes from `tile.variation`
    // tinting in the bake and from the neighbour blends.
    ctx.drawImage(img as CanvasImageSource, 0, 0, iw, ih, x0, y0, fillW, fillH);
    ctx.globalAlpha = prev;
    return true;
  } catch {
    ctx.globalAlpha = prev;
    return false;
  }
}

type Cardinal = 'n' | 's' | 'e' | 'w';

/** Soft autotile-style edge: feather neighbor fill into this tile. */
function blendNeighborEdge(
  ctx: CanvasContext2d,
  selfType: TerrainType,
  neighborType: TerrainType,
  x0: number,
  y0: number,
  fillW: number,
  fillH: number,
  tx: number,
  ty: number,
  side: Cardinal,
  tileSize: number,
): void {
  if (fillFamily(selfType) === fillFamily(neighborType)) return;
  if (!TERRAIN_FILL_PATH[neighborType] || !getSprite(TERRAIN_FILL_PATH[neighborType]!)) return;

  const band = Math.max(2, Math.min(5, Math.round(tileSize * 0.4)));
  const strips = band;
  for (let i = 0; i < strips; i++) {
    const t = (i + 1) / (strips + 1);
    const alpha = 0.12 + t * 0.48;
    let rx = x0;
    let ry = y0;
    let rw = fillW;
    let rh = fillH;
    if (side === 'n') {
      ry = y0 + i;
      rh = 1;
    } else if (side === 's') {
      ry = y0 + fillH - strips + i;
      rh = 1;
    } else if (side === 'w') {
      rx = x0 + i;
      rw = 1;
    } else {
      rx = x0 + fillW - strips + i;
      rw = 1;
    }
    if (rw < 1 || rh < 1) continue;
    drawTerrainFill(ctx, neighborType, rx, ry, rw, rh, tx, ty, alpha);
  }

  const selfWater = fillFamily(selfType) === 'water';
  const nWater = fillFamily(neighborType) === 'water';
  if (selfWater !== nWater && fillW > 2 && fillH > 2) {
    const lip = Math.max(1, Math.round(tileSize * 0.2));
    ctx.fillStyle = selfWater ? 'rgba(255,255,255,0.2)' : 'rgba(230,210,160,0.34)';
    if (side === 'n') ctx.fillRect(x0, y0, fillW, lip);
    if (side === 's') ctx.fillRect(x0, y0 + fillH - lip, fillW, lip);
    if (side === 'w') ctx.fillRect(x0, y0, lip, fillH);
    if (side === 'e') ctx.fillRect(x0 + fillW - lip, y0, lip, fillH);
  }
}

function drawAtlasTile(
  ctx: CanvasContext2d,
  img: HTMLImageElement,
  pick: AtlasPick,
  x0: number,
  y0: number,
  fillW: number,
  fillH: number,
): boolean {
  const { sx, sy } = atlasSourceRect(pick.id);
  try {
    ctx.save();
    ctx.translate(pick.flipH ? x0 + fillW : x0, pick.flipV ? y0 + fillH : y0);
    ctx.scale(pick.flipH ? -1 : 1, pick.flipV ? -1 : 1);
    ctx.drawImage(img, sx, sy, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE, 0, 0, fillW, fillH);
    ctx.restore();
    return true;
  } catch {
    ctx.restore();
    return false;
  }
}

function drawSandWaterOverlay(
  ctx: CanvasContext2d,
  img: HTMLImageElement,
  pick: SandWaterOverlayPick,
  x0: number,
  y0: number,
  fillW: number,
  fillH: number,
): boolean {
  const { sx, sy } = sandWaterOverlaySourceRect(pick.id);
  try {
    ctx.drawImage(img, sx, sy, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE, x0, y0, fillW, fillH);
    return true;
  } catch {
    return false;
  }
}

function drawCliffFace(
  ctx: CanvasContext2d,
  x0: number,
  y0: number,
  fillW: number,
  fillH: number,
  raise: number,
  base: { r: number; g: number; b: number },
  tileSize: number,
): void {
  if (raise <= 0 || fillW < 1 || fillH < 1) return;
  const fy = y0 + fillH - raise;
  const grad = ctx.createLinearGradient(0, fy, 0, fy + raise);
  grad.addColorStop(0, shadeRgb(base, -0.12));
  grad.addColorStop(1, shadeRgb(base, -0.55));
  ctx.fillStyle = grad;
  ctx.fillRect(x0, fy, fillW, raise);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x0, fy, fillW, Math.max(1, Math.round(tileSize * 0.06)));
}

export type TerrainSurface = CanvasSurface;

export interface TerrainLayerCache {
  surface: TerrainSurface;
  ctx: CanvasContext2d;
  width: number;
  height: number;
  worldWidth: number;
  worldHeight: number;
  seed: number;
  preset: string;
  season: Season;
  lod: number;
  offsetX: number;
  offsetY: number;
  seasonBlendT?: number;
  fills: boolean;
  atlas: boolean;
  materialAtlasRevision: number;
}

/**
 * Monotonic counter for post-worldgen `WorldMap.tiles` mutation.
 *
 * Every terrain cache key is derived from the map's immutable-looking fields (seed, preset,
 * size, season, LOD), so a tile whose `type` changed after worldgen kept its old texture for
 * as long as its cache entry lived — clearing forest under a new footprint left the forest
 * fill and its canopy overlay on the cleared tiles (audit `visuals-looks.md` D4). The
 * mutation owner bumps this instead of the caches guessing.
 *
 * Presentation-only: never saved, never read by the simulation, process-local by design.
 */
let terrainRevision = 0;

export function bumpTerrainRevision(): void {
  terrainRevision++;
}

export function getTerrainRevision(): number {
  return terrainRevision;
}

/**
 * Cache key for one baked terrain chunk.
 *
 * Every input the bake reads must be here. `seed`/`preset`/size are stable for a world, but
 * `tile.type` is **not** — the building-placement path clears forest under a new footprint — so
 * {@link getTerrainRevision} is part of the key and a mutated tile cannot keep its old fill and
 * canopy for the life of the cache entry (audit `visuals-looks.md` D4).
 */
export function terrainChunkCacheKeyFor(
  map: Pick<WorldMap, 'seed' | 'preset'>,
  season: Season,
  lod: number,
  blendT?: number,
): string {
  return `${map.seed}|${map.preset}|${season}|${lod}|${blendT ?? ''}|r${getTerrainRevision()}`;
}

export function terrainFillSpritesReady(): boolean {
  return Object.values(TERRAIN_FILL_PATH).every((p) => p != null && getSprite(p) != null);
}

export function disposeTerrainLayer(cache: TerrainLayerCache | null): void {
  if (!cache) return;
  disposeCanvasSurface(cache.surface);
}

function parseTerrainRgb(color: string): { r: number; g: number; b: number } {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return { r: 94, g: 122, b: 58 };
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

function rgbStr(r: number, g: number, b: number): string {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function shadeRgb(
  base: { r: number; g: number; b: number },
  light: number,
): string {
  const t = Math.max(-0.55, Math.min(0.55, light));
  if (t >= 0) {
    return rgbStr(
      base.r + (255 - base.r) * t,
      base.g + (255 - base.g) * t,
      base.b + (255 - base.b) * t,
    );
  }
  const k = 1 + t;
  return rgbStr(base.r * k, base.g * k, base.b * k);
}

function hash01(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n >>> 0) % 1000) / 1000;
}

function isWater(type: TerrainType): boolean {
  return type === TerrainType.DeepWater
    || type === TerrainType.ShallowWater
    || type === TerrainType.River;
}

function tileRelief(type: TerrainType, elevation: number): number {
  const e = Math.max(0, Math.min(100, elevation)) / 100;
  switch (type) {
    case TerrainType.DeepWater: return 0.05 + e * 0.05;
    case TerrainType.ShallowWater:
    case TerrainType.River: return 0.12 + e * 0.08;
    case TerrainType.Beach:
    case TerrainType.RiverBank: return 0.28 + e * 0.1;
    case TerrainType.Desert: return 0.32 + e * 0.12;
    case TerrainType.Grassland: return 0.4 + e * 0.2;
    case TerrainType.Forest: return 0.48 + e * 0.22;
    case TerrainType.DarkForest: return 0.5 + e * 0.25;
    case TerrainType.Hills: return 0.62 + e * 0.25;
    case TerrainType.Rocky: return 0.68 + e * 0.22;
    case TerrainType.Mountains: return 0.78 + e * 0.22;
    case TerrainType.Snow: return 0.82 + e * 0.18;
    default: return 0.45 + e * 0.2;
  }
}

function neighborRelief(map: WorldMap, tx: number, ty: number, fallback: number): number {
  const tile = tileAt(map, tx, ty);
  if (!tile) return fallback;
  return tileRelief(tile.type, tile.elevation);
}

type TileEntry = {
  tile: TerrainTile;
  tx: number;
  ty: number;
  x0: number;
  y0: number;
};

function *terrainTiles(
  map: WorldMap,
  tileSize: number,
  w: number,
  h: number,
  viewRect?: { x: number; y: number; width: number; height: number },
  originX = 0,
  originY = 0,
): Generator<TileEntry> {
  const startTx = viewRect ? Math.max(0, Math.floor(viewRect.x / TERRAIN_TILE_SIZE)) : 0;
  const endTx = viewRect ? Math.min(map.width, Math.ceil((viewRect.x + viewRect.width) / TERRAIN_TILE_SIZE)) : map.width;
  const startTy = viewRect ? Math.max(0, Math.floor(viewRect.y / TERRAIN_TILE_SIZE)) : 0;
  const endTy = viewRect ? Math.min(map.height, Math.ceil((viewRect.y + viewRect.height) / TERRAIN_TILE_SIZE)) : map.height;
  for (let ty = startTy; ty < endTy; ty++) {
    for (let tx = startTx; tx < endTx; tx++) {
      const tile = tileAt(map, tx, ty);
      if (!tile) continue;
      const x0 = tx * tileSize - originX;
      const y0 = ty * tileSize - originY;
      if (x0 >= w || y0 >= h) continue;
      yield { tile, tx, ty, x0, y0 };
    }
  }
}

function forEachCardinalNeighbor(
  map: WorldMap,
  tx: number,
  ty: number,
  cb: (dir: 'n' | 's' | 'w' | 'e', nb: TerrainTile) => void,
): void {
  const north = tileAt(map, tx, ty - 1);
  if (north) cb('n', north);
  const south = tileAt(map, tx, ty + 1);
  if (south) cb('s', south);
  const west = tileAt(map, tx - 1, ty);
  if (west) cb('w', west);
  const east = tileAt(map, tx + 1, ty);
  if (east) cb('e', east);
}

export function bakeTerrainLayer(
  map: WorldMap,
  worldWidth: number,
  worldHeight: number,
  season: Season,
  colorAt: (type: TerrainType, season: Season, variation: number, preset?: MapPreset) => string,
  lod = 1,
  seasonBlend?: { from: Season; to: Season; t: number },
  viewRect?: { x: number; y: number; width: number; height: number },
): TerrainLayerCache {
  const viewW = viewRect ? viewRect.width : worldWidth;
  const viewH = viewRect ? viewRect.height : worldHeight;
  const w = Math.max(1, Math.floor(viewW * lod));
  const h = Math.max(1, Math.floor(viewH * lod));
  const originX = viewRect ? viewRect.x * lod : 0;
  const originY = viewRect ? viewRect.y * lod : 0;
  const surface = createCanvasSurface(w, h);
  const ctx = getCanvasContext(surface);
  const tileSize = TERRAIN_TILE_SIZE * lod;
  const seed = typeof map.seed === 'number' ? map.seed : 1;

  const seasonColorAt = seasonBlend
    ? (type: TerrainType, variation: number, preset?: MapPreset) => {
        const a = parseTerrainRgb(colorAt(type, seasonBlend.from, variation, preset));
        const b = parseTerrainRgb(colorAt(type, seasonBlend.to, variation, preset));
        return rgbStr(
          Math.round(a.r + (b.r - a.r) * seasonBlend.t),
          Math.round(a.g + (b.g - a.g) * seasonBlend.t),
          Math.round(a.b + (b.b - a.b) * seasonBlend.t),
        );
      }
    : (type: TerrainType, variation: number, preset?: MapPreset) =>
        colorAt(type, season, variation, preset);

  ctx.fillStyle = seasonColorAt(TerrainType.Grassland, 0.5, map.preset);
  ctx.fillRect(0, 0, w, h);

  const atlasReady = terrainAtlasReady();
  const overlayReady = sandWaterOverlayReady();
  const reliefTiles: {
    tile: TerrainTile;
    tx: number;
    ty: number;
    x0: number;
    y0: number;
    fillW: number;
    fillH: number;
    raise: number;
  }[] = [];

  for (const { tile, tx, ty, x0, y0 } of terrainTiles(map, tileSize, w, h, viewRect, originX, originY)) {
    const fillW = Math.min(tileSize, w - x0);
    const fillH = Math.min(tileSize, h - y0);

    const raise = reliefY(tile.type, tile.elevation) * tileSize;
    if (raise > 0) {
      reliefTiles.push({ tile, tx, ty, x0, y0, fillW, fillH, raise });
      continue;
    }

    const base = parseTerrainRgb(seasonColorAt(tile.type, tile.variation, map.preset));
    const relief = tileRelief(tile.type, tile.elevation);

    const nR = neighborRelief(map, tx, ty - 1, relief);
    const sR = neighborRelief(map, tx, ty + 1, relief);
    const wR = neighborRelief(map, tx - 1, ty, relief);
    const eR = neighborRelief(map, tx + 1, ty, relief);
    const slopeLight = (nR - sR) * 0.55 + (wR - eR) * 0.35;
    const heightLight = (relief - 0.45) * 0.35;
    const waterDark = isWater(tile.type) ? -0.08 : 0;
    const light = slopeLight + heightLight + waterDark;
    const tint = light >= 0
      ? `rgba(255,255,255,${Math.min(0.22, light * 0.35)})`
      : `rgba(0,0,0,${Math.min(0.35, -light * 0.45)})`;

    const atlasPick = atlasReady ? pickAtlasTile(map, tx, ty, tile) : null;
    const atlasImg = atlasPick ? getSprite(TERRAIN_ATLAS_PATH) : null;
    const stamped = atlasImg && atlasPick
      ? drawAtlasTile(ctx, atlasImg, atlasPick, x0, y0, fillW, fillH)
      : drawTerrainFill(ctx, tile.type, x0, y0, fillW, fillH, tx, ty);

    // The shoreline mask is independent of which base painter stamped the tile: it is authored
    // for Beach **and** RiverBank, while `pickAtlasTile` returns null for Beach (its family is
    // not in the atlas). Nesting this under `atlasPick` therefore made the beach half of the
    // mask — the material it exists for — unreachable (audit `visuals-looks.md` D8).
    const overlayPick = overlayReady ? pickSandWaterOverlay(map, tx, ty, tile) : null;
    const overlayImg = overlayPick ? getSprite(SAND_WATER_OVERLAY_PATH) : null;

    if (atlasPick) {
      if (overlayImg && overlayPick) {
        drawSandWaterOverlay(ctx, overlayImg, overlayPick, x0, y0, fillW, fillH);
      }

      ctx.fillStyle = tint;
      ctx.fillRect(x0, y0, fillW, fillH);
      if (tile.type === TerrainType.DarkForest) {
        ctx.fillStyle = 'rgba(20,40,15,0.28)';
        ctx.fillRect(x0, y0, fillW, fillH);
      }
    } else if (!stamped) {
      ctx.fillStyle = shadeRgb(base, light);
      ctx.fillRect(x0, y0, fillW, fillH);
      if (overlayImg && overlayPick) {
        drawSandWaterOverlay(ctx, overlayImg, overlayPick, x0, y0, fillW, fillH);
      }
    } else {
      const north = tileAt(map, tx, ty - 1);
      const southT = tileAt(map, tx, ty + 1);
      const west = tileAt(map, tx - 1, ty);
      const eastT = tileAt(map, tx + 1, ty);
      if (north) blendNeighborEdge(ctx, tile.type, north.type, x0, y0, fillW, fillH, tx, ty, 'n', tileSize);
      if (southT) blendNeighborEdge(ctx, tile.type, southT.type, x0, y0, fillW, fillH, tx, ty, 's', tileSize);
      if (west) blendNeighborEdge(ctx, tile.type, west.type, x0, y0, fillW, fillH, tx, ty, 'w', tileSize);
      if (eastT) blendNeighborEdge(ctx, tile.type, eastT.type, x0, y0, fillW, fillH, tx, ty, 'e', tileSize);

      if (overlayImg && overlayPick) {
        drawSandWaterOverlay(ctx, overlayImg, overlayPick, x0, y0, fillW, fillH);
      }

      ctx.fillStyle = tint;
      ctx.fillRect(x0, y0, fillW, fillH);
      if (tile.type === TerrainType.Snow) {
        ctx.fillStyle = 'rgba(200,220,255,0.35)';
        ctx.fillRect(x0, y0, fillW, fillH);
      }
      if (tile.type === TerrainType.DarkForest) {
        ctx.fillStyle = 'rgba(20,40,15,0.28)';
        ctx.fillRect(x0, y0, fillW, fillH);
      }
    }

    if (tile.type === TerrainType.Forest) {
      ctx.fillStyle = 'rgba(18, 67, 32, 0.42)';
      ctx.fillRect(x0, y0, fillW, fillH);
    }

    if (!atlasPick) {
      if (!stamped) {
        const east = tileAt(map, tx + 1, ty);
        if (east && east.type !== tile.type) {
          const a = parseTerrainRgb(seasonColorAt(tile.type, tile.variation, map.preset));
          const b = parseTerrainRgb(seasonColorAt(east.type, east.variation, map.preset));
          ctx.fillStyle = rgbStr((a.r + b.r) / 2, (a.g + b.g) / 2, (a.b + b.b) / 2);
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x0 + fillW - 1, y0, 2, fillH);
          ctx.globalAlpha = 1;
        }
        const south = tileAt(map, tx, ty + 1);
        if (south && south.type !== tile.type) {
          const a = parseTerrainRgb(seasonColorAt(tile.type, tile.variation, map.preset));
          const b = parseTerrainRgb(seasonColorAt(south.type, south.variation, map.preset));
          ctx.fillStyle = rgbStr((a.r + b.r) / 2, (a.g + b.g) / 2, (a.b + b.b) / 2);
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x0, y0 + fillH - 1, fillW, 2);
          ctx.globalAlpha = 1;
        }
      }

      if (fillW > 6 && fillH > 6 && (isWater(tile.type) || Math.abs(relief - 0.5) > 0.06)) {
        const edge = Math.max(1, Math.min(stamped ? 2 : 3, (tileSize * 0.12) | 0));
        ctx.fillStyle = stamped ? 'rgba(255,255,255,0.1)' : shadeRgb(base, light + 0.22);
        ctx.fillRect(x0, y0, fillW, edge);
        ctx.fillRect(x0, y0, edge, fillH);
        ctx.fillStyle = stamped ? 'rgba(0,0,0,0.12)' : shadeRgb(base, light - 0.28);
        ctx.fillRect(x0, y0 + fillH - edge, fillW, edge);
        ctx.fillRect(x0 + fillW - edge, y0, edge, fillH);

        if (!isWater(tile.type) && relief > 0.35) {
          const faceH = Math.max(1, Math.min(stamped ? 3 : 4, (tileSize * 0.1) | 0));
          ctx.fillStyle = stamped ? 'rgba(0,0,0,0.18)' : shadeRgb(base, light - 0.38);
          ctx.globalAlpha = stamped ? 0.35 : 0.55;
          ctx.fillRect(x0 + edge, y0 + fillH - faceH, Math.max(0, fillW - edge * 2), faceH);
          ctx.globalAlpha = 1;
        }
      }

      if (!stamped && fillW > 8 && fillH > 8) {
        const dots = isWater(tile.type) ? 3 : 7;
        for (let i = 0; i < dots; i++) {
          const u = hash01(tx * 17 + i, ty * 31 + i, seed);
          const v = hash01(tx * 41 + i, ty * 13 + i, seed + 3);
          const px = x0 + 2 + u * (fillW - 4);
          const py = y0 + 2 + v * (fillH - 4);
          ctx.fillStyle = isWater(tile.type)
            ? shadeRgb(base, light + 0.35)
            : shadeRgb(base, light + (u > 0.5 ? 0.12 : -0.14));
          ctx.globalAlpha = isWater(tile.type) ? 0.35 : 0.22;
          ctx.fillRect(px | 0, py | 0, 1 + (u > 0.7 ? 1 : 0), 1);
        }
        ctx.globalAlpha = 1;
      }

      if (!isWater(tile.type)) {
        if (sR < relief - 0.12 && fillH > 4) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(x0, y0 + fillH - 2, fillW, 2);
        }
        if (eR < relief - 0.12 && fillW > 4) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(x0 + fillW - 2, y0, 2, fillH);
        }
      }

      const varAmt = (hash01(tx * 31, ty * 47, seed) - 0.5) * 0.16;
      if (Math.abs(varAmt) > 0.02) {
        ctx.fillStyle = varAmt > 0
          ? `rgba(255,255,255,${Math.min(0.06, varAmt)})`
          : `rgba(0,0,0,${Math.min(0.07, -varAmt)})`;
        ctx.fillRect(x0, y0, fillW, fillH);
      }
    }
  }

  reliefTiles.sort((a, b) => (a.y0 - a.raise) - (b.y0 - b.raise));
  for (const t of reliefTiles) {
    const base = parseTerrainRgb(seasonColorAt(t.tile.type, t.tile.variation, map.preset));
    drawCliffFace(ctx, t.x0, t.y0, t.fillW, t.fillH, t.raise, base, tileSize);
    const stamped = drawTerrainFill(ctx, t.tile.type, t.x0, t.y0 - t.raise, t.fillW, t.fillH, t.tx, t.ty);
    if (!stamped) {
      ctx.fillStyle = shadeRgb(base, 0.08);
      ctx.fillRect(t.x0, t.y0 - t.raise, t.fillW, t.fillH);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(t.x0, t.y0 - t.raise, t.fillW, Math.max(1, Math.round(tileSize * 0.08)));
    }
    if (t.tile.type === TerrainType.Snow) {
      ctx.fillStyle = 'rgba(200,220,255,0.35)';
      ctx.fillRect(t.x0, t.y0 - t.raise, t.fillW, t.fillH);
    }
    if (t.tile.type === TerrainType.DarkForest) {
      ctx.fillStyle = 'rgba(20,40,15,0.28)';
      ctx.fillRect(t.x0, t.y0 - t.raise, t.fillW, t.fillH);
    }
  }

  for (const { tile, tx, ty, x0, y0 } of terrainTiles(map, tileSize, w, h, viewRect, originX, originY)) {
    if (!isWater(tile.type)) continue;
    const selfDeep = tile.type === TerrainType.DeepWater;
    forEachCardinalNeighbor(map, tx, ty, (dir, nb) => {
      if (!isWater(nb.type)) return;
      if ((nb.type === TerrainType.DeepWater) === selfDeep) return;
      const a = parseTerrainRgb(seasonColorAt(tile.type, tile.variation, map.preset));
      const b = parseTerrainRgb(seasonColorAt(nb.type, nb.variation, map.preset));
      const mid = rgbStr(Math.round((a.r + b.r) / 2), Math.round((a.g + b.g) / 2), Math.round((a.b + b.b) / 2));
      const band = Math.max(1, Math.round(tileSize * 0.18));
      ctx.fillStyle = mid;
      ctx.globalAlpha = 0.5;
      if (dir === 'n') ctx.fillRect(x0, y0, tileSize, band);
      else if (dir === 's') ctx.fillRect(x0, y0 + tileSize - band, tileSize, band);
      else if (dir === 'w') ctx.fillRect(x0, y0, band, tileSize);
      else ctx.fillRect(x0 + tileSize - band, y0, band, tileSize);
      ctx.globalAlpha = 1;
    });
  }

  if (lod > 1) {
    const cells = 4;
    const cw = tileSize / cells;
    const chh = tileSize / cells;
    for (const { tx, ty, x0, y0 } of terrainTiles(map, tileSize, w, h, viewRect, originX, originY)) {
      for (let cy = 0; cy < cells; cy++) {
        for (let cx = 0; cx < cells; cx++) {
          const hsh = hash01(tx * 97 + cx * 7 + cy * 3, ty * 113 + cy * 5 + cx, seed + 11);
          ctx.fillStyle = hsh > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
          ctx.fillRect(x0 + cx * cw, y0 + cy * chh, cw, chh);
        }
      }
    }
  }

  const waterRects: { x: number; y: number; w: number; h: number }[] = [];
  for (const { tile, x0, y0 } of terrainTiles(map, tileSize, w, h, viewRect, originX, originY)) {
    if (!isWater(tile.type)) continue;
    waterRects.push({
      x: x0,
      y: y0,
      w: Math.min(tileSize, w - x0),
      h: Math.min(tileSize, h - y0),
    });
  }
  if (seasonBlend) {
    applySeasonWash(ctx, seasonBlend.from, w, h, 1 - seasonBlend.t, waterRects);
    applySeasonWash(ctx, seasonBlend.to, w, h, seasonBlend.t, waterRects);
  } else {
    applySeasonWash(ctx, season, w, h, 1, waterRects);
  }

  ctx.save();
  ctx.fillStyle = WATER_GLAZE;
  for (const { tile, x0, y0 } of terrainTiles(map, tileSize, w, h, viewRect, originX, originY)) {
    if (!isWater(tile.type)) continue;
    ctx.fillRect(x0, y0, Math.min(tileSize, w - x0), Math.min(tileSize, h - y0));
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = RIVER_GLAZE;
  for (const { tile, tx, ty, x0, y0 } of terrainTiles(map, tileSize, w, h, viewRect, originX, originY)) {
    if (tile.type !== TerrainType.River) continue;
    const fillW = Math.min(tileSize, w - x0);
    const fillH = Math.min(tileSize, h - y0);
    ctx.fillRect(x0, y0, fillW, fillH);

    if ((tx * 3 + ty * 5 + seed) % 4 === 0 && fillW >= 6 && fillH >= 5) {
      ctx.fillStyle = RIVER_GLINT;
      const glintY = y0 + Math.max(2, Math.floor(fillH * 0.42));
      ctx.fillRect(x0 + Math.max(1, Math.floor(fillW * 0.18)), glintY, Math.max(2, Math.floor(fillW * 0.54)), 1);
      ctx.fillStyle = RIVER_GLAZE;
    }
  }
  ctx.restore();

  return {
    surface,
    ctx,
    width: w,
    height: h,
    worldWidth: viewW,
    worldHeight: viewH,
    offsetX: viewRect?.x ?? 0,
    offsetY: viewRect?.y ?? 0,
    seed: map.seed,
    preset: map.preset,
    season,
    lod,
    seasonBlendT: seasonBlend ? Math.round(seasonBlend.t * 100) : undefined,
    fills: terrainFillSpritesReady(),
    atlas: atlasReady,
    materialAtlasRevision: overlayReady ? TERRAIN_MATERIAL_ATLAS_REVISION : 0,
  };
}

function applySeasonWash(
  ctx: CanvasContext2d,
  season: Season,
  w: number,
  h: number,
  alpha = 1,
  waterRects: { x: number; y: number; w: number; h: number }[] = [],
): void {
  const fillMap = (color: string): void => {
    ctx.fillStyle = color;
    if (waterRects.length === 0) {
      ctx.fillRect(0, 0, w, h);
      return;
    }
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    for (const r of waterRects) ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill('evenodd');
  };
  ctx.save();
  ctx.globalAlpha = alpha;
  switch (season) {
    case 'spring':
      fillMap('rgba(120, 220, 100, 0.16)');
      fillMap('rgba(255, 255, 200, 0.05)');
      break;
    case 'summer':
      fillMap('rgba(255, 210, 70, 0.18)');
      fillMap('rgba(180, 120, 40, 0.08)');
      break;
    case 'fall':
      fillMap('rgba(210, 110, 40, 0.22)');
      fillMap('rgba(80, 40, 20, 0.06)');
      break;
    case 'winter':
      fillMap('rgba(160, 190, 230, 0.28)');
      fillMap('rgba(240, 248, 255, 0.12)');
      break;
    default:
      ctx.restore();
      return;
  }
  ctx.restore();
}

