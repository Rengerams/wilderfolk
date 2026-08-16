import { TerrainType, TERRAIN_TILE_SIZE, type MapPreset, type Season, type TerrainTile, type WorldMap } from './gameTypes';
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
  reliefY,
  terrainAtlasReady,
  TERRAIN_ATLAS_PATH,
  type AtlasPick,
} from './terrainAtlas';

/** Seamless fills under public/sprites/ (terrain/ = procedural, root = painted). */
const TERRAIN_FILL_PATH: Partial<Record<TerrainType, string>> = {
  [TerrainType.Grassland]: '/sprites/terrain/grass_fill.png',
  [TerrainType.Forest]: '/sprites/terrain/grass_fill.png',
  [TerrainType.DarkForest]: '/sprites/terrain/grass_fill.png',
  // Painted dirt (25×25 seamless) — hills/peaks read as painted soil on the
  // 2.5D relief surfaces (dirt_fill.png stays as the offline fallback sprite).
  [TerrainType.Hills]: '/sprites/tile_dirt.png',
  [TerrainType.Rocky]: '/sprites/tile_dirt.png',
  [TerrainType.Beach]: '/sprites/terrain/sand_fill.png',
  [TerrainType.RiverBank]: '/sprites/terrain/sand_fill.png',
  [TerrainType.ShallowWater]: '/sprites/terrain/water_shallow_fill.png',
  [TerrainType.River]: '/sprites/terrain/water_shallow_fill.png',
  [TerrainType.DeepWater]: '/sprites/terrain/water_deep_fill.png',
  [TerrainType.Snow]: '/sprites/terrain/sand_fill.png', // tinted cool via shade overlay
  [TerrainType.Mountains]: '/sprites/tile_dirt.png',
};

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
  tx: number,
  ty: number,
  alpha = 1,
): boolean {
  const path = TERRAIN_FILL_PATH[type];
  if (!path) return false;
  const img = getSprite(path);
  if (!img) return false;
  const iw = img.naturalWidth || (img as HTMLImageElement).width || 128;
  const ih = img.naturalHeight || (img as HTMLImageElement).height || 128;
  const sx = ((tx * 17) % iw + iw) % iw;
  const sy = ((ty * 13) % ih + ih) % ih;
  const prev = ctx.globalAlpha;
  try {
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(img as CanvasImageSource, 0, 0, iw, ih, x0, y0, fillW, fillH);
    if (sx > 0 || sy > 0) {
      ctx.globalAlpha = prev * alpha * 0.35;
      ctx.drawImage(img as CanvasImageSource, sx, sy, Math.max(1, iw - sx), Math.max(1, ih - sy), x0, y0, fillW, fillH);
    }
    ctx.globalAlpha = prev;
    return true;
  } catch {
    ctx.globalAlpha = prev;
    return false;
  }
}

type Cardinal = 'n' | 's' | 'e' | 'w';

/**
 * Phase B — soft autotile-style edge: feather neighbor fill into this tile.
 * Uses strip alphas (no extra transition art). Band width scales with tile size.
 */
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
    // Stronger neighbor presence nearer the shared edge
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

  // Shore highlight: land next to water gets a thin foam/sand lip (2px reads
  // as a painted coastline; scales with tile size).
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

/**
 * Stamp one painted atlas tile (16×16 source, scaled to the cell), honouring
 * the mirror flips the corner table picked. Returns true when drawn.
 */
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

/**
 * 2.5D relief — the shaded earth face under a raised tile. Spans
 * [y0 + fillH − raise, y0 + fillH] with a sun-lit lip on its top edge, so a
 * hillside reads as a cliff dropping to the lower ground / water below.
 */
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
  // Sun lip on the cliff's top edge
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
  /** Bake resolution factor — 2 when zoomed in close so tiles get fine detail. */
  lod: number;
  /** Season-lerp progress ×100 (0-100) — cache invalidates as the palette fades. */
  seasonBlendT?: number;
  /** True when this bake used seamless fill sprites (not flat RGB only). */
  fills: boolean;
  /** True when this bake stamped the painted terrain atlas tiles. */
  atlas: boolean;
}

/** World-pixel decor (rivers + map border + ground props) — static until map seed/preset changes. */
export interface TerrainDecorCache {
  surface: TerrainSurface;
  ctx: CanvasContext2d;
  width: number;
  height: number;
  seed: number;
  preset: string;
  /** True when bush/stump/grass prop sprites were stamped this bake. */
  props: boolean;
}

/** True when seamless fill sprites are in the sprite cache (rebuild once after preload). */
export function terrainFillSpritesReady(): boolean {
  return Object.values(TERRAIN_FILL_PATH).every((p) => p != null && getSprite(p) != null);
}

export function terrainLayerNeedsRebuild(
  cache: TerrainLayerCache | null,
  map: WorldMap,
  season: Season,
  worldWidth: number,
  worldHeight: number,
  lod = 1,
  seasonBlendT?: number,
): boolean {
  if (!cache) return true;
  // After sprites finish loading, force one rebake so fills replace flat color
  if (terrainFillSpritesReady() && !cache.fills) {
    return true;
  }
  // Same for the painted atlas — bake flat once, then re-bake painted
  if (terrainAtlasReady() && !cache.atlas) {
    return true;
  }
  return cache.worldWidth !== worldWidth
    || cache.worldHeight !== worldHeight
    || cache.seed !== map.seed
    || cache.preset !== map.preset
    || cache.season !== season
    || cache.lod !== lod
    || (cache.seasonBlendT ?? 0) !== (seasonBlendT ?? 0);
}

function landscapePropSpritesReady(): boolean {
  return (
    getSprite('/sprites/bush.png') != null
    || getSprite('/sprites/stump.png') != null
    || getSprite('/sprites/grass.png') != null
  );
}

export function terrainDecorNeedsRebuild(
  cache: TerrainDecorCache | null,
  map: WorldMap,
  worldWidth: number,
  worldHeight: number,
): boolean {
  if (!cache) return true;
  if (landscapePropSpritesReady() && !cache.props) return true;
  return cache.width !== worldWidth
    || cache.height !== worldHeight
    || cache.seed !== map.seed
    || cache.preset !== map.preset;
}

/** Release GPU/RAM held by a baked terrain surface before replacing the cache. */
export function disposeTerrainLayer(cache: TerrainLayerCache | null): void {
  if (!cache) return;
  disposeCanvasSurface(cache.surface);
}

export function disposeTerrainDecor(cache: TerrainDecorCache | null): void {
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
  // light: -1 dark … 0 neutral … +1 bright
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

/** Stable hash noise 0..1 for micro-detail. */
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

/** Relative visual height band from tile type + elevation (for 2.5D slopes). */
function tileRelief(type: TerrainType, elevation: number): number {
  const e = Math.max(0, Math.min(100, elevation)) / 100;
  switch (type) {
    case TerrainType.DeepWater: return 0.05 + e * 0.05;
    case TerrainType.ShallowWater:
    case TerrainType.River: return 0.12 + e * 0.08;
    case TerrainType.Beach:
    case TerrainType.RiverBank: return 0.28 + e * 0.1;
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
  const tile = map.tiles[ty]?.[tx];
  if (!tile) return fallback;
  return tileRelief(tile.type, tile.elevation);
}

/** A single terrain tile with its pixel origin, or undefined out of bounds. */
type TileEntry = {
  tile: NonNullable<WorldMap['tiles'][number][number]>;
  tx: number;
  ty: number;
  x0: number;
  y0: number;
};

/**
 * Iterate every terrain tile with its pixel origin (skips out-of-bounds).
 * Generator form so call sites stay plain for-of loops without re-indenting.
 */
function *terrainTiles(
  map: WorldMap,
  tileSize: number,
  w: number,
  h: number,
): Generator<TileEntry> {
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile) continue;
      const x0 = tx * tileSize;
      const y0 = ty * tileSize;
      if (x0 >= w || y0 >= h) continue;
      yield { tile, tx, ty, x0, y0 };
    }
  }
}

