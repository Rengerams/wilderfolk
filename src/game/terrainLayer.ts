import { TerrainType, TERRAIN_TILE_SIZE, type MapPreset, type Season, type WorldMap } from './gameTypes';
import {
  createCanvasSurface,
  disposeCanvasSurface,
  getCanvasContext,
  type CanvasContext2d,
  type CanvasSurface,
} from './canvasLayer';
import { getSprite } from './spriteLoader';

/** Seamless 128px fills under public/sprites/terrain/ (game-asset-core Phase A). */
const TERRAIN_FILL_PATH: Partial<Record<TerrainType, string>> = {
  [TerrainType.Grassland]: '/sprites/terrain/grass_fill.png',
  [TerrainType.Forest]: '/sprites/terrain/grass_fill.png',
  [TerrainType.DarkForest]: '/sprites/terrain/grass_fill.png',
  [TerrainType.Hills]: '/sprites/terrain/dirt_fill.png',
  [TerrainType.Rocky]: '/sprites/terrain/dirt_fill.png',
  [TerrainType.Beach]: '/sprites/terrain/sand_fill.png',
  [TerrainType.RiverBank]: '/sprites/terrain/sand_fill.png',
  [TerrainType.ShallowWater]: '/sprites/terrain/water_shallow_fill.png',
  [TerrainType.River]: '/sprites/terrain/water_shallow_fill.png',
  [TerrainType.DeepWater]: '/sprites/terrain/water_deep_fill.png',
  [TerrainType.Snow]: '/sprites/terrain/sand_fill.png', // tinted cool via shade overlay
  [TerrainType.Mountains]: '/sprites/terrain/dirt_fill.png',
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

  // Shore highlight: land next to water gets a thin foam/sand lip
  const selfWater = fillFamily(selfType) === 'water';
  const nWater = fillFamily(neighborType) === 'water';
  if (selfWater !== nWater && fillW > 2 && fillH > 2) {
    ctx.fillStyle = selfWater ? 'rgba(255,255,255,0.14)' : 'rgba(230,210,160,0.28)';
    if (side === 'n') ctx.fillRect(x0, y0, fillW, 1);
    if (side === 's') ctx.fillRect(x0, y0 + fillH - 1, fillW, 1);
    if (side === 'w') ctx.fillRect(x0, y0, 1, fillH);
    if (side === 'e') ctx.fillRect(x0 + fillW - 1, y0, 1, fillH);
  }
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
  /** True when this bake used seamless fill sprites (not flat RGB only). */
  fills: boolean;
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
): boolean {
  if (!cache) return true;
  // After sprites finish loading, force one rebake so fills replace flat color
  if (terrainFillSpritesReady() && !cache.fills) {
    return true;
  }
  return cache.worldWidth !== worldWidth
    || cache.worldHeight !== worldHeight
    || cache.seed !== map.seed
    || cache.preset !== map.preset
    || cache.season !== season;
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
): TerrainLayerCache {
  const w = Math.max(1, Math.floor(worldWidth));
  const h = Math.max(1, Math.floor(worldHeight));
  const surface = createCanvasSurface(w, h);
  const ctx = getCanvasContext(surface);
  const tileSize = TERRAIN_TILE_SIZE;
  const seed = typeof map.seed === 'number' ? map.seed : 1;

  // Base fill
  ctx.fillStyle = colorAt(TerrainType.Grassland, season, 0.5, map.preset);
  ctx.fillRect(0, 0, w, h);

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile) continue;
      const x0 = tx * tileSize;
      const y0 = ty * tileSize;
      if (x0 >= w || y0 >= h) continue;
      const fillW = Math.min(tileSize, w - x0);
      const fillH = Math.min(tileSize, h - y0);

      const base = parseTerrainRgb(colorAt(tile.type, season, tile.variation, map.preset));
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

      // Seamless fill when preloaded; else solid color fallback
      const stamped = drawTerrainFill(ctx, tile.type, x0, y0, fillW, fillH, tx, ty);
      if (!stamped) {
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

        const tint = light >= 0
          ? `rgba(255,255,255,${Math.min(0.22, light * 0.35)})`
          : `rgba(0,0,0,${Math.min(0.35, -light * 0.45)})`;
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

      // Color mid-blend for solid fallback (or as extra soft seam when textured)
      if (!stamped) {
        const east = map.tiles[ty]?.[tx + 1];
        if (east && east.type !== tile.type) {
          const a = parseTerrainRgb(colorAt(tile.type, season, tile.variation, map.preset));
          const b = parseTerrainRgb(colorAt(east.type, season, east.variation, map.preset));
          ctx.fillStyle = rgbStr((a.r + b.r) / 2, (a.g + b.g) / 2, (a.b + b.b) / 2);
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x0 + fillW - 1, y0, 2, fillH);
          ctx.globalAlpha = 1;
        }
        const south = map.tiles[ty + 1]?.[tx];
        if (south && south.type !== tile.type) {
          const a = parseTerrainRgb(colorAt(tile.type, season, tile.variation, map.preset));
          const b = parseTerrainRgb(colorAt(south.type, season, south.variation, map.preset));
          ctx.fillStyle = rgbStr((a.r + b.r) / 2, (a.g + b.g) / 2, (a.b + b.b) / 2);
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x0, y0 + fillH - 1, fillW, 2);
          ctx.globalAlpha = 1;
        }
      }

      // Lighter bevel when textured
      if (fillW > 6 && fillH > 6) {
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
    }
  }

  // Phase D — full-map seasonal wash (after all tile stamps)
  applySeasonWash(ctx, season, w, h);

  return {
    surface,
    ctx,
    width: w,
    height: h,
    worldWidth: w,
    worldHeight: h,
    seed: map.seed,
    preset: map.preset,
    season,
    fills: terrainFillSpritesReady(),
  };
}

