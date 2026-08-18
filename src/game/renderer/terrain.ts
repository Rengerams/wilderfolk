import type { MapPreset, Season, TerrainType } from '../gameTypes';
import { Season as SeasonEnum, TerrainType as TerrainTypeEnum } from '../gameTypes';
import type { RenderSnapshot } from '../renderSnapshot';
import { seasonBlendForDay } from '../simHelpers';
import {
  bakeTerrainLayer,
  bakeTerrainDecor,
  disposeTerrainLayer,
  disposeTerrainDecor,
  terrainLayerNeedsRebuild,
  terrainDecorNeedsRebuild,
  type TerrainLayerCache,
  type TerrainDecorCache,
} from '../terrainLayer';
import { worldToScreen as w2s } from '../viewState';

// ============ TERRAIN COLOR PALETTE ============
const TERRAIN_COLORS: Record<TerrainType, number> = {
  [TerrainTypeEnum.DeepWater]:    0x1c3a6e,
  [TerrainTypeEnum.ShallowWater]: 0x2a588c,
  [TerrainTypeEnum.River]:        0x3264a0,
  [TerrainTypeEnum.RiverBank]:    0x52733e,
  [TerrainTypeEnum.Beach]:        0xc2b280,
  [TerrainTypeEnum.Grassland]:    0x5e7a3a,
  [TerrainTypeEnum.Forest]:       0x3a5c2a,
  [TerrainTypeEnum.DarkForest]:   0x223a1c,
  [TerrainTypeEnum.Hills]:        0x76663e,
  [TerrainTypeEnum.Mountains]:    0x524e48,
  [TerrainTypeEnum.Rocky]:        0x625c52,
  [TerrainTypeEnum.Snow]:         0xd2dae1,
};

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

// ============ TERRAIN CACHE (OffscreenCanvas — static ground) ============
let terrainCache: TerrainLayerCache | null = null;
let terrainDecorCache: TerrainDecorCache | null = null;

/** Release terrain caches. Called by {@link resetRendererCaches}. */
export function resetTerrainCaches(): void {
  disposeTerrainLayer(terrainCache);
  terrainCache = null;
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
  const hex = presetHex ?? TERRAIN_COLORS[type] ?? TERRAIN_COLORS[TerrainTypeEnum.Grassland];
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

function buildTerrainCache(state: RenderSnapshot) {
  if (!state.worldMap) return;
  const season = state.season ?? SeasonEnum.Spring;
  // Higher bake resolution when zoomed in close so the ground isn't blocky.
  const lod = state.camera.zoom >= 3 ? 2 : 1;
  // Season transitions fade the palette over a few days instead of snapping.
  const blend = seasonBlendForDay(state.dayInYear ?? 0);
  const blendT = blend ? Math.round(blend.t * 100) : undefined;
  if (terrainLayerNeedsRebuild(terrainCache, state.worldMap, season, state.width, state.height, lod, blendT)) {
    disposeTerrainLayer(terrainCache);
    terrainCache = bakeTerrainLayer(
      state.worldMap,
      state.width,
      state.height,
      season,
      (type, seas, variation, preset) => getTerrainColor(type, variation, preset, seas ?? season),
      lod,
      blend ?? undefined,
    );
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

  if (state.worldMap && terrainCache) {
    const [sx0, sy0] = w2s(0, 0, cam, cw, ch);
    // Draw at WORLD scale — the baked surface may be lod× larger than the world.
    const drawW = terrainCache.worldWidth * cam.zoom;
    const drawH = terrainCache.worldHeight * cam.zoom;

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

    ctx.drawImage(
      terrainCache.surface as CanvasImageSource,
      sx0,
      sy0,
      drawW,
      drawH,
    );

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

export function drawGround(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.worldMap) {
    buildTerrainCache(state);
    drawProceduralGround(ctx, state, cw, ch);
    return;
  }
  // Fallback if terrain missing (should not happen in normal play)
  drawSimpleGreenGround(ctx, state, cw, ch);
}