/** Run a callback for each of the four cardinal neighbours of a tile. */
function forEachCardinalNeighbor(
  map: WorldMap,
  tx: number,
  ty: number,
  cb: (dir: 'n' | 's' | 'w' | 'e', nb: NonNullable<WorldMap['tiles'][number][number]>) => void,
): void {
  const north = map.tiles[ty - 1]?.[tx];
  if (north) cb('n', north);
  const south = map.tiles[ty + 1]?.[tx];
  if (south) cb('s', south);
  const west = map.tiles[ty]?.[tx - 1];
  if (west) cb('w', west);
  const east = map.tiles[ty]?.[tx + 1];
  if (east) cb('e', east);
}

/**
 * Bake a textured, elevation-lit terrain sheet.
 * Uses NW key light + slope from neighbors so the ground reads as 2.5D relief.
 */
export function bakeTerrainLayer(
  map: WorldMap,
  worldWidth: number,
  worldHeight: number,
  season: Season,
  colorAt: (type: TerrainType, season: Season, variation: number, preset?: MapPreset) => string,
  lod = 1,
  seasonBlend?: { from: Season; to: Season; t: number },
): TerrainLayerCache {
  const w = Math.max(1, Math.floor(worldWidth * lod));
  const h = Math.max(1, Math.floor(worldHeight * lod));
  const surface = createCanvasSurface(w, h);
  const ctx = getCanvasContext(surface);
  const tileSize = TERRAIN_TILE_SIZE * lod;
  const seed = typeof map.seed === 'number' ? map.seed : 1;

  // Season-lerp colour source — fades between the outgoing and incoming palette.
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

  // Base fill
  ctx.fillStyle = seasonColorAt(TerrainType.Grassland, 0.5, map.preset);
  ctx.fillRect(0, 0, w, h);

  const atlasReady = terrainAtlasReady();
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

  for (const { tile, tx, ty, x0, y0 } of terrainTiles(map, tileSize, w, h)) {
      const fillW = Math.min(tileSize, w - x0);
      const fillH = Math.min(tileSize, h - y0);

      // 2.5D relief — raised tiles (hills/peaks) render in a sorted pass after
      // the flat base, so their cliff faces layer over the lower ground.
      const raise = reliefY(tile.type, tile.elevation) * tileSize;
      if (raise > 0) {
        reliefTiles.push({ tile, tx, ty, x0, y0, fillW, fillH, raise });
        continue;
      }

      const base = parseTerrainRgb(seasonColorAt(tile.type, tile.variation, map.preset));
      const relief = tileRelief(tile.type, tile.elevation);

      // Slope from neighbors (N/W higher = lit face; S/E higher = shade)
      const nR = neighborRelief(map, tx, ty - 1, relief);
      const sR = neighborRelief(map, tx, ty + 1, relief);
      const wR = neighborRelief(map, tx - 1, ty, relief);
      const eR = neighborRelief(map, tx + 1, ty, relief);
      const slopeLight = (nR - sR) * 0.55 + (wR - eR) * 0.35;
      // Absolute height: higher ground slightly brighter (sun hits peaks)
      const heightLight = (relief - 0.45) * 0.35;
      const waterDark = isWater(tile.type) ? -0.08 : 0;
      const light = slopeLight + heightLight + waterDark;
      const tint = light >= 0
        ? `rgba(255,255,255,${Math.min(0.22, light * 0.35)})`
        : `rgba(0,0,0,${Math.min(0.35, -light * 0.45)})`;

      // Painted atlas tile when loaded and the corner set matches — the flat
      // grass/water/forest floor (painted shores and texture replace the fills).
      const atlasPick = atlasReady ? pickAtlasTile(map, tx, ty) : null;
      const atlasImg = atlasPick ? getSprite(TERRAIN_ATLAS_PATH) : null;
      const stamped = atlasImg && atlasPick
        ? drawAtlasTile(ctx, atlasImg, atlasPick, x0, y0, fillW, fillH)
        : drawTerrainFill(ctx, tile.type, x0, y0, fillW, fillH, tx, ty);

      if (atlasPick) {
        // Painted tile is self-contained — relief light + canopy tint only
        // (no feather/bevel/variation: the art carries the form).
        ctx.fillStyle = tint;
        ctx.fillRect(x0, y0, fillW, fillH);
        if (tile.type === TerrainType.DarkForest) {
          ctx.fillStyle = 'rgba(20,40,15,0.28)';
          ctx.fillRect(x0, y0, fillW, fillH);
        }
      } else if (!stamped) {
        ctx.fillStyle = shadeRgb(base, light);
        ctx.fillRect(x0, y0, fillW, fillH);
      } else {
        // Phase B — feather different material families from N/E/S/W
        const north = map.tiles[ty - 1]?.[tx];
        const southT = map.tiles[ty + 1]?.[tx];
        const west = map.tiles[ty]?.[tx - 1];
        const eastT = map.tiles[ty]?.[tx + 1];
        if (north) blendNeighborEdge(ctx, tile.type, north.type, x0, y0, fillW, fillH, tx, ty, 'n', tileSize);
        if (southT) blendNeighborEdge(ctx, tile.type, southT.type, x0, y0, fillW, fillH, tx, ty, 's', tileSize);
        if (west) blendNeighborEdge(ctx, tile.type, west.type, x0, y0, fillW, fillH, tx, ty, 'w', tileSize);
        if (eastT) blendNeighborEdge(ctx, tile.type, eastT.type, x0, y0, fillW, fillH, tx, ty, 'e', tileSize);

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

      if (!atlasPick) {

      // Color mid-blend for solid fallback (or as extra soft seam when textured)
      if (!stamped) {
        const east = map.tiles[ty]?.[tx + 1];
        if (east && east.type !== tile.type) {
          const a = parseTerrainRgb(seasonColorAt(tile.type, tile.variation, map.preset));
          const b = parseTerrainRgb(seasonColorAt(east.type, east.variation, map.preset));
          ctx.fillStyle = rgbStr((a.r + b.r) / 2, (a.g + b.g) / 2, (a.b + b.b) / 2);
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x0 + fillW - 1, y0, 2, fillH);
          ctx.globalAlpha = 1;
        }
        const south = map.tiles[ty + 1]?.[tx];
        if (south && south.type !== tile.type) {
          const a = parseTerrainRgb(seasonColorAt(tile.type, tile.variation, map.preset));
          const b = parseTerrainRgb(seasonColorAt(south.type, south.variation, map.preset));
          ctx.fillStyle = rgbStr((a.r + b.r) / 2, (a.g + b.g) / 2, (a.b + b.b) / 2);
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x0, y0 + fillH - 1, fillW, 2);
          ctx.globalAlpha = 1;
        }
      }

      // Lighter bevel when textured — skipped on flat terrain so the ground
      // stops looking like a grid of framed blocks (textures carry the form).
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

      // Per-tile brightness variation — breaks up large uniform regions so the
      // ground stops reading as identical colored blocks (multi-variant look).
      const varAmt = (hash01(tx * 31, ty * 47, seed) - 0.5) * 0.16;
      if (Math.abs(varAmt) > 0.02) {
        ctx.fillStyle = varAmt > 0
          ? `rgba(255,255,255,${Math.min(0.06, varAmt)})`
          : `rgba(0,0,0,${Math.min(0.07, -varAmt)})`;
        ctx.fillRect(x0, y0, fillW, fillH);
      }
      } // !atlasPick
  }

  // Relief pass — raised tiles (hills/peaks) drawn low→high so each cliff face
  // layers under the next raised surface; water stays flat below them.
  reliefTiles.sort((a, b) => (a.y0 - a.raise) - (b.y0 - b.raise));
  for (const t of reliefTiles) {
    const base = parseTerrainRgb(seasonColorAt(t.tile.type, t.tile.variation, map.preset));
    drawCliffFace(ctx, t.x0, t.y0, t.fillW, t.fillH, t.raise, base, tileSize);
    const stamped = drawTerrainFill(ctx, t.tile.type, t.x0, t.y0 - t.raise, t.fillW, t.fillH, t.tx, t.ty);
    if (!stamped) {
      ctx.fillStyle = shadeRgb(base, 0.08);
      ctx.fillRect(t.x0, t.y0 - t.raise, t.fillW, t.fillH);
    } else {
      // Sun-lit top edge on the raised surface
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(t.x0, t.y0 - t.raise, t.fillW, Math.max(1, Math.round(tileSize * 0.08)));
    }
    // Material overlays the flat pass applies too (snow veil, forest canopy)
    if (t.tile.type === TerrainType.Snow) {
      ctx.fillStyle = 'rgba(200,220,255,0.35)';
      ctx.fillRect(t.x0, t.y0 - t.raise, t.fillW, t.fillH);
    }
    if (t.tile.type === TerrainType.DarkForest) {
      ctx.fillStyle = 'rgba(20,40,15,0.28)';
      ctx.fillRect(t.x0, t.y0 - t.raise, t.fillW, t.fillH);
    }
  }

  // Shallow↔deep water transition — rivers fade into deeper water instead of a
  // hard color seam (same material family, so blendNeighborEdge skips them).
  for (const { tile, tx, ty, x0, y0 } of terrainTiles(map, tileSize, w, h)) {
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

  // High-zoom LOD — fine patchwork noise per tile so close zoom stops reading
  // as flat 10px blocks (only drawn on the 2× bake).
  if (lod > 1) {
    const cells = 4;
    const cw = tileSize / cells;
    const chh = tileSize / cells;
    for (const { tx, ty, x0, y0 } of terrainTiles(map, tileSize, w, h)) {
        for (let cy = 0; cy < cells; cy++) {
          for (let cx = 0; cx < cells; cx++) {
            const hsh = hash01(tx * 97 + cx * 7 + cy * 3, ty * 113 + cy * 5 + cx, seed + 11);
            ctx.fillStyle = hsh > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
            ctx.fillRect(x0 + cx * cw, y0 + cy * chh, cw, chh);
          }
        }
      }
  }

  // Phase D — full-map seasonal wash (after all tile stamps); blended during
  // season transitions so the palette fades instead of snapping.
  if (seasonBlend) {
    applySeasonWash(ctx, seasonBlend.from, w, h, 1 - seasonBlend.t);
    applySeasonWash(ctx, seasonBlend.to, w, h, seasonBlend.t);
  } else {
    applySeasonWash(ctx, season, w, h);
  }

  return {
    surface,
    ctx,
    width: w,
    height: h,
    worldWidth,
    worldHeight,
    seed: map.seed,
    preset: map.preset,
    season,
    lod,
    seasonBlendT: seasonBlend ? Math.round(seasonBlend.t * 100) : undefined,
    fills: terrainFillSpritesReady(),
    atlas: atlasReady,
  };
}

