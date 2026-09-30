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
import { bakeWhittakerGround, buildWhittakerFields, groundWorldStepForZoom, type WhittakerFields } from './whittakerTerrain';
import { drawDecorProps } from './decor';
import { worldToScreen as w2s, screenToWorld } from '../viewState';
import { TERRAIN_PALETTE } from '../terrainAtlas';

// Terrain base palette lives in the terrain owner (`terrainAtlas.TERRAIN_PALETTE`) so the bake
// and the minimap cannot drift apart — audit D12.

/** Per-preset palette overrides so coastal/arid/harsh maps read differently at a glance. */
const PRESET_TERRAIN_COLORS: Partial<Record<MapPreset, Partial<Record<TerrainType, number>>>> = {
  arabia: {
    [TerrainTypeEnum.Grassland]: 0xb8a068,
    [TerrainTypeEnum.Forest]: 0x8a7a48,
    [TerrainTypeEnum.DarkForest]: 0x6a5a38,
    [TerrainTypeEnum.Hills]: 0xa09060,
    [TerrainTypeEnum.Beach]: 0xd4b878,
    [TerrainTypeEnum.Rocky]: 0x9a9080,
  },
  black_forest: {
    [TerrainTypeEnum.Grassland]: 0x4a6a3a,
    [TerrainTypeEnum.Forest]: 0x2f5a2e,
    [TerrainTypeEnum.DarkForest]: 0x1f4a1e,
  },
  coastal: {
    [TerrainTypeEnum.Grassland]: 0x5a7a48,
    [TerrainTypeEnum.ShallowWater]: 0x2e6a9e,
    [TerrainTypeEnum.DeepWater]: 0x1a4a78,
    [TerrainTypeEnum.Beach]: 0xd8c898,
    [TerrainTypeEnum.RiverBank]: 0x6a8a58,
  },
  islands: {
    [TerrainTypeEnum.Grassland]: 0x4a8a48,
    [TerrainTypeEnum.ShallowWater]: 0x2e7aa8,
    [TerrainTypeEnum.DeepWater]: 0x1a5a88,
    [TerrainTypeEnum.Beach]: 0xd8c898,
  },
  highland: {
    [TerrainTypeEnum.Grassland]: 0x5a6e42,
    [TerrainTypeEnum.Hills]: 0x7a6848,
    [TerrainTypeEnum.Mountains]: 0x5a544e,
    [TerrainTypeEnum.Rocky]: 0x6e6860,
  },
  scandinavia: {
    [TerrainTypeEnum.Grassland]: 0x6a8a72,
    [TerrainTypeEnum.Forest]: 0x4a6a52,
    [TerrainTypeEnum.Hills]: 0x8a8478,
    [TerrainTypeEnum.Snow]: 0xe8eef4,
    [TerrainTypeEnum.Mountains]: 0x6a6660,
  },
  oasis: {
    [TerrainTypeEnum.Grassland]: 0xb8a068,
    [TerrainTypeEnum.Forest]: 0x8a7a48,
    [TerrainTypeEnum.Hills]: 0xa09060,
    [TerrainTypeEnum.Beach]: 0xd4b878,
  },
};

