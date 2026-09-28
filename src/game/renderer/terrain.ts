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
// `WHITTAKER_CHUNK_SIZE` is 256 canvas px and the bake is a fixed 1 canvas px per world px, so a chunk
// covers 256 world px and the whole map is baked once per session, under the per-frame budget below.
const WHITTAKER_CHUNK_SIZE = 256; // canvas px per chunk; the world span is this × the bake step (1)
const WHITTAKER_CHUNK_MARGIN = 1; // keep one chunk of margin around the viewport
/**
 * World px of overhang a chunk's decor canvas carries on every side.
 *
 * A prop's art reaches ~24 world px from its origin (a flower is 18 px tall, a big rock ~13 px across at
 * its largest scale), so a decor canvas that stopped at the chunk edge would slice every prop standing
 * near that edge along a visible grid line. The margin costs ~40 % more decor pixels per chunk and
 * removes the seam entirely: neighbouring canvases overlap, the ground/props in the overlap are the same
 * pixels, and each prop is painted by exactly one chunk (the one holding its origin).
 */
const DECOR_CHUNK_MARGIN = 32;
/**
 * Pixels of new ground one frame may bake.
 *
 * The per-pixel shader measures **1.5–4.6 µs per pixel** on the development machine (a 0.07 Mpx chunk
 * in 100–300 ms), so a frame that bakes a whole 256² chunk (65,536 px) blocks for a tenth to a third of
 * a second, and a fresh view of 20–24 chunks blocked for **3.9–6.0 s** — the stall reported from play
 * as *"the game stalls at 0 fps"*. The budget bounds what one frame spends and the ground fills in over
 * the following frames. An 8,192 px slice is ≈ 12–38 ms, which leaves the rest of the frame its time;
 * a 1.3 Mpx view therefore fills in over ~160 frames instead of freezing for seconds.
 */
const GROUND_BAKE_PIXEL_BUDGET_PER_FRAME = 8192;
export { GROUND_BAKE_PIXEL_BUDGET_PER_FRAME as GROUND_BAKE_PIXEL_BUDGET };
/**
 * How much coarser the stand-in first pass is than the chunk's target step.
 *
 * The budget above spreads the crisp bake over ~160 frames, which is the right shape for the frame but
 * the wrong shape for the eye: without this the player would watch the void for the first seconds of a
 * session or a zoom change. A chunk is therefore covered **first** by one coarse bake at `step × 4`
 * (a 64² canvas instead of 256² for a 256 px chunk — 1/16 the pixels, ~6–19 ms) and that stand-in is
 * drawn at the chunk's own world rect until the crisp rows are all in. The whole view is covered in
 * ~10–12 frames of the budget, then sharpens chunk by chunk from the view centre outward.
 */