/**
 * Full-layer seasonal grade — strong enough to read at a glance (was ~5–14% and easy to miss).
 * Uses Season enum values / string ids from gameTypes.
 */
function applySeasonWash(ctx: CanvasContext2d, season: Season, w: number, h: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  switch (season) {
    case 'spring':
      // Fresh green lift
      ctx.fillStyle = 'rgba(120, 220, 100, 0.16)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255, 255, 200, 0.05)';
      break;
    case 'summer':
      // Hot dry gold / haze (must read vs spring green)
      ctx.fillStyle = 'rgba(255, 210, 70, 0.18)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(180, 120, 40, 0.08)';
      break;
    case 'fall':
      // Amber / rust
      ctx.fillStyle = 'rgba(210, 110, 40, 0.22)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(80, 40, 20, 0.06)';
      break;
    case 'winter':
      // Cold blue-grey + light snow veil
      ctx.fillStyle = 'rgba(160, 190, 230, 0.28)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(240, 248, 255, 0.12)';
      break;
    default:
      ctx.restore();
      return;
  }
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function bakeTerrainDecor(map: WorldMap, worldWidth: number, worldHeight: number): TerrainDecorCache {
  const w = Math.max(1, Math.floor(worldWidth));
  const h = Math.max(1, Math.floor(worldHeight));
  const surface = createCanvasSurface(w, h);
  const ctx = getCanvasContext(surface);

  if (map.rivers) {
    // Soft river banks (darker underlay) then bright water stroke — reads as depth
    for (const river of map.rivers) {
      if (river.length < 2) continue;
      ctx.strokeStyle = 'rgba(20, 50, 80, 0.45)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(river[0].x, river[0].y);
      for (let i = 1; i < river.length; i++) ctx.lineTo(river[i].x, river[i].y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(55, 130, 200, 0.75)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(river[0].x, river[0].y);
      for (let i = 1; i < river.length; i++) ctx.lineTo(river[i].x, river[i].y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(160, 210, 255, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(river[0].x, river[0].y - 1);
      for (let i = 1; i < river.length; i++) ctx.lineTo(river[i].x, river[i].y - 1);
      ctx.stroke();
    }
  }

  // Shore reflection — the land's colours faintly mirror into the first water
  // row: a darker teal-green band that fades, so water next to land reads as a
  // mirror instead of a hard colour stop.
  for (const { tile, tx, ty, x0, y0 } of terrainTiles(map, TERRAIN_TILE_SIZE, w, h)) {
    if (!isWater(tile.type)) continue;
    forEachCardinalNeighbor(map, tx, ty, (dir, nb) => {
      if (isWater(nb.type)) return;
      const rim = 2;
      ctx.fillStyle = dir === 'n' ? 'rgba(38, 68, 58, 0.32)' : 'rgba(38, 68, 58, 0.24)';
      if (dir === 'n') ctx.fillRect(x0, y0, TERRAIN_TILE_SIZE, rim);
      else if (dir === 's') ctx.fillRect(x0, y0 + TERRAIN_TILE_SIZE - rim, TERRAIN_TILE_SIZE, rim);
      else if (dir === 'w') ctx.fillRect(x0, y0, rim, TERRAIN_TILE_SIZE);
      else ctx.fillRect(x0 + TERRAIN_TILE_SIZE - rim, y0, rim, TERRAIN_TILE_SIZE);
      ctx.fillStyle = 'rgba(33, 58, 52, 0.15)';
      if (dir === 'n') ctx.fillRect(x0, y0 + rim, TERRAIN_TILE_SIZE, rim);
      else if (dir === 's') ctx.fillRect(x0, y0 + TERRAIN_TILE_SIZE - rim * 2, TERRAIN_TILE_SIZE, rim);
      else if (dir === 'w') ctx.fillRect(x0 + rim, y0, rim, TERRAIN_TILE_SIZE);
      else ctx.fillRect(x0 + TERRAIN_TILE_SIZE - rim * 2, y0, rim, TERRAIN_TILE_SIZE);
    });
  }

  // Phase C — ground clutter (deterministic by tile + seed; not sim entities)
  stampLandscapeProps(ctx, map, w, h);

  // Map rim — soft outer shadow + inner highlight (tabletop edge)
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.strokeStyle = 'rgba(200, 230, 200, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  return {
    surface,
    ctx,
    width: w,
    height: h,
    seed: map.seed,
    preset: map.preset,
    props: landscapePropSpritesReady(),
  };
}

function stampPropSprite(
  ctx: CanvasContext2d,
  path: string,
  wx: number,
  wy: number,
  drawW: number,
  drawH: number,
  flipX: boolean,
): void {
  const img = getSprite(path);
  if (!img) return;
  const iw = img.naturalWidth || (img as HTMLImageElement).width || 1;
  const ih = img.naturalHeight || (img as HTMLImageElement).height || 1;
  ctx.save();
  // Contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(wx + 1, wy + drawH * 0.12, drawW * 0.35, drawH * 0.12, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(wx, wy);
  if (flipX) {
    ctx.scale(-1, 1);
    ctx.drawImage(img as CanvasImageSource, 0, 0, iw, ih, -drawW / 2, -drawH * 0.85, drawW, drawH);
  } else {
    ctx.drawImage(img as CanvasImageSource, 0, 0, iw, ih, -drawW / 2, -drawH * 0.85, drawW, drawH);
  }
  ctx.restore();
}

/**
 * Scatter bushes / stumps / grass tufts / rock clusters by terrain family.
 * Density: forest high, meadow sparse (with tiny flowers), hills rare.
 * Snow & beach get procedural (sprite-free) relief — mounds and ripples.
 */
function stampLandscapeProps(
  ctx: CanvasContext2d,
  map: WorldMap,
  worldW: number,
  worldH: number,
): void {
  const tileSize = TERRAIN_TILE_SIZE;
  const seed = typeof map.seed === 'number' ? map.seed : 1;
  const bush = '/sprites/bush.png';
  const stump = '/sprites/stump.png';
  const grassTuft = '/sprites/grass.png';
  const grassTuft2 = '/sprites/grass2.png';

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile || isWater(tile.type)) continue;
      const r0 = hash01(tx, ty, seed);
      const r1 = hash01(tx + 3, ty + 7, seed + 11);
      const r2 = hash01(tx * 5, ty * 3, seed + 29);
      const cx = tx * tileSize + tileSize * (0.25 + r0 * 0.5);
      // Ride the 2.5D relief — props sit on the raised terrain surface
      const cy = ty * tileSize + tileSize * (0.35 + r1 * 0.45)
        - reliefY(tile.type, tile.elevation) * tileSize;
      if (cx < 8 || cy < 8 || cx > worldW - 8 || cy > worldH - 8) continue;

      // Snow — soft mounds with a cool shadow so white-on-white still reads.
      if (tile.type === TerrainType.Snow) {
        if (r0 > 0.12) continue;
        drawSnowMound(ctx, cx, cy, 4 + r2 * 5, r1);
        continue;
      }
      // Beach — faint sand ripples instead of a flat band.
      if (tile.type === TerrainType.Beach) {
        if (r0 > 0.1) continue;
        drawSandRipple(ctx, cx, cy, 8 + r2 * 6, r1 > 0.5);
        continue;
      }

      const fam = fillFamily(tile.type);
      if (fam !== 'grass' && fam !== 'dirt') continue;

      // Chance: dark forest dense, meadow sparse, hills rare
      const density = fam === 'grass'
        ? (tile.type === TerrainType.DarkForest
          ? 0.48
          : tile.type === TerrainType.Forest
            ? 0.36
            : 0.16)
        : 0.1;
      if (r0 > density) continue;

      const flip = r1 > 0.5;
      if (fam === 'grass') {
        if (tile.type === TerrainType.Forest || tile.type === TerrainType.DarkForest) {
          if (r1 < 0.35) {
            stampPropSprite(ctx, stump, cx, cy, 11 + r2 * 6, 8 + r2 * 4, flip);
          } else if (r1 < 0.75) {
            stampPropSprite(ctx, bush, cx, cy, 12 + r2 * 8, 10 + r2 * 5, flip);
          } else {
            stampPropSprite(ctx, r2 > 0.5 ? grassTuft2 : grassTuft, cx, cy, 9 + r2 * 5, 8 + r2 * 4, flip);
          }
          // Second prop sometimes for dark forest density
          if (tile.type === TerrainType.DarkForest && r2 > 0.55) {
            const cx2 = cx + (r1 - 0.5) * tileSize * 0.8;
            const cy2 = cy + (r0 - 0.5) * tileSize * 0.6;
            stampPropSprite(ctx, bush, cx2, cy2, 10, 8, !flip);
          }
        } else {
          // Open meadow — grass tufts only, not walls of bushes; tiny flowers now and then.
          stampPropSprite(ctx, r1 > 0.5 ? grassTuft : grassTuft2, cx, cy, 8 + r2 * 5, 7 + r2 * 4, flip);
          if (r2 < 0.3 && tile.type === TerrainType.Grassland) {
            drawMeadowFlower(ctx, cx + (r1 - 0.5) * 7, cy - 2 + (r0 - 0.5) * 5, r2);
          }
        }
      } else if (fam === 'dirt') {
        if (r1 < 0.4 && getSprite(stump)) {
          stampPropSprite(ctx, stump, cx, cy, 9 + r2 * 4, 7 + r2 * 3, flip);
        } else {
          drawRockCluster(ctx, cx, cy, r0, r1, r2);
        }
      }
    }
  }
}

