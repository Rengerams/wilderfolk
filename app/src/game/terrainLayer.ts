import type { MapPreset, Season, TerrainType, WorldMap } from './gameTypes';
import {
  createCanvasSurface,
  disposeCanvasSurface,
  getCanvasContext,
  type CanvasContext2d,
  type CanvasSurface,
} from './canvasLayer';

export type TerrainSurface = CanvasSurface;

export interface TerrainLayerCache {
  surface: TerrainSurface;
  ctx: CanvasContext2d;
  width: number;
  height: number;
  seed: number;
  preset: string;
  season: Season;
}

/** World-pixel decor (rivers + map border) — static until map seed/preset changes. */
export interface TerrainDecorCache {
  surface: TerrainSurface;
  ctx: CanvasContext2d;
  width: number;
  height: number;
  seed: number;
  preset: string;
}

export function terrainLayerNeedsRebuild(
  cache: TerrainLayerCache | null,
  map: WorldMap,
  season: Season,
): boolean {
  if (!cache) return true;
  return cache.width !== map.width
    || cache.height !== map.height
    || cache.seed !== map.seed
    || cache.preset !== map.preset
    || cache.season !== season;
}

export function terrainDecorNeedsRebuild(
  cache: TerrainDecorCache | null,
  map: WorldMap,
  worldWidth: number,
  worldHeight: number,
): boolean {
  if (!cache) return true;
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

export function bakeTerrainLayer(
  map: WorldMap,
  season: Season,
  colorAt: (type: TerrainType, season: Season, variation: number, preset?: MapPreset) => string,
): TerrainLayerCache {
  const tileW = map.width;
  const tileH = map.height;
  const surface = createCanvasSurface(tileW, tileH);
  const ctx = getCanvasContext(surface);

  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile) continue;
      ctx.fillStyle = colorAt(tile.type, season, tile.variation, map.preset);
      ctx.fillRect(tx, ty, 1, 1);
    }
  }

  return {
    surface,
    ctx,
    width: tileW,
    height: tileH,
    seed: map.seed,
    preset: map.preset,
    season,
  };
}

export function bakeTerrainDecor(map: WorldMap, worldWidth: number, worldHeight: number): TerrainDecorCache {
  const w = Math.max(1, Math.floor(worldWidth));
  const h = Math.max(1, Math.floor(worldHeight));
  const surface = createCanvasSurface(w, h);
  const ctx = getCanvasContext(surface);

  if (map.rivers) {
    ctx.strokeStyle = 'rgba(55,115,180,0.7)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const river of map.rivers) {
      if (river.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(river[0].x, river[0].y);
      for (let i = 1; i < river.length; i++) {
        ctx.lineTo(river[i].x, river[i].y);
      }
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  return {
    surface,
    ctx,
    width: w,
    height: h,
    seed: map.seed,
    preset: map.preset,
  };
}