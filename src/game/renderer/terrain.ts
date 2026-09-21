import type { MapPreset, Season, TerrainType } from '../gameTypes';
import { Season as SeasonEnum, TerrainType as TerrainTypeEnum } from '../gameTypes';
import type { RenderSnapshot } from '../renderSnapshot';
import { seasonBlendForDay } from '../simHelpers';
import {
  bakeTerrainLayer,
  bakeTerrainDecor,
  disposeTerrainLayer,
  disposeTerrainDecor,
  terrainChunkCacheKeyFor,
  terrainDecorNeedsRebuild,
  type TerrainLayerCache,
  type TerrainDecorCache,
} from '../terrainLayer';
import { worldToScreen as w2s, screenToWorld } from '../viewState';
import { renderPixiTerrain, resetPixiTerrain } from './pixiTerrain';
import { TERRAIN_PALETTE } from '../terrainAtlas';

// Terrain base palette lives in the terrain owner (`terrainAtlas.TERRAIN_PALETTE`) so the bake,
// the minimap and the (dormant) Pixi ground cannot drift apart — audit D12.

/** Per-preset palette overrides so coastal/arid/harsh maps read differently at a glance. */
const PRESET_TERRAIN_COLORS: Partial<Record<MapPreset, Partial<Record<TerrainType, number>>>> = {
  verdant: {},
  mountainous: {
    [TerrainTypeEnum.Grassland]: 0x5a6e42,
    [TerrainTypeEnum.Hills]: 0x7a6848,
    [TerrainTypeEnum.Mountains]: 0x5a544e,
    [TerrainTypeEnum.Rocky]: 0x6e6860,
  },
  coastal: {
    [TerrainTypeEnum.Grassland]: 0x5a7a48,
    [TerrainTypeEnum.ShallowWater]: 0x2e6a9e,
    [TerrainTypeEnum.DeepWater]: 0x1a4a78,
    [TerrainTypeEnum.Beach]: 0xd8c898,
    [TerrainTypeEnum.RiverBank]: 0x6a8a58,
  },
  arid: {
    [TerrainTypeEnum.Grassland]: 0xb8a068,
    [TerrainTypeEnum.Forest]: 0x8a7a48,
    [TerrainTypeEnum.DarkForest]: 0x6a5a38,
    [TerrainTypeEnum.Hills]: 0xa09060,
    [TerrainTypeEnum.Beach]: 0xd4b878,
    [TerrainTypeEnum.Rocky]: 0x9a9080,
  },
  harsh: {
    [TerrainTypeEnum.Grassland]: 0x7a8a72,
    [TerrainTypeEnum.Forest]: 0x5a6a52,
    [TerrainTypeEnum.Hills]: 0x8a8478,
    [TerrainTypeEnum.Snow]: 0xe8eef4,
    [TerrainTypeEnum.Mountains]: 0x6a6660,
  },
};

// ============ TERRAIN CACHE (chunked OffscreenCanvas — lazy per-viewport) ============
const TERRAIN_CHUNK_SIZE = 1024; // world px per chunk
const TERRAIN_CHUNK_MARGIN = 1; // keep one chunk of margin around the viewport
const terrainChunkCache = new Map<string, TerrainLayerCache>();
let terrainChunkCacheKey = '';
let terrainDecorCache: TerrainDecorCache | null = null;

/** Release terrain caches. Called by {@link resetRendererCaches}. */
export function resetTerrainCaches(): void {
  resetPixiTerrain();
  for (const cache of terrainChunkCache.values()) disposeTerrainLayer(cache);
  terrainChunkCache.clear();
  terrainChunkCacheKey = '';
  disposeTerrainDecor(terrainDecorCache);
  terrainDecorCache = null;
}

/** Per-season shift on land tiles so spring/fall/winter aren't only a faint overlay. */
function seasonTerrainShift(season: Season, type: TerrainType): { r: number; g: number; b: number } {
  const isWater =
    type === TerrainTypeEnum.DeepWater
    || type === TerrainTypeEnum.ShallowWater
    || type === TerrainTypeEnum.River
    || type === TerrainTypeEnum.RiverBank;
  if (isWater) {
    if (season === SeasonEnum.Winter) return { r: 12, g: 18, b: 28 };
    if (season === SeasonEnum.Fall) return { r: 8, g: 4, b: -4 };
    return { r: 0, g: 0, b: 0 };
  }
  switch (season) {
    case SeasonEnum.Spring:
      return { r: -8, g: 22, b: -6 };
    case SeasonEnum.Summer:
      // Drier, yellower grass/dirt (distinct from spring green)
      return { r: 22, g: 8, b: -28 };
    case SeasonEnum.Fall:
      return { r: 28, g: -6, b: -22 };
    case SeasonEnum.Winter:
      return { r: 18, g: 22, b: 32 };
    default:
      return { r: 0, g: 0, b: 0 };
  }
}

function getTerrainColor(type: TerrainType, variation: number, preset?: MapPreset, season: Season = SeasonEnum.Spring): string {
  const presetHex = preset ? PRESET_TERRAIN_COLORS[preset]?.[type] : undefined;
  const hex = presetHex ?? TERRAIN_PALETTE[type] ?? TERRAIN_PALETTE[TerrainTypeEnum.Grassland];
  let r = (hex >> 16) & 0xff;
  let g = (hex >> 8) & 0xff;
  let b = hex & 0xff;
  const v = (variation - 0.5) * 3;
  const s = seasonTerrainShift(season, type);
  r += v + s.r;
  g += v + s.g;
  b += v + s.b;
  return `rgb(${Math.min(255, Math.max(0, r)) | 0},${Math.min(255, Math.max(0, g)) | 0},${Math.min(255, Math.max(0, b)) | 0})`;
}

/** Bake (or reuse) the chunked ground for the current viewport. Key owner: `terrainLayer`. */
function buildTerrainCache(state: RenderSnapshot, cw: number, ch: number) {
  if (!state.worldMap) return;
  const season = state.season ?? SeasonEnum.Spring;
  // Higher bake resolution when zoomed in close so the ground isn't blocky.
  const lod = state.camera.zoom >= 3 ? 2 : 1;
  // Season transitions fade the palette over a few days instead of snapping.
  const blend = seasonBlendForDay(state.dayInYear ?? 0);
  const blendT = blend ? Math.round(blend.t * 100) : undefined;
  const cacheKey = terrainChunkCacheKeyFor(state.worldMap, season, lod, blendT);
  if (terrainChunkCacheKey !== cacheKey) {
    for (const cache of terrainChunkCache.values()) disposeTerrainLayer(cache);
    terrainChunkCache.clear();
    terrainChunkCacheKey = cacheKey;
  }

  // Visible world rect + margin — only chunks intersecting it are baked.
  const cam = state.camera;
  const [tlX, tlY] = screenToWorld(0, 0, cam, cw, ch);
  const [brX, brY] = screenToWorld(cw, ch, cam, cw, ch);
  const vx = Math.min(tlX, brX);
  const vy = Math.min(tlY, brY);
  const vw = Math.abs(brX - tlX);
  const vh = Math.abs(brY - tlY);
  const margin = TERRAIN_CHUNK_SIZE * TERRAIN_CHUNK_MARGIN;
  const minX = Math.max(0, Math.floor((vx - margin) / TERRAIN_CHUNK_SIZE) * TERRAIN_CHUNK_SIZE);
  const minY = Math.max(0, Math.floor((vy - margin) / TERRAIN_CHUNK_SIZE) * TERRAIN_CHUNK_SIZE);
  const maxX = Math.min(state.width, Math.ceil((vx + vw + margin) / TERRAIN_CHUNK_SIZE) * TERRAIN_CHUNK_SIZE);
  const maxY = Math.min(state.height, Math.ceil((vy + vh + margin) / TERRAIN_CHUNK_SIZE) * TERRAIN_CHUNK_SIZE);

  const keep = new Set<string>();
  for (let cx = minX; cx < maxX; cx += TERRAIN_CHUNK_SIZE) {
    for (let cy = minY; cy < maxY; cy += TERRAIN_CHUNK_SIZE) {
      const key = `${cx},${cy}`;
      keep.add(key);
      if (terrainChunkCache.has(key)) continue;
      terrainChunkCache.set(
        key,
        bakeTerrainLayer(
          state.worldMap,
          state.width,
          state.height,
          season,
          (type, seas, variation, preset) => getTerrainColor(type, variation, preset, seas ?? season),
          lod,
          blend ?? undefined,
          {
            x: cx,
            y: cy,
            width: Math.min(TERRAIN_CHUNK_SIZE, state.width - cx),
            height: Math.min(TERRAIN_CHUNK_SIZE, state.height - cy),
          },
        ),
      );
    }
  }
  // Prune chunks that moved out of the viewport + margin.
  for (const [key, cache] of terrainChunkCache) {
    if (!keep.has(key)) {
      disposeTerrainLayer(cache);
      terrainChunkCache.delete(key);
    }
  }

  if (terrainDecorNeedsRebuild(terrainDecorCache, state.worldMap, state.width, state.height)) {
    disposeTerrainDecor(terrainDecorCache);
    terrainDecorCache = bakeTerrainDecor(state.worldMap, state.width, state.height);
  }
}

function drawSimpleGreenGround(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  const worldW = state.width || 1200;
  const worldH = state.height || 900;

  ctx.fillStyle = '#3f6f38';
  ctx.fillRect(0, 0, cw, ch);

  const [tlx, tly] = w2s(0, 0, cam, cw, ch);
  const [brx, bry] = w2s(worldW, worldH, cam, cw, ch);
  const mapW = brx - tlx;
  const mapH = bry - tly;

  ctx.fillStyle = '#72a85c';
  ctx.fillRect(tlx, tly, mapW, mapH);

  ctx.strokeStyle = 'rgba(31, 56, 28, 0.45)';
  ctx.lineWidth = Math.max(2, 2 * cam.zoom);
  ctx.strokeRect(tlx, tly, mapW, mapH);
}

function drawProceduralGround(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;

  const presetVoid = state.worldMap?.preset;
  const voidColors: Partial<Record<MapPreset, string>> = {
    coastal: '#0a1c30',
    arid: '#2a2218',
    harsh: '#1c2228',
    mountainous: '#121c18',
  };
  // Deep void — map reads as a raised diorama tabletop
  const voidBase = (presetVoid && voidColors[presetVoid]) || '#0c1410';
  ctx.fillStyle = voidBase;
  ctx.fillRect(0, 0, cw, ch);
  const voidGrad = ctx.createRadialGradient(cw * 0.5, ch * 0.4, Math.min(cw, ch) * 0.1, cw * 0.5, ch * 0.55, Math.max(cw, ch) * 0.8);
  voidGrad.addColorStop(0, 'rgba(28, 48, 36, 0.25)');
  voidGrad.addColorStop(0.45, 'rgba(10, 16, 12, 0)');
  voidGrad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = voidGrad;
  ctx.fillRect(0, 0, cw, ch);

  if (state.worldMap && terrainChunkCache.size > 0) {
    const [sx0, sy0] = w2s(0, 0, cam, cw, ch);
    // Draw at WORLD scale — the baked surface may be lod× larger than the world.
    const drawW = state.width * cam.zoom;
    const drawH = state.height * cam.zoom;

    // Drop shadow under the whole map slab (2.5D floating board)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    const shOff = Math.max(4, 8 * cam.zoom);
    ctx.beginPath();
    // Soft rounded shadow offset SE
    if (typeof (ctx as CanvasRenderingContext2D & { roundRect?: typeof ctx.fillRect }).roundRect === 'function') {
      ctx.roundRect(sx0 + shOff * 0.6, sy0 + shOff, drawW, drawH, Math.max(4, 6 * cam.zoom));
      ctx.fill();
    } else {
      ctx.fillRect(sx0 + shOff * 0.6, sy0 + shOff, drawW, drawH);
    }
    ctx.restore();

    // Chunked terrain — draw only the baked chunks (lazy, viewport-bounded).
    for (const cache of terrainChunkCache.values()) {
      const [chunkSx, chunkSy] = w2s(cache.offsetX, cache.offsetY, cam, cw, ch);
      ctx.drawImage(
        cache.surface as CanvasImageSource,
        chunkSx,
        chunkSy,
        cache.worldWidth * cam.zoom,
        cache.worldHeight * cam.zoom,
      );
    }

    if (terrainDecorCache) {
      ctx.drawImage(
        terrainDecorCache.surface as CanvasImageSource,
        sx0,
        sy0,
        terrainDecorCache.width * cam.zoom,
        terrainDecorCache.height * cam.zoom,
      );
    }

    // Phase D — softer sun wash (textures + season wash carry most of the look)
    ctx.save();
    const sun = ctx.createLinearGradient(sx0, sy0, sx0 + drawW, sy0 + drawH);
    sun.addColorStop(0, 'rgba(255, 250, 230, 0.045)');
    sun.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
    sun.addColorStop(1, 'rgba(10, 20, 40, 0.06)');
    ctx.fillStyle = sun;
    ctx.fillRect(sx0, sy0, drawW, drawH);
    ctx.restore();

    // Map edge — dark outer lip + inner rim light
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(3, 5 * cam.zoom);
    ctx.strokeRect(sx0, sy0, drawW, drawH);
    ctx.strokeStyle = 'rgba(220, 245, 220, 0.16)';
    ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
    ctx.strokeRect(sx0 + 1.5, sy0 + 1.5, drawW - 3, drawH - 3);
    ctx.restore();
  }
}

/**
 * Paint the ground with the canvas2D layer instead of Pixi/WebGL.
 *
 * Owner ruling 2026-09-17: the canvas2D look is the shipping one; the owner has called the Pixi path
 * temporary and it is not in use. This constant is the one line that decides which ground renderer
 * runs, so nothing else in the tree has to guess (`AGENTS.md`, `CHANGELOG.md`).
 *
 * The Pixi path had never actually rendered in a shipped build — its terrain container was never
 * attached to `app.stage`
 * (`BUG_REPORTS/2026-09-17-pixi-terrain-container-never-attached-to-the-stage.md`). That attachment is
 * restored and is exactly why flipping this to `true` is safe: detached, every Pixi frame composited a
 * transparent canvas and the ground layer vanished, which is why this path could not be trusted before.
 * `buildTerrainCache` + `drawProceduralGround` bake the terrain into per-viewport chunks from the fill
 * sprites — the path the boot frame already used, and the look the minimap agrees with.
 *
 * Keeping the constant rather than deleting the call keeps `pixiTerrain.ts` referenced and makes the
 * switch one line; re-enabling it means matching the Pixi water to the tile water first.
 */
const USE_PIXI_GROUND = false;

export function drawGround(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.worldMap) {
    if (USE_PIXI_GROUND && renderPixiTerrain(ctx, state, cw, ch)) return;
    buildTerrainCache(state, cw, ch);
    drawProceduralGround(ctx, state, cw, ch);
    return;
  }
  // Fallback if terrain missing (should not happen in normal play)
  drawSimpleGreenGround(ctx, state, cw, ch);
}