// ============ TERRAIN CACHE (chunked OffscreenCanvas — lazy per-viewport) ============
const TERRAIN_CHUNK_SIZE = 1024; // world px per chunk
const TERRAIN_CHUNK_MARGIN = 1; // keep one chunk of margin around the viewport
const terrainChunkCache = new Map<string, TerrainLayerCache>();
let terrainChunkCacheKey = '';
let terrainDecorCache: TerrainDecorCache | null = null;
// Per-pixel Whittaker ground (Teraforge). Baked **per viewport chunk**, not for the whole map:
// every colour term is a function of the world coordinate, so a chunk bake is pixel-identical to
// the matching crop of a whole-map bake, while the cost of a frame is bounded by what the camera
// can see instead of by map area. The whole-map version measured 5.4 s at 6144×4608, which is what
// blocked the Teraforge spec map sizes.
//
// **256 canvas px, not 1024.** A chunk is baked synchronously the frame it is first needed, so the
// chunk size is the size of the hitch you feel when the camera reveals one: 256² is ~27 ms, 1024² is
// ~0.43 s. It is also the size of the *waste*: the chunk grid is aligned to the chunk size and kept
// one chunk of margin around the viewport, so a large chunk bakes many times the visible area — at
// 1024 px the first frame on a Huge map measured **16.8 Mpx (11.0 s) for a 0.7 Mpx view**, sixteen
// times more ground than the camera could show. At 256 px the same frame is ~3.1 Mpx (~1.4 s).
// `groundWorldStepForZoom` then keeps the *canvas* matched to the screen: at 1:1 world px per canvas
// px the whole map is 1.15 Gpx of work if you let it, and at the 0.5× overview that measured 28.3 Mpx
// (17.4 s) before the step existed.
const WHITTAKER_CHUNK_SIZE = 256; // canvas px per chunk; the world span is this × the world step
const WHITTAKER_CHUNK_MARGIN = 1; // keep one chunk of margin around the viewport
/** One baked chunk: the canvas plus the world rect it covers. */
interface GroundChunk {
  canvas: HTMLCanvasElement;
  worldX: number;
  worldY: number;
  /** World px this chunk covers — **not** the canvas size; they differ whenever the bake sub-samples. */
  worldW: number;
  worldH: number;
}
const whittakerChunks = new Map<string, GroundChunk>();
let whittakerCacheKey = '';
let whittakerFieldsKey = '';
let whittakerFields: WhittakerFields | null = null;