/**
 * Full-layer seasonal grade — strong enough to read at a glance (was ~5–14% and easy to miss).
 * Uses Season enum values / string ids from gameTypes.
 */
function applySeasonWash(ctx: CanvasContext2d, season: Season, w: number, h: number): void {
  ctx.save();
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
 * Scatter bushes / stumps / grass tufts / rock dots by terrain family.
 * Density: forest high, meadow medium, hills sparse, water/beach none.
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
      if (tile.type === TerrainType.Beach || tile.type === TerrainType.Snow) continue;

      const fam = fillFamily(tile.type);
      if (fam !== 'grass' && fam !== 'dirt') continue;
      const r0 = hash01(tx, ty, seed);
      const r1 = hash01(tx + 3, ty + 7, seed + 11);
      const r2 = hash01(tx * 5, ty * 3, seed + 29);
      const cx = tx * tileSize + tileSize * (0.25 + r0 * 0.5);
      const cy = ty * tileSize + tileSize * (0.35 + r1 * 0.45);
      if (cx < 8 || cy < 8 || cx > worldW - 8 || cy > worldH - 8) continue;

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
          // Open meadow — grass tufts only, not walls of bushes
          stampPropSprite(ctx, r1 > 0.5 ? grassTuft : grassTuft2, cx, cy, 8 + r2 * 5, 7 + r2 * 4, flip);
        }
      } else if (fam === 'dirt') {
        if (r1 < 0.4 && getSprite(stump)) {
          stampPropSprite(ctx, stump, cx, cy, 9 + r2 * 4, 7 + r2 * 3, flip);
        } else {
          // Procedural rock speck (no rock sprite)
          ctx.fillStyle = 'rgba(70, 68, 62, 0.55)';
          ctx.beginPath();
          ctx.ellipse(cx, cy, 2.2 + r2 * 2, 1.4 + r2 * 1.2, r0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(110, 105, 95, 0.4)';
          ctx.beginPath();
          ctx.ellipse(cx - 0.5, cy - 0.4, 1.2 + r2, 0.8, r0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}