/** Soft snow mound — shadowed base + bright top reads as relief on white ground. */
function drawSnowMound(ctx: CanvasContext2d, cx: number, cy: number, size: number, roll: number): void {
  ctx.fillStyle = 'rgba(120, 150, 190, 0.18)';
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + 1.6, size, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(246, 250, 255, 0.8)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, size, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.15, cy - size * 0.12, size * 0.6, size * 0.28, roll - 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/** Faint wind-blown sand ripple on the beach. */
function drawSandRipple(ctx: CanvasContext2d, cx: number, cy: number, length: number, flip: boolean): void {
  const dir = flip ? -1 : 1;
  ctx.strokeStyle = 'rgba(235, 220, 180, 0.32)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - length * 0.4 * dir, cy + 2);
  ctx.quadraticCurveTo(cx, cy - 1, cx + length * 0.4 * dir, cy + 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(160, 140, 105, 0.16)';
  ctx.beginPath();
  ctx.moveTo(cx - length * 0.4 * dir, cy + 2.7);
  ctx.quadraticCurveTo(cx, cy + 0.6, cx + length * 0.4 * dir, cy + 2.7);
  ctx.stroke();
}

/** Tiny meadow flower — a pale dot with a darker centre, very subtle. */
function drawMeadowFlower(ctx: CanvasContext2d, cx: number, cy: number, roll: number): void {
  ctx.fillStyle = roll < 0.12 ? 'rgba(255, 240, 170, 0.5)' : roll < 0.24 ? 'rgba(250, 210, 220, 0.45)' : 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(180, 140, 40, 0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, 0.35, 0, Math.PI * 2);
  ctx.fill();
}

/** Procedural rock cluster — shadow, main stone, highlight, satellite pebble. */
function drawRockCluster(ctx: CanvasContext2d, cx: number, cy: number, r0: number, r1: number, r2: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(cx + 0.8, cy + 0.8, 4 + r2 * 3, 1.6 + r1, r0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(78, 74, 66, 0.75)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 2.6 + r2 * 2.2, 1.8 + r1 * 1.4, r0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(140, 132, 118, 0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - 0.7, cy - 0.6, 1.1 + r2 * 0.8, 0.7, r0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(90, 84, 74, 0.6)';
  ctx.beginPath();
  ctx.ellipse(cx + 3.4 + r1 * 1.5, cy + 1.2, 1.2 + r2, 0.8, r0 + 0.5, 0, Math.PI * 2);
  ctx.fill();
}
