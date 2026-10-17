import type { MapPreset, Season, TerrainType } from '../gameTypes';
import { Season as SeasonEnum, TerrainType as TerrainTypeEnum } from '../gameTypes';
import type { RenderSnapshot } from '../renderSnapshot';
import { seasonBlendForDay } from '../simHelpers';
import {
  bakeTerrainLayer,
  disposeTerrainLayer,
  terrainChunkCacheKeyFor,
  type TerrainLayerCache,
} from '../terrainLayer';
import { bakeWhittakerGround, buildWhittakerFields, type WhittakerFields } from './whittakerTerrain';
import { bakeDecorInRect } from './decor';
import { worldToScreen as w2s, screenToWorld } from '../viewState';
import { TERRAIN_PALETTE } from '../terrainAtlas';
import { createCanvasSurface, disposeCanvasSurface, getCanvasContext, type CanvasSurface } from '../canvasLayer';
import { hasContinuousFields } from '../terrain/terrainGrid';

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
const WHITTAKER_CHUNK_SIZE = 256; // world px per chunk; the canvas is this / the chunk's bake step
const WHITTAKER_CHUNK_MARGIN = 1; // keep one chunk of margin around the viewport
const DECOR_CHUNK_MARGIN = 32;
/**
 * Decor canvases one frame may bake — each is (256 + 2×32)² ≈ 102 kpx, twelve times the ground budget.
 */
const DECOR_BAKE_CHUNKS_PER_FRAME = 1;

const GROUND_BAKE_PIXEL_BUDGET_PER_FRAME = 8192;
export { GROUND_BAKE_PIXEL_BUDGET_PER_FRAME as GROUND_BAKE_PIXEL_BUDGET };
const GROUND_PREVIEW_STEP_FACTOR = 4;
const GROUND_REBAKE_CHUNKS_PER_FRAME = 1;
/** World px per canvas px to bake the ground at for a camera zoom: nearest power of two to `1 / zoom`, clamped to 1–4. */
export function targetGroundStep(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(4, Math.max(1, 2 ** Math.round(Math.log2(1 / zoom))));
}
/** One baked chunk: the canvas, the world rect it covers, and how much of it is baked yet. */
interface GroundChunk {
  canvas: CanvasSurface;
  /** Coarse stand-in drawn until `canvas` is complete, or null when the target step is already coarse. */
  preview: CanvasSurface | null;
  previewStep: number;
  /** False until the stand-in has been baked once — it is not re-baked while the crisp pass runs. */
  previewReady: boolean;
  decor: CanvasSurface | null;
  worldX: number;
  worldY: number;
  /** World px this chunk covers — **not** the canvas size; they differ whenever the bake sub-samples. */
  worldW: number;
  worldH: number;
  /** Canvas rows already baked into `canvas`. The chunk is drawn only once every row is in. */
  rowsBaked: number;
  rowsTotal: number;
  /** World px per canvas px `canvas` holds — the target step at its last bake. */
  bakedStep: number;
}
const whittakerChunks = new Map<string, GroundChunk>();
let whittakerCacheKey = '';
let whittakerFieldsKey = '';
let whittakerFields: WhittakerFields | null = null;

/** Release both surfaces a chunk holds. */
function disposeGroundChunk(chunk: GroundChunk): void {
  disposeCanvasSurface(chunk.canvas);
  if (chunk.preview) disposeCanvasSurface(chunk.preview);
  if (chunk.decor) disposeCanvasSurface(chunk.decor);
}


/** Memo for {@link planGroundChunks} — the last viewport's plan, reused while its arguments hold. */
let plannedChunksKey = '';
let plannedChunks: { x: number; y: number }[] = [];

export function planGroundChunks(
  worldW: number,
  worldH: number,
  chunkWorld: number,
  view: { x: number; y: number; width: number; height: number },
  marginChunks = WHITTAKER_CHUNK_MARGIN,
): { x: number; y: number }[] {
  // Callers only iterate the result, so a still camera reuses the plan instead of allocating and
  // sorting a fresh one every frame. Treat the returned array as read-only.
  const planKey = `${worldW}|${worldH}|${chunkWorld}|${view.x}|${view.y}|${view.width}|${view.height}|${marginChunks}`;
  if (planKey === plannedChunksKey) return plannedChunks;
  const margin = chunkWorld * marginChunks;
  const minX = Math.max(0, Math.floor((view.x - margin) / chunkWorld) * chunkWorld);
  const minY = Math.max(0, Math.floor((view.y - margin) / chunkWorld) * chunkWorld);
  const maxX = Math.min(worldW, Math.ceil((view.x + view.width + margin) / chunkWorld) * chunkWorld);
  const maxY = Math.min(worldH, Math.ceil((view.y + view.height + margin) / chunkWorld) * chunkWorld);
  const half = chunkWorld / 2;
  const centreX = view.x + view.width / 2;
  const centreY = view.y + view.height / 2;
  const plan: { x: number; y: number }[] = [];
  for (let x = minX; x < maxX; x += chunkWorld) {
    for (let y = minY; y < maxY; y += chunkWorld) plan.push({ x, y });
  }
  plan.sort((a, b) => {
    const da = (a.x + half - centreX) ** 2 + (a.y + half - centreY) ** 2;
    const db = (b.x + half - centreX) ** 2 + (b.y + half - centreY) ** 2;
    return da - db;
  });
  plannedChunksKey = planKey;
  plannedChunks = plan;
  return plan;
}