const GROUND_PREVIEW_STEP_FACTOR = 4;
/** One baked chunk: the canvas, the world rect it covers, and how much of it is baked yet. */
interface GroundChunk {
  canvas: CanvasSurface;
  /** Coarse stand-in drawn until `canvas` is complete, or null when the target step is already coarse. */
  preview: CanvasSurface | null;
  previewStep: number;
  /** False until the stand-in has been baked once — it is not re-baked while the crisp pass runs. */
  previewReady: boolean;
  /**
   * This chunk's river courses and L3 props, baked once with the chunk.
   *
   * It is a canvas of its own, not part of `canvas`, because the props need an **overhang margin** — the
   * art of a prop reaches ~24 world px either side of its origin, so a canvas that stopped at the chunk
   * edge would slice the props standing near it along a visible grid. `worldX/worldY` of the blit is
   * therefore offset by the same margin (see `DECOR_CHUNK_MARGIN`).
   */
  decor: CanvasSurface | null;
  worldX: number;
  worldY: number;
  /** World px this chunk covers — **not** the canvas size; they differ whenever the bake sub-samples. */
  worldW: number;
  worldH: number;
  /** Canvas rows already baked into `canvas`. The chunk is drawn only once every row is in. */
  rowsBaked: number;
  rowsTotal: number;
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

/**
 * Chunk origins to bake for a viewport, **nearest the view centre first**.
 *
 * The order is what makes a budgeted bake feel right: the ground the player is looking at is baked
 * before the one-chunk margin around it, and the centre of the screen before its edges, so a fill in
 * progress reads as the ground arriving rather than as a ring closing in. The window itself is
 * unchanged from the unbudgeted version it replaces — chunk-aligned, one chunk of margin — so a
 * completed fill is pixel-identical to what this function's predecessor baked in one go.
 */
export function planGroundChunks(
  worldW: number,
  worldH: number,
  chunkWorld: number,
  view: { x: number; y: number; width: number; height: number },
  marginChunks = WHITTAKER_CHUNK_MARGIN,
): { x: number; y: number }[] {
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

  // Per-pixel Whittaker path (Teraforge) — bake only the chunks the camera can see.
  // `terrainGrid.hasContinuousFields` is the owner of "this map carries the L2 fields"; this used to
  // be a second, hand-written copy of the same seven-field test.
  if (hasContinuousFields(map)) {
    // The key carries what the bake **reads**: the map (seed, preset, world dims) and the bake
    // resolution. It deliberately does **not** carry `getTerrainRevision()`. That counter is bumped by
    // `buildingPlacementActions` when a footprint is cleared, but a cleared camp or a chopped forest
    // writes the sparse `overrides` layer and never touches `elevation` / `moisture` / `temperature` /
    // `riverDist` — so the re-bake produced a byte-identical image while freezing every visible chunk on
    // a routine build. `tests/groundLook.bands.test.ts` pins the invariant: an override must not move a
    // single pixel. It also no longer carries the **season**: the ground is not seasonal any more (see
    // `whittakerTerrain`'s header), so a season rollover invalidates nothing and re-bakes nothing.
    // The world dims are in the key because the same seed + preset at a different map size is a
    // different map; if a future edit ever mutates the generated fields, it must add a term here.
    // **One bake resolution, fixed**: 1 canvas px per world px, for the life of the map.
    //
    // The bake used to coarsen with the camera (`groundWorldStepForZoom`): 1:1 above 100 % zoom, 1:2
    // below ~70 %, 1:4 below ~35 %. Because the step is part of the cache key, crossing one of those
    // thresholds **disposed every chunk on screen** and re-baked the whole view — which, once the fill
    // became budgeted, showed the void until the refill caught up: *"zooming in and out gives a black
    // background"*. A fixed step cannot be re-keyed by the camera at all, so zoom never invalidates the
    // ground: chunks are baked once per map and the blit scales them (with smoothing on, a zoomed-out
    // view is a clean downscale of a 1:1 bake — sharper than the coarse bake it replaces). The trade is
    // that a wide view bakes its ground at 1:1 once, under the budget below, instead of re-baking a
    // coarse copy on every zoom step.
    const step = 1;
    const chunkWorld = WHITTAKER_CHUNK_SIZE * step;
    // The two map-wide fields (cast shadow, water proximity) are cell-resolution and depend on neither
    // the viewport nor the bake resolution, so they are keyed on the map alone and shared by every chunk.
    const mapKey = `${map.seed}|${map.preset}|${state.width}x${state.height}`;
    const key = `${mapKey}|s${step}`;
    if (whittakerCacheKey !== key) {
      // A different world or bake resolution: the old surfaces have the wrong geometry, so they go —
      // with their surfaces released — and the budgeted walk below re-fills from nothing.
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
    const keep = new Set<string>();
    let budget = GROUND_BAKE_PIXEL_BUDGET_PER_FRAME;

    const ensureChunk = (origin: { x: number; y: number }): GroundChunk => {
      const chunkKey = `${origin.x},${origin.y}`;
      keep.add(chunkKey);
      const existing = whittakerChunks.get(chunkKey);
      if (existing) return existing;
      const worldW = Math.min(chunkWorld, state.width - origin.x);
      const worldH = Math.min(chunkWorld, state.height - origin.y);
      const rowsTotal = Math.max(1, Math.ceil(worldH / step));
      const previewStep = Math.min(4, step * GROUND_PREVIEW_STEP_FACTOR);
      // The chunk's river courses and L3 props, baked **once here** — never per frame. Only chunks the
      // camera plans (the visible rect plus one chunk of margin) get one, so props off screen cost
      // nothing at all, and each chunk's is baked a single time for the life of the map.
      const decorWorldW = worldW + DECOR_CHUNK_MARGIN * 2;
      const decorWorldH = worldH + DECOR_CHUNK_MARGIN * 2;
      const decor = createCanvasSurface(
        Math.max(1, Math.ceil(decorWorldW / step)),
        Math.max(1, Math.ceil(decorWorldH / step)),
      );
      bakeDecorInRect(
        getCanvasContext(decor) as CanvasRenderingContext2D,
        map,
        { x: origin.x - DECOR_CHUNK_MARGIN, y: origin.y - DECOR_CHUNK_MARGIN, width: decorWorldW, height: decorWorldH },
        1 / step,
      );
      const chunk: GroundChunk = {
        canvas: createCanvasSurface(Math.max(1, Math.ceil(worldW / step)), rowsTotal),
        preview: previewStep > step
          ? createCanvasSurface(Math.max(1, Math.ceil(worldW / previewStep)), Math.max(1, Math.ceil(worldH / previewStep)))
          : null,
        previewStep,
        previewReady: false,
        decor,
        worldX: origin.x,
        worldY: origin.y,
        worldW,
        worldH,
        rowsBaked: 0,
        rowsTotal,
      };
      whittakerChunks.set(chunkKey, chunk);
      return chunk;
    };

    // Pass 1 — cover. Every planned chunk gets its coarse stand-in before any of them is sharpened, so
    // the map is whole early instead of arriving one chunk at a time; the stand-in is 1/16 of the crisp
    // bake, so the whole view costs about one crisp chunk. **The first stand-in of a frame is baked even
    // if it alone exceeds the budget** — covering the view is what keeps the void off the screen, and a
    // starved cover pass is exactly what turned a zoom into a black background. Later ones wait for a
    // frame that can afford them.
    let covered = 0;
    for (const origin of plan) {
      const chunk = ensureChunk(origin);
      if (!chunk.preview || chunk.previewReady) continue;
      const previewPixels = chunk.preview.width * chunk.preview.height;
      if (covered > 0 && budget < previewPixels) break;
      const bakedPreview = bakeWhittakerGround(
        map, state.width, state.height,
        map.seaLevel ?? 0.24, map.moistureBias ?? 0,
        { x: chunk.worldX, y: chunk.worldY, width: chunk.worldW, height: chunk.worldH },
        whittakerFields ?? undefined,
        chunk.previewStep,
      );
      if (!bakedPreview) break; // no continuous fields: the guard above already excluded this
      getCanvasContext(chunk.preview).drawImage(bakedPreview, 0, 0);
      chunk.previewReady = true;
      budget -= previewPixels;
      covered++;
    }

    // Pass 2 — sharpen. Chunks are finished in plan order (view centre outward), each in horizontal
    // bands, so a frame never spends more than its budget on ground. At least one row is always baked
    // when the budget allows any: a budget smaller than a row must still move the fill forward.
    sharpen: for (const origin of plan) {
      const chunk = ensureChunk(origin);
      while (budget > 0 && chunk.rowsBaked < chunk.rowsTotal) {
        const canvasW = Math.max(1, chunk.canvas.width);
        const rows = Math.max(1, Math.min(chunk.rowsTotal - chunk.rowsBaked, Math.floor(budget / canvasW)));
        const bandWorldY = chunk.worldY + chunk.rowsBaked * step;
        const bandWorldH = Math.min(chunk.worldH - chunk.rowsBaked * step, rows * step);
        if (bandWorldH <= 0) {
          chunk.rowsBaked = chunk.rowsTotal;
          break;
        }
        const baked = bakeWhittakerGround(
          map, state.width, state.height,
          map.seaLevel ?? 0.24, map.moistureBias ?? 0,
          { x: chunk.worldX, y: bandWorldY, width: chunk.worldW, height: bandWorldH },
          whittakerFields ?? undefined,
          step,
        );
        // The bake is a pure function of the world coordinate, so a band written at its own row offset is
        // pixel-identical to the whole-chunk bake this replaces — pinned by
        // `tests/groundChunk.bands.test.ts`. A null here means no continuous fields, which the guard
        // above already excluded: stop rather than spin on it every frame.
        if (!baked) break sharpen;
        getCanvasContext(chunk.canvas).drawImage(baked, 0, chunk.rowsBaked);
        chunk.rowsBaked += baked.height;
        budget -= canvasW * baked.height;
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