/** Release terrain caches. Called by {@link resetRendererCaches}. */
export function resetTerrainCaches(): void {
  for (const cache of terrainChunkCache.values()) disposeTerrainLayer(cache);
  terrainChunkCache.clear();
  terrainChunkCacheKey = '';
  disposeTerrainDecor(terrainDecorCache);
  terrainDecorCache = null;
  whittakerChunks.clear();
  whittakerCacheKey = '';
  whittakerFields = null;
  whittakerFieldsKey = '';
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
  const map = state.worldMap;

  // Per-pixel Whittaker path (Teraforge) — bake only the chunks the camera can see.
  if (map.elevation && map.moisture && map.temperature && map.terrain && map.riverDist && map.cols && map.rows) {
    const season = state.season ?? SeasonEnum.Spring;
    // The key carries what the bake **reads**: the generated fields, the season, the world rect and
    // the bake resolution. It deliberately does **not** carry `getTerrainRevision()`. That counter is
    // bumped by `buildingPlacementActions` when a footprint is cleared, but a cleared camp or a
    // chopped forest writes the sparse `overrides` layer and never touches `elevation` / `moisture` /
    // `temperature` / `riverDist` — so the re-bake produced a byte-identical image while freezing
    // every visible chunk on a routine build. `tests/groundLook.bands.test.ts` pins the invariant: an
    // override must not move a single pixel.
    // The world dims are in the key because the same seed + preset at a different map size is a
    // different map; if a future edit ever mutates the generated fields, it must add a term here.
    const step = groundWorldStepForZoom(state.camera.zoom);
    const chunkWorld = WHITTAKER_CHUNK_SIZE * step;
    // The two map-wide fields (cast shadow, water proximity) are cell-resolution and depend on
    // neither the viewport, the season nor the bake resolution, so they are keyed on the map alone
    // and shared by every chunk.
    const mapKey = `${map.seed}|${map.preset}|${state.width}x${state.height}`;
    const key = `${mapKey}|${season}|s${step}`;
    if (whittakerCacheKey !== key) {
      whittakerChunks.clear();
      whittakerCacheKey = key;
    }
    if (whittakerFieldsKey !== mapKey) {
      whittakerFields = buildWhittakerFields(map);
      whittakerFieldsKey = mapKey;
    }

    // Visible world rect + margin — only chunks intersecting it are baked.
    const cam = state.camera;
    const [tlX, tlY] = screenToWorld(0, 0, cam, cw, ch);
    const [brX, brY] = screenToWorld(cw, ch, cam, cw, ch);
    const vx = Math.min(tlX, brX);
    const vy = Math.min(tlY, brY);
    const vw = Math.abs(brX - tlX);
    const vh = Math.abs(brY - tlY);
    const margin = chunkWorld * WHITTAKER_CHUNK_MARGIN;
    const minX = Math.max(0, Math.floor((vx - margin) / chunkWorld) * chunkWorld);
    const minY = Math.max(0, Math.floor((vy - margin) / chunkWorld) * chunkWorld);
    const maxX = Math.min(state.width, Math.ceil((vx + vw + margin) / chunkWorld) * chunkWorld);
    const maxY = Math.min(state.height, Math.ceil((vy + vh + margin) / chunkWorld) * chunkWorld);

    const keep = new Set<string>();
    for (let cx = minX; cx < maxX; cx += chunkWorld) {
      for (let cy = minY; cy < maxY; cy += chunkWorld) {
        const chunkKey = `${cx},${cy}`;
        keep.add(chunkKey);
        if (whittakerChunks.has(chunkKey)) continue;
        const worldW = Math.min(chunkWorld, state.width - cx);
        const worldH = Math.min(chunkWorld, state.height - cy);
        const baked = bakeWhittakerGround(
          map, state.width, state.height, season,
          map.seaLevel ?? 0.24, map.moistureBias ?? 0,
          { x: cx, y: cy, width: worldW, height: worldH },
          whittakerFields ?? undefined,
          step,
        );
        if (baked) whittakerChunks.set(chunkKey, { canvas: baked, worldX: cx, worldY: cy, worldW, worldH });
      }
    }
    // Prune chunks that moved out of the viewport + margin.
    for (const chunkKey of [...whittakerChunks.keys()]) {
      if (!keep.has(chunkKey)) whittakerChunks.delete(chunkKey);
    }

    if (terrainDecorNeedsRebuild(terrainDecorCache, map, state.width, state.height)) {
      disposeTerrainDecor(terrainDecorCache);
      terrainDecorCache = bakeTerrainDecor(map, state.width, state.height);
    }
    return;
  }

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
    islands: '#0a1c30',
    arabia: '#2a2218',
    oasis: '#2a2218',
    scandinavia: '#1c2228',
    highland: '#121c18',
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

  if (state.worldMap && (whittakerChunks.size > 0 || terrainChunkCache.size > 0)) {
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

    // Ground: the per-pixel Whittaker chunks when present, else the chunked tile bake.
    if (whittakerChunks.size > 0) {
      for (const chunk of whittakerChunks.values()) {
        const [chunkSx, chunkSy] = w2s(chunk.worldX, chunk.worldY, cam, cw, ch);
        // Drawn at the WORLD rect it covers (not its canvas size — those differ whenever the bake
        // sub-samples), so chunk seams line up exactly.
        ctx.drawImage(
          chunk.canvas as CanvasImageSource,
          chunkSx,
          chunkSy,
          chunk.worldW * cam.zoom,
          chunk.worldH * cam.zoom,
        );
      }
    } else {
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

    // L3 decor (Teraforge biome-density-driven ground props) drawn over the ground.
    drawDecorProps(ctx, state, cw, ch);

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
 * Paint the ground. The canvas2D path is the **only** ground renderer.
 *
 * It bakes the terrain into per-viewport chunks from the fill sprites (`buildTerrainCache`), which is
 * the path the boot frame used and the look the minimap agrees with.
 *
 * The Pixi/WebGL ground that used to sit behind a `USE_PIXI_GROUND` constant is **deleted**, not
 * dormant (owner decision 2026-09-25, reversing "not used at the moment but maybe in future"). It is
 * worth recording why deleting beat keeping the switch: the path had already been abandoned once for
 * a real reason — it drew a bright vector river ribbon over pale tile water with a visible
 * square-tile checkerboard, and the owner marked that wrong — and it carried three separate defect
 * records (a detached `app.stage`, a WebGL init retried every frame, the water mismatch). A dormant
 * renderer that nothing renders, nothing reviews, and only tests assert the *shape* of is not an
 * option; it is maintenance surface with no user, and it kept `pixi.js` in the dependency list.
 */
export function drawGround(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.worldMap) {
    buildTerrainCache(state, cw, ch);
    drawProceduralGround(ctx, state, cw, ch);
    return;
  }
  // Fallback if terrain missing (should not happen in normal play)
  drawSimpleGreenGround(ctx, state, cw, ch);
}