/** Release terrain caches. Called by {@link resetRendererCaches}. */
export function resetTerrainCaches(): void {
  for (const cache of terrainChunkCache.values()) disposeTerrainLayer(cache);
  terrainChunkCache.clear();
  terrainChunkCacheKey = '';
  for (const chunk of whittakerChunks.values()) disposeGroundChunk(chunk);
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
  if (hasContinuousFields(map)) {
    const targetStep = targetGroundStep(state.camera.zoom);
    const chunkWorld = WHITTAKER_CHUNK_SIZE;
    const mapKey = `${map.seed}|${map.preset}|${state.width}x${state.height}`;
    const key = mapKey;
    if (whittakerCacheKey !== key) {
      // A different world: the old surfaces have the wrong geometry, so they go — with their surfaces
      // released — and the budgeted walk below re-fills from nothing.
      for (const chunk of whittakerChunks.values()) disposeGroundChunk(chunk);
      whittakerChunks.clear();
      whittakerCacheKey = key;
    }
    if (whittakerFieldsKey !== mapKey) {
      whittakerFields = buildWhittakerFields(map);
      whittakerFieldsKey = mapKey;
    }

    // Visible world rect — the bake window is chunk-aligned with one chunk of margin
    // (`planGroundChunks`, which also orders it nearest-the-centre-first).
    const cam = state.camera;
    const [tlX, tlY] = screenToWorld(0, 0, cam, cw, ch);
    const [brX, brY] = screenToWorld(cw, ch, cam, cw, ch);
    const vx = Math.min(tlX, brX);
    const vy = Math.min(tlY, brY);
    const vw = Math.abs(brX - tlX);
    const vh = Math.abs(brY - tlY);
    const plan = planGroundChunks(state.width, state.height, chunkWorld, { x: vx, y: vy, width: vw, height: vh });
    // Every planned chunk stays cached for this frame, materialised or not, so the prune below only
    // drops what the camera has left behind.
    const keep = new Set<string>();
    for (const origin of plan) keep.add(`${origin.x},${origin.y}`);
    let budget = GROUND_BAKE_PIXEL_BUDGET_PER_FRAME;

    /** What a chunk at `origin` covers — sized without allocating, so a plan entry can be costed first. */
    const chunkGeometry = (origin: { x: number; y: number }) => {
      const worldW = Math.min(chunkWorld, state.width - origin.x);
      const worldH = Math.min(chunkWorld, state.height - origin.y);
      const previewStep = Math.min(4, targetStep * GROUND_PREVIEW_STEP_FACTOR);
      return {
        worldW,
        worldH,
        previewStep,
        rowsTotal: Math.max(1, Math.ceil(worldH / targetStep)),
        previewW: Math.max(1, Math.ceil(worldW / previewStep)),
        previewH: Math.max(1, Math.ceil(worldH / previewStep)),
      };
    };

    const ensureChunk = (origin: { x: number; y: number }): GroundChunk => {
      const chunkKey = `${origin.x},${origin.y}`;
      keep.add(chunkKey);
      const existing = whittakerChunks.get(chunkKey);
      if (existing) return existing;
      const geometry = chunkGeometry(origin);
      const chunk: GroundChunk = {
        canvas: createCanvasSurface(Math.max(1, Math.ceil(geometry.worldW / targetStep)), geometry.rowsTotal),
        preview: geometry.previewStep > targetStep
          ? createCanvasSurface(geometry.previewW, geometry.previewH)
          : null,
        previewStep: geometry.previewStep,
        previewReady: false,
        decor: null,
        worldX: origin.x,
        worldY: origin.y,
        worldW: geometry.worldW,
        worldH: geometry.worldH,
        rowsBaked: 0,
        rowsTotal: geometry.rowsTotal,
        bakedStep: targetStep,
      };
      whittakerChunks.set(chunkKey, chunk);
      return chunk;
    };

    /** Bake one chunk's river courses and L3 props onto the overhanging canvas of its own. */
    const bakeChunkDecor = (chunk: GroundChunk): void => {
      const decorWorldW = chunk.worldW + DECOR_CHUNK_MARGIN * 2;
      const decorWorldH = chunk.worldH + DECOR_CHUNK_MARGIN * 2;
      // Decor is step-independent: baked 1:1 and blitted at its world rect, so a ground re-bake keeps it.
      const decor = createCanvasSurface(
        Math.max(1, Math.ceil(decorWorldW)),
        Math.max(1, Math.ceil(decorWorldH)),
      );
      bakeDecorInRect(
        getCanvasContext(decor) as CanvasRenderingContext2D,
        map,
        { x: chunk.worldX - DECOR_CHUNK_MARGIN, y: chunk.worldY - DECOR_CHUNK_MARGIN, width: decorWorldW, height: decorWorldH },
        1,
      );
      chunk.decor = decor;
    };

    // Pass 0 — props. A chunk's decor canvas is the largest surface it allocates, so one per frame is
    // its whole budget: baking the whole window's prop art here is what made a pan past the margin hitch.
    let decorBaked = 0;
    for (const origin of plan) {
      if (decorBaked >= DECOR_BAKE_CHUNKS_PER_FRAME) break;
      const chunk = whittakerChunks.get(`${origin.x},${origin.y}`) ?? ensureChunk(origin);
      if (chunk.decor) continue;
      bakeChunkDecor(chunk);
      decorBaked++;
    }

    let covered = 0;
    for (const origin of plan) {
      const existing = whittakerChunks.get(`${origin.x},${origin.y}`);
      if (existing && (!existing.preview || existing.previewReady)) continue;
      const geometry = chunkGeometry(origin);
      // A bake step as coarse as the stand-in would be leaves nothing to cover.
      if (geometry.previewStep <= targetStep) continue;
      const previewPixels = geometry.previewW * geometry.previewH;
      if (covered > 0 && budget < previewPixels) break;
      const chunk = existing ?? ensureChunk(origin);
      const preview = chunk.preview;
      if (!preview) continue;
      const bakedPreview = bakeWhittakerGround(
        map, state.width, state.height,
        map.seaLevel ?? 0.24, map.moistureBias ?? 0,
        { x: chunk.worldX, y: chunk.worldY, width: chunk.worldW, height: chunk.worldH },
        whittakerFields ?? undefined,
        chunk.previewStep,
      );
      if (!bakedPreview) break; // no continuous fields: the guard above already excluded this
      getCanvasContext(preview).drawImage(bakedPreview, 0, 0);
      chunk.previewReady = true;
      budget -= previewPixels;
      covered++;
    }


    let rebaked = 0;
    for (const origin of plan) {
      if (rebaked >= GROUND_REBAKE_CHUNKS_PER_FRAME) break;
      const chunk = whittakerChunks.get(`${origin.x},${origin.y}`);
      if (!chunk) continue;
      if (!(chunk.bakedStep * 2 <= targetStep || chunk.bakedStep >= targetStep * 2)) continue;
      if (chunk.rowsBaked > 0) {
        // A canvas with rows already in it can stand in for the chunk; an empty one cannot.
        if (chunk.preview) disposeCanvasSurface(chunk.preview);
        chunk.preview = chunk.canvas;
        chunk.previewReady = true;
      } else {
        disposeCanvasSurface(chunk.canvas);
      }
      const rows = Math.max(1, Math.ceil(chunk.worldH / targetStep));
      chunk.canvas = createCanvasSurface(Math.max(1, Math.ceil(chunk.worldW / targetStep)), rows);
      chunk.rowsTotal = rows;
      chunk.bakedStep = targetStep;
      chunk.rowsBaked = 0;
      rebaked++;
    }

 
    sharpen: for (const origin of plan) {
      if (budget <= 0) break;
      const chunk = ensureChunk(origin);
      const chunkStep = chunk.bakedStep;
      while (budget > 0 && chunk.rowsBaked < chunk.rowsTotal) {
        const canvasW = Math.max(1, chunk.canvas.width);
        const rows = Math.max(1, Math.min(chunk.rowsTotal - chunk.rowsBaked, Math.floor(budget / canvasW)));
        const bandWorldY = chunk.worldY + chunk.rowsBaked * chunkStep;
        const bandWorldH = Math.min(chunk.worldH - chunk.rowsBaked * chunkStep, rows * chunkStep);
        if (bandWorldH <= 0) {
          chunk.rowsBaked = chunk.rowsTotal;
          break;
        }
        const baked = bakeWhittakerGround(
          map, state.width, state.height,
          map.seaLevel ?? 0.24, map.moistureBias ?? 0,
          { x: chunk.worldX, y: bandWorldY, width: chunk.worldW, height: bandWorldH },
          whittakerFields ?? undefined,
          chunkStep,
        );

        if (!baked) break sharpen;
        getCanvasContext(chunk.canvas).drawImage(baked, 0, chunk.rowsBaked);
        chunk.rowsBaked += baked.height;
        budget -= canvasW * baked.height;
      }
      if (chunk.rowsBaked >= chunk.rowsTotal && chunk.preview) {
        // The crisp canvas is whole, so the stand-in it replaced is dead weight.
        disposeCanvasSurface(chunk.preview);
        chunk.preview = null;
      }
      if (budget <= 0) break;
    }

    // Prune chunks that moved out of the viewport + margin, releasing their surfaces.
    for (const [chunkKey, chunk] of [...whittakerChunks]) {
      if (!keep.has(chunkKey)) {
        disposeGroundChunk(chunk);
        whittakerChunks.delete(chunkKey);
      }
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

/** The void wash depends only on the context and the viewport, so it is built once per size. */
let voidGradientCache: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  gradient: CanvasGradient;
} | null = null;

function voidGradient(ctx: CanvasRenderingContext2D, cw: number, ch: number): CanvasGradient {
  const cached = voidGradientCache;
  if (cached && cached.ctx === ctx && cached.width === cw && cached.height === ch) return cached.gradient;
  const gradient = ctx.createRadialGradient(
    cw * 0.5, ch * 0.4, Math.min(cw, ch) * 0.1, cw * 0.5, ch * 0.55, Math.max(cw, ch) * 0.8,
  );
  gradient.addColorStop(0, 'rgba(28, 48, 36, 0.25)');
  gradient.addColorStop(0.45, 'rgba(10, 16, 12, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  voidGradientCache = { ctx, width: cw, height: ch, gradient };
  return gradient;
}

/** The map's diagonal sun wash, rebased on the map's own rect so panning never misses the cache. */
let sunGradientCache: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  gradient: CanvasGradient;
} | null = null;

function sunGradient(ctx: CanvasRenderingContext2D, width: number, height: number): CanvasGradient {
  const cached = sunGradientCache;
  if (cached && cached.ctx === ctx && cached.width === width && cached.height === height) return cached.gradient;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(255, 250, 230, 0.045)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(1, 'rgba(10, 20, 40, 0.06)');
  sunGradientCache = { ctx, width, height, gradient };
  return gradient;
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
  ctx.fillStyle = voidGradient(ctx, cw, ch);
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

    // Ground: the per-pixel Whittaker chunks when present, else the chunked tile bake, then the decor
    // overlay (river stroke, frame and the props baked into it). Both are **continuous art, not sprite
    // sheets**, and both are magnified whenever the camera is above 100 % zoom, so they are blitted with
    // smoothing on — the `imageSmoothingEnabled = false` the frame is set up with is for the entity
    // sprites, and leaving it on for these layers stair-stepped the shader's fine detail and the props.
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (whittakerChunks.size > 0) {
      for (const chunk of whittakerChunks.values()) {
        // A crisp chunk is drawn at full resolution; until it is whole, its coarse stand-in covers the
        // same world rect, so the ground arrives early and sharpens in place. A chunk with neither is
        // simply not drawn yet.
        const source = chunk.rowsBaked >= chunk.rowsTotal
          ? chunk.canvas
          : chunk.previewReady
            ? chunk.preview
            : null;
        if (!source) continue;
        const [chunkSx, chunkSy] = w2s(chunk.worldX, chunk.worldY, cam, cw, ch);
        // Drawn at the WORLD rect it covers (not its canvas size — those differ whenever the bake
        // sub-samples), so chunk seams line up exactly.
        ctx.drawImage(
          source as CanvasImageSource,
          chunkSx,
          chunkSy,
          chunk.worldW * cam.zoom,
          chunk.worldH * cam.zoom,
        );
        // The chunk's rivers and props, blitted over its ground at the same world rect widened by the
        // overhang margin those prop origins were baked against.
        if (chunk.decor) {
          const [decorSx, decorSy] = w2s(
            chunk.worldX - DECOR_CHUNK_MARGIN,
            chunk.worldY - DECOR_CHUNK_MARGIN,
            cam, cw, ch,
          );
          ctx.drawImage(
            chunk.decor as CanvasImageSource,
            decorSx,
            decorSy,
            (chunk.worldW + DECOR_CHUNK_MARGIN * 2) * cam.zoom,
            (chunk.worldH + DECOR_CHUNK_MARGIN * 2) * cam.zoom,
          );
        }
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

    ctx.restore();

    // Phase D — softer sun wash (textures + season wash carry most of the look)
    ctx.save();
    const sun = sunGradient(ctx, drawW, drawH);
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
