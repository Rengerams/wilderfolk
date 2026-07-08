import type { Entity, EntityByType } from './gameEngine';
import { worldToScreen as w2s } from './viewState';
import { buildEntityDrawBuckets } from './gameEngine';
import { UNCACHED_RENDER_TICK } from './gameTypes';
import type { RenderSnapshot } from './renderSnapshot';
import { updateRenderSoABuckets, getRenderSoABuckets } from './simBuffers/renderSoAEntities';
import { collectGrassInViewport, viewportFromCamera } from './spatialGrid';
import type { RenderSoABuckets } from './simBuffers/renderSoAEntities';
import { invalidateRenderSoABucketsCache } from './simBuffers/renderSoAEntities';
import { EntityType, BuildingType, Season, WeatherType, SPECIES_CONFIG, BUILDING_CONFIGS, GRID_SIZE, snapToGrid, TerrainType } from './gameEngine';
import { WEATHER_CONFIGS } from './gameTypes';
import { categoryBorderDashForType } from './buildCatalog';
import type { Camera, MapPreset } from './gameTypes';
import {
  getBuildingFootprintForType,
  normalizeBuildingRotation,
  snapBuildingCenter,
  type BuildingRotation,
} from './buildingRotation';
import {
  getNightGlowIntensity,
  NIGHT_HOME_GLOW_TYPES,
  NIGHT_STAFFED_GLOW_TYPES,
} from './juiceEffects';
import { canPlaceBuildingSnapshot, isUnbuildableTerrainType, isWaterTerrainType } from './placementUtils';
import { getSpriteFrame, type SpriteFrame } from './spriteLoader';
import {
  drawPioneerAt, getHumanSpriteMetrics,
  getHumanWalkBob, getHumanWalkFrameIndex, getHumanSpriteFrame,
  HUMAN_WALK_SPEED_THRESHOLD,
  HUMAN_BASE_SPRITES,
  type HumanGender,
} from './humanSprites';
import { ANIMAL_SPRITE_ANCHOR_Y, getAnimalSpriteMetrics } from './entitySprites';
import { getChatBubbleText, resetDialogueSessions, wrapChatLines } from './humanChat';
import { isNightHour, isWorkHour, shouldBeAtHome } from './dayCycle';
import { findNearestStaffedSchool, findStaffedSchools, isChildAtSchool } from './education';
import { isStripBuildType } from './stripBuild';
import {
  drawProceduralStripBuilding,
  drawProceduralWallJunction,
  drawStripJunctionOverlay,
} from './stripRender';
import { detectBuildingJunction } from './stripJunction';
import { drawRenffrOmen } from './renffrStar';
import {
  buildHumanCombatStatusFlags,
  getHumanStatusCombatIconFromFlags,
  isPredatorType,
  type HumanCombatStatusFlags,
} from './combat';
import {
  bakeTerrainLayer,
  bakeTerrainDecor,
  disposeTerrainLayer,
  disposeTerrainDecor,
  terrainLayerNeedsRebuild,
  terrainDecorNeedsRebuild,
  type TerrainLayerCache,
  type TerrainDecorCache,
} from './terrainLayer';
import {
  beginEntityLayerPaint,
  buildEntityLayerKey,
  commitEntityLayerPaint,
  disposeEntityLayerCache,
  entityLayerNeedsRebuild,
  getEntityLayerCache,
  paintEntityLayerTo,
} from './entityLayer';
import type { CanvasContext2d } from './canvasLayer';
const SCENT_DEBUG = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SCENT_DEBUG === '1';

// ============ TERRAIN COLOR PALETTE ============
const TERRAIN_COLORS: Record<TerrainType, number> = {
  [TerrainType.DeepWater]:    0x1c3a6e,
  [TerrainType.ShallowWater]: 0x2a588c,
  [TerrainType.River]:        0x3264a0,
  [TerrainType.RiverBank]:    0x52733e,
  [TerrainType.Beach]:        0xc2b280,
  [TerrainType.Grassland]:    0x5e7a3a,
  [TerrainType.Forest]:       0x3a5c2a,
  [TerrainType.DarkForest]:   0x223a1c,
  [TerrainType.Hills]:        0x76663e,
  [TerrainType.Mountains]:    0x524e48,
  [TerrainType.Rocky]:        0x625c52,
  [TerrainType.Snow]:         0xd2dae1,
};

/** Per-preset palette overrides so coastal/arid/harsh maps read differently at a glance. */
const PRESET_TERRAIN_COLORS: Partial<Record<MapPreset, Partial<Record<TerrainType, number>>>> = {
  verdant: {},
  mountainous: {
    [TerrainType.Grassland]: 0x5a6e42,
    [TerrainType.Hills]: 0x7a6848,
    [TerrainType.Mountains]: 0x5a544e,
    [TerrainType.Rocky]: 0x6e6860,
  },
  coastal: {
    [TerrainType.Grassland]: 0x5a7a48,
    [TerrainType.ShallowWater]: 0x2e6a9e,
    [TerrainType.DeepWater]: 0x1a4a78,
    [TerrainType.Beach]: 0xd8c898,
    [TerrainType.RiverBank]: 0x6a8a58,
  },
  arid: {
    [TerrainType.Grassland]: 0xb8a068,
    [TerrainType.Forest]: 0x8a7a48,
    [TerrainType.DarkForest]: 0x6a5a38,
    [TerrainType.Hills]: 0xa09060,
    [TerrainType.Beach]: 0xd4b878,
    [TerrainType.Rocky]: 0x9a9080,
  },
  harsh: {
    [TerrainType.Grassland]: 0x7a8a72,
    [TerrainType.Forest]: 0x5a6a52,
    [TerrainType.Hills]: 0x8a8478,
    [TerrainType.Snow]: 0xe8eef4,
    [TerrainType.Mountains]: 0x6a6660,
  },
};

// ============ TERRAIN CACHE (OffscreenCanvas — static ground) ============
let terrainCache: TerrainLayerCache | null = null;
let terrainDecorCache: TerrainDecorCache | null = null;

function getTerrainColor(type: TerrainType, variation: number, preset?: MapPreset): string {
  const presetHex = preset ? PRESET_TERRAIN_COLORS[preset]?.[type] : undefined;
  const hex = presetHex ?? TERRAIN_COLORS[type] ?? TERRAIN_COLORS[TerrainType.Grassland];
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const v = (variation - 0.5) * 10;
  return `rgb(${Math.min(255,Math.max(0,r+v))|0},${Math.min(255,Math.max(0,g+v))|0},${Math.min(255,Math.max(0,b+v))|0})`;
}

function buildTerrainCache(state: RenderSnapshot) {
  if (!state.worldMap) return;
  if (terrainLayerNeedsRebuild(terrainCache, state.worldMap, Season.Spring)) {
    disposeTerrainLayer(terrainCache);
    terrainCache = bakeTerrainLayer(
      state.worldMap,
      Season.Spring,
      (type, _season, variation, preset) => getTerrainColor(type, variation, preset),
    );
  }
  if (terrainDecorNeedsRebuild(terrainDecorCache, state.worldMap, state.width, state.height)) {
    disposeTerrainDecor(terrainDecorCache);
    terrainDecorCache = bakeTerrainDecor(state.worldMap, state.width, state.height);
  }
}

// ============ CACHED SORTED ENTITY LISTS ============
/** Viewport cache key precision — sub-pixel camera drift should not invalidate grass. */
const GRASS_VIEWPORT_KEY_XY_DIGITS = 1;
const GRASS_VIEWPORT_KEY_ZOOM_DIGITS = 3;
const ENTITY_VIEWPORT_KEY_XY_DIGITS = 1;
const ENTITY_VIEWPORT_KEY_ZOOM_DIGITS = 3;

let _cachedEntityTick = UNCACHED_RENDER_TICK;
let _cachedEntityViewportKey = '';
let _cachedGrassKey = '';
let _tickTrees: Entity[] = [];
let _tickAnimals: Entity[] = [];
let _tickHumans: Entity[] = [];
let _cachedTrees: Entity[] = [];
let _cachedAnimals: Entity[] = [];
let _cachedHumans: Entity[] = [];
let _cachedGrass: Entity[] = [];
let _renderSoABuckets: RenderSoABuckets | null = null;

function grassViewportKey(
  tick: number,
  cam: Camera,
  cw: number,
  ch: number,
): string {
  return `${tick}|${cam.x.toFixed(GRASS_VIEWPORT_KEY_XY_DIGITS)}|${cam.y.toFixed(GRASS_VIEWPORT_KEY_XY_DIGITS)}|${cam.zoom.toFixed(GRASS_VIEWPORT_KEY_ZOOM_DIGITS)}|${cw}|${ch}`;
}

function entityViewportKey(
  tick: number,
  cam: Camera,
  cw: number,
  ch: number,
): string {
  return `${tick}|${cam.x.toFixed(ENTITY_VIEWPORT_KEY_XY_DIGITS)}|${cam.y.toFixed(ENTITY_VIEWPORT_KEY_XY_DIGITS)}|${cam.zoom.toFixed(ENTITY_VIEWPORT_KEY_ZOOM_DIGITS)}|${cw}|${ch}`;
}

function syncDrawCacheTick(tick: number): boolean {
  if (tick === _cachedEntityTick) return false;
  _cachedEntityTick = tick;
  _cachedGrassKey = '';
  _cachedEntityViewportKey = '';
  return true;
}

function entityInViewport(entity: Entity, cam: Camera, cw: number, ch: number, pad = 72): boolean {
  const vp = viewportFromCamera(cam.x, cam.y, cam.zoom, cw, ch, pad);
  return entity.x >= vp.minX && entity.x <= vp.maxX && entity.y >= vp.minY && entity.y <= vp.maxY;
}

function filterEntitiesInViewport(entities: Entity[], cam: Camera, cw: number, ch: number): Entity[] {
  return entities.filter((entity) => entityInViewport(entity, cam, cw, ch));
}

function syncGrassDrawCache(
  tick: number,
  cam: Camera,
  cw: number,
  ch: number,
  collectVisibleGrass: () => Entity[],
): void {
  const grassKey = grassViewportKey(tick, cam, cw, ch);
  if (grassKey === _cachedGrassKey) return;
  _cachedGrassKey = grassKey;
  _cachedGrass = collectVisibleGrass();
}

function entitiesFromSoASlots(slots: number[], shimBySlot: Map<number, Entity>): Entity[] {
  const entities: Entity[] = [];
  for (const slot of slots) {
    const entity = shimBySlot.get(slot);
    if (entity) entities.push(entity);
  }
  return entities;
}

function syncEntityDrawViewport(
  tick: number,
  cam: Camera,
  cw: number,
  ch: number,
): void {
  const viewportKey = entityViewportKey(tick, cam, cw, ch);
  if (viewportKey === _cachedEntityViewportKey) return;
  _cachedEntityViewportKey = viewportKey;
  _cachedTrees = filterEntitiesInViewport(_tickTrees, cam, cw, ch);
  _cachedAnimals = filterEntitiesInViewport(_tickAnimals, cam, cw, ch);
  _cachedHumans = filterEntitiesInViewport(_tickHumans, cam, cw, ch);
}

function updateCachedEntities(
  byType: EntityByType,
  grassGrid: RenderSnapshot['grassGrid'],
  tick: number,
  cam: Camera,
  mapW: number,
  mapH: number,
  cw: number,
  ch: number,
) {
  const tickChanged = syncDrawCacheTick(tick);
  if (tickChanged) {
    const buckets = buildEntityDrawBuckets(byType);
    _tickTrees = buckets.trees;
    _tickAnimals = buckets.animals;
    _tickHumans = buckets.humans;
    _renderSoABuckets = null;
  }
  syncEntityDrawViewport(tick, cam, cw, ch);

  syncGrassDrawCache(tick, cam, cw, ch, () =>
    collectGrassInViewport(
      grassGrid,
      byType[EntityType.Grass],
      mapW,
      mapH,
      cam.x,
      cam.y,
      cam.zoom,
      cw,
      ch,
    ),
  );
}

/** Phase B — bucket render SoA slots into draw lists (no Entity[] hydration on main). */
function updateCachedEntitiesFromSoA(state: RenderSnapshot, cw: number, ch: number) {
  if (!state.renderSoA) return;
  const tickChanged = syncDrawCacheTick(state.tick);
  if (tickChanged) {
    _renderSoABuckets = updateRenderSoABuckets(
      state.renderSoA,
      state.renderMetaBySlot ?? undefined,
      state.tick,
    );
    _tickTrees = entitiesFromSoASlots(_renderSoABuckets.treeSlots, _renderSoABuckets.shimBySlot);
    _tickAnimals = entitiesFromSoASlots(_renderSoABuckets.animalSlots, _renderSoABuckets.shimBySlot);
    _tickHumans = entitiesFromSoASlots(_renderSoABuckets.humanSlots, _renderSoABuckets.shimBySlot);
  } else if (!_renderSoABuckets) {
    _renderSoABuckets = updateRenderSoABuckets(
      state.renderSoA,
      state.renderMetaBySlot ?? undefined,
      state.tick,
    );
  }
  syncEntityDrawViewport(state.tick, state.camera, cw, ch);

  syncGrassDrawCache(state.tick, state.camera, cw, ch, () =>
    collectGrassInViewport(
      state.grassGrid,
      [],
      state.width,
      state.height,
      state.camera.x,
      state.camera.y,
      state.camera.zoom,
      cw,
      ch,
    ),
  );
}

// ============ CACHED NAME WIDTHS ============
const _nameWidthCache = new Map<string, number>();
const NAME_WIDTH_CACHE_MAX = 512;

function getCachedNameWidth(
  ctx: CanvasRenderingContext2D,
  fullName: string,
  fontSize: number,
  zoom: number,
): number {
  const key = `${fontSize.toFixed(2)}|${zoom.toFixed(3)}|${fullName}`;
  let tw = _nameWidthCache.get(key);
  if (tw == null) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    tw = ctx.measureText(fullName).width;
    if (_nameWidthCache.size >= NAME_WIDTH_CACHE_MAX) {
      const oldest = _nameWidthCache.keys().next().value;
      if (oldest != null) _nameWidthCache.delete(oldest);
    }
    _nameWidthCache.set(key, tw);
  }
  return tw;
}

// ============ HELPERS ============
let _time = 0;
let _lastRenderTime = 0;

function isDrawableSpriteFrame(frame: SpriteFrame | null | undefined): frame is SpriteFrame {
  return !!frame?.image;
}

interface SpriteMotion {
  bobY?: number;
  scaleX?: number;
  scaleY?: number;
}

function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
  anchorX = 0.5,
  anchorY = 0.85,
  flipX = false,
  motion: SpriteMotion = {},
  fit: 'contain' | 'height' = 'contain',
  rotationDeg: 0 | 90 = 0,
) {
  const fitMaxW = rotationDeg === 90 ? maxH : maxW;
  const fitMaxH = rotationDeg === 90 ? maxW : maxH;
  const aspect = frame.sw / frame.sh;
  let dw = fitMaxW;
  let dh = fitMaxH;
  if (fit === 'height') {
    dh = fitMaxH;
    dw = dh * aspect;
    if (dw > fitMaxW) {
      dw = fitMaxW;
      dh = dw / aspect;
    }
  } else if (dw / dh > aspect) {
    dw = dh * aspect;
  } else {
    dh = dw / aspect;
  }

  const scaleX = motion.scaleX ?? 1;
  const scaleY = motion.scaleY ?? 1;
  dw = Math.max(1, Math.round(dw * scaleX));
  dh = Math.max(1, Math.round(dh * scaleY));
  const bobY = motion.bobY ?? 0;

  ctx.save();
  if (flipX) {
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
  }
  if (rotationDeg === 90) {
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(
      frame.image, frame.sx, frame.sy, frame.sw, frame.sh,
      Math.round(-dw * anchorX),
      Math.round(-dh * anchorY - bobY),
      dw, dh,
    );
  } else {
    const dx = Math.round(cx - dw * anchorX);
    const dy = Math.round(cy - dh * anchorY - bobY);
    ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
  }
  ctx.restore();
}

function getHumanWalkMotion(human: Entity, camZoom: number, hasWalkFrame: boolean, walkFrame: number): SpriteMotion {
  const speed = Math.hypot(human.vx, human.vy);
  if (speed < 0.08) return {};
  if (hasWalkFrame) {
    return { bobY: getHumanWalkBob(walkFrame, speed, camZoom) };
  }
  const stride = Math.min(1, speed / 1.4);
  const phase = (human.animFrame ?? 0) * 1.9 + human.id * 0.15;
  return { bobY: Math.abs(Math.sin(phase)) * stride * 2.8 * camZoom };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ============ COLOR UTILITIES ============
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function darkerColor(hex: string, factor = 0.35): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

const DEFAULT_SPRITE_DISPLAY_SCALE = 1.15;

const ISO_PANEL_BUILDINGS = new Set<BuildingType>([
  BuildingType.Wall,
  BuildingType.WallCorner,
  BuildingType.WallGate,
]);

function getBuildingSpriteDrawBounds(
  type: BuildingType,
  w: number,
  h: number,
  spriteScale: number,
  displayScale = DEFAULT_SPRITE_DISPLAY_SCALE,
): { drawW: number; drawH: number; anchorY: number } {
  const sc = Math.max(0.1, spriteScale);
  if (type === BuildingType.Road) {
    return { drawW: w * sc, drawH: h * sc, anchorY: 0.55 };
  }
  if (ISO_PANEL_BUILDINGS.has(type)) {
    const base = Math.max(w, h) * sc * displayScale;
    return { drawW: base, drawH: base, anchorY: 0.88 };
  }
  return {
    drawW: w * sc * displayScale,
    drawH: h * sc * displayScale,
    anchorY: 0.92,
  };
}

function drawBuildingSprite(
  ctx: CanvasRenderingContext2D,
  type: BuildingType,
  frame: SpriteFrame,
  sx: number,
  sy: number,
  w: number,
  h: number,
  spriteScale: number,
  rotation: BuildingRotation,
  displayScale = DEFAULT_SPRITE_DISPLAY_SCALE,
) {
  const { drawW, drawH, anchorY } = getBuildingSpriteDrawBounds(type, w, h, spriteScale, displayScale);
  drawSpriteFrame(ctx, frame, sx, sy, drawW, drawH, 0.5, anchorY, false, {}, 'contain', rotation);
}

function drawBuildingPad(
  ctx: CanvasRenderingContext2D,
  shape: 'round' | 'rect' | 'circle' | 'road',
  x: number, y: number, w: number, h: number,
  fillColor: string, borderColor: string, alpha: number,
  dash: number[], lineWidth: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillColor;

  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'road') {
    if (w >= h) {
      const padH = Math.max(4, h * 1.4);
      ctx.fillRect(x - w / 2, y - padH / 2, w, padH);
    } else {
      const padW = Math.max(4, w * 1.4);
      ctx.fillRect(x - padW / 2, y - h / 2, padW, h);
    }
  } else if (shape === 'rect') {
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
  } else {
    const r = Math.min(w, h) * 0.18;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, r);
    ctx.fill();
  }

  // Border (colorblind-friendly secondary cue)
  ctx.globalAlpha = Math.min(1, alpha + 0.25);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);

  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === 'road') {
    if (w >= h) {
      const padH = Math.max(4, h * 1.4);
      ctx.strokeRect(x - w / 2, y - padH / 2, w, padH);
    } else {
      const padW = Math.max(4, w * 1.4);
      ctx.strokeRect(x - padW / 2, y - h / 2, padW, h);
    }
  } else if (shape === 'rect') {
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  } else {
    const r = Math.min(w, h) * 0.18;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, r);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// ============ GROUND ============
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
    coastal: '#0f2840',
    arid: '#3a3020',
    harsh: '#2a3238',
    mountainous: '#1a2420',
  };
  ctx.fillStyle = (presetVoid && voidColors[presetVoid]) || '#1a2e1a';
  ctx.fillRect(0, 0, cw, ch);

  if (state.worldMap && terrainCache) {
    const [sx0, sy0] = w2s(0, 0, cam, cw, ch);
    const drawTileSize = 10 * cam.zoom;
    ctx.drawImage(
      terrainCache.surface as CanvasImageSource,
      sx0,
      sy0,
      terrainCache.width * drawTileSize,
      terrainCache.height * drawTileSize,
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
  }

}

function drawGround(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.worldMap) {
    buildTerrainCache(state);
    drawProceduralGround(ctx, state, cw, ch);
    return;
  }
  // Fallback if terrain missing (should not happen in normal play)
  drawSimpleGreenGround(ctx, state, cw, ch);
}

// ============ GRID ============
const GRID_MAJOR_EVERY = 5;

interface GridViewport {
  sx0: number;
  ex: number;
  sy0: number;
  ey: number;
  mx0: number;
  my0: number;
  majorEx: number;
  majorEy: number;
}

function getGridViewport(cam: RenderSnapshot['camera'], cw: number, ch: number): GridViewport {
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const wl = cam.x - (cw / 2) / cam.zoom;
  const wr = cam.x + (cw / 2) / cam.zoom;
  const wt = cam.y - (ch / 2) / cam.zoom;
  const wb = cam.y + (ch / 2) / cam.zoom;
  const sx0 = Math.floor(wl / gs) * gs;
  const sy0 = Math.floor(wt / gs) * gs;
  const mx0 = Math.floor(wl / majorGs) * majorGs;
  const my0 = Math.floor(wt / majorGs) * majorGs;
  return {
    sx0,
    ex: Math.ceil((wr - sx0) / gs) * gs + sx0,
    sy0,
    ey: Math.ceil((wb - sy0) / gs) * gs + sy0,
    mx0,
    my0,
    majorEx: Math.ceil((wr - mx0) / majorGs) * majorGs + mx0,
    majorEy: Math.ceil((wb - my0) / majorGs) * majorGs + my0,
  };
}

function worldToScreenX(wx: number, cam: RenderSnapshot['camera'], cw: number): number {
  return (wx - cam.x) * cam.zoom + cw / 2;
}

function worldToScreenY(wy: number, cam: RenderSnapshot['camera'], ch: number): number {
  return (wy - cam.y) * cam.zoom + ch / 2;
}

function strokeGridLines(
  ctx: CanvasRenderingContext2D,
  vp: GridViewport,
  cam: RenderSnapshot['camera'],
  cw: number,
  ch: number,
  step: number,
  skipMajor: boolean,
  color: string,
  shadowColor: string,
  lineWidth: number,
) {
  const gs = GRID_SIZE;
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = lineWidth + 0.8;
  ctx.beginPath();
  for (let x = vp.sx0; x <= vp.ex; x += step) {
    if (skipMajor && Math.round(x / gs) % GRID_MAJOR_EVERY === 0) continue;
    const px = worldToScreenX(x, cam, cw) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, ch);
  }
  for (let y = vp.sy0; y <= vp.ey; y += step) {
    if (skipMajor && Math.round(y / gs) % GRID_MAJOR_EVERY === 0) continue;
    const py = worldToScreenY(y, cam, ch) + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(cw, py);
  }
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let x = vp.sx0; x <= vp.ex; x += step) {
    if (skipMajor && Math.round(x / gs) % GRID_MAJOR_EVERY === 0) continue;
    const px = worldToScreenX(x, cam, cw);
    ctx.moveTo(px, 0);
    ctx.lineTo(px, ch);
  }
  for (let y = vp.sy0; y <= vp.ey; y += step) {
    if (skipMajor && Math.round(y / gs) % GRID_MAJOR_EVERY === 0) continue;
    const py = worldToScreenY(y, cam, ch);
    ctx.moveTo(0, py);
    ctx.lineTo(cw, py);
  }
  ctx.stroke();
}

/** Terrain blockers + valid snap points while placing a building. */
function drawBuildZoneOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.buildMode || !state.worldMap) return;
  const cam = state.camera;
  const map = state.worldMap;
  const wl = cam.x - (cw / 2) / cam.zoom;
  const wr = cam.x + (cw / 2) / cam.zoom;
  const wt = cam.y - (ch / 2) / cam.zoom;
  const wb = cam.y + (ch / 2) / cam.zoom;

  const startTx = Math.max(0, Math.floor(wl / 10));
  const endTx = Math.min(map.width - 1, Math.ceil(wr / 10));
  const startTy = Math.max(0, Math.floor(wt / 10));
  const endTy = Math.min(map.height - 1, Math.ceil(wb / 10));

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile || !isUnbuildableTerrainType(tile.type)) continue;
      // Water is visible on terrain tiles — only highlight less obvious blockers.
      if (isWaterTerrainType(tile.type)) continue;
      const wx = tx * 10 + 5;
      const wy = ty * 10 + 5;
      const px = worldToScreenX(wx, cam, cw) - 5 * cam.zoom;
      const py = worldToScreenY(wy, cam, ch) - 5 * cam.zoom;
      const psz = 10 * cam.zoom;
      ctx.fillStyle = 'rgba(220, 38, 38, 0.28)';
      ctx.fillRect(px, py, psz, psz);
    }
  }

  if (cam.zoom < 0.35) return;

  const gs = GRID_SIZE;
  const step = cam.zoom < 0.7 ? gs * 2 : gs;
  const startX = Math.floor(wl / step) * step;
  const endX = Math.ceil(wr / step) * step;
  const startY = Math.floor(wt / step) * step;
  const endY = Math.ceil(wb / step) * step;
  const placeType = state.buildMode;

  for (let wx = startX; wx <= endX; wx += step) {
    for (let wy = startY; wy <= endY; wy += step) {
      const { x: snapX, y: snapY } = snapBuildingCenter(placeType, wx, wy, state.buildRotation);
      const valid = canPlaceBuildingSnapshot(state, placeType, snapX, snapY, state.buildRotation);
      const [px, py] = w2s(snapX, snapY, cam, cw, ch);
      const r = Math.max(2.5, 3.5 * cam.zoom);
      ctx.fillStyle = valid ? 'rgba(34, 197, 94, 0.75)' : 'rgba(248, 113, 113, 0.45)';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.showGrid || !state.buildMode) return;
  const cam = state.camera;
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const vp = getGridViewport(cam, cw, ch);

  // Validity checker on coarse cells while placing buildings
  if (cam.zoom >= 0.3 && state.buildMode) {
    for (let wx = vp.mx0; wx <= vp.majorEx; wx += majorGs) {
      for (let wy = vp.my0; wy <= vp.majorEy; wy += majorGs) {
        const rawX = wx + majorGs / 2;
        const rawY = wy + majorGs / 2;
        const { x: cx, y: cy } = state.buildMode
          ? snapBuildingCenter(state.buildMode, rawX, rawY, state.buildRotation)
          : { x: snapToGrid(rawX, gs), y: snapToGrid(rawY, gs) };
        const px = worldToScreenX(wx, cam, cw);
        const py = worldToScreenY(wy, cam, ch);
        const psz = majorGs * cam.zoom;
        if (px + psz < 0 || px > cw || py + psz < 0 || py > ch) continue;
        const valid = canPlaceBuildingSnapshot(state, state.buildMode, cx, cy, state.buildRotation);
        ctx.fillStyle = valid ? 'rgba(16, 185, 129, 0.14)' : 'rgba(127, 29, 29, 0.18)';
        ctx.fillRect(px, py, psz, psz);
      }
    }
  }

  // Cell size hint when zoomed in during build
  if (cam.zoom >= 0.75) {
    ctx.font = `bold ${Math.max(8, Math.round(9 * cam.zoom))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(6, 78, 59, 0.85)';
    const label = `${majorGs}u`;
    const lx = worldToScreenX(vp.mx0 + majorGs * 0.5, cam, cw);
    const ly = worldToScreenY(vp.my0 + majorGs * 0.5, cam, ch);
    if (lx > 20 && lx < cw - 20 && ly > 14 && ly < ch - 14) {
      ctx.fillText(label, lx, ly);
    }
  }

  // Enclosed area hint while drawing walls
  if (state.buildStripPreview?.enclosedAreas?.length) {
    for (const area of state.buildStripPreview.enclosedAreas) {
      const [ax, ay] = w2s(area.x, area.y, cam, cw, ch);
      const aw = area.w * cam.zoom;
      const ah = area.h * cam.zoom;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
      ctx.lineWidth = Math.max(1, 1.5 / cam.zoom);
      ctx.setLineDash([6 / cam.zoom, 4 / cam.zoom]);
      ctx.fillRect(ax, ay, aw, ah);
      ctx.strokeRect(ax, ay, aw, ah);
      ctx.setLineDash([]);
    }
  }

  // Strip drag preview (walls / roads)
  if (state.buildMode && state.buildStripPreview && isStripBuildType(state.buildMode)) {
    for (const seg of state.buildStripPreview.segments) {
      const placeType = seg.placeType ?? state.buildMode;
      const segRot = seg.rotation ?? state.buildStripPreview.rotation;
      const footprint = getBuildingFootprintForType(placeType, segRot);
      const [gx, gy] = w2s(seg.x, seg.y, cam, cw, ch);
      const bw = footprint.width * cam.zoom;
      const bh = footprint.height * cam.zoom;
      const alpha = seg.valid ? 0.72 : 0.45;
      if (
        placeType === BuildingType.WallCorner
        && seg.junctionInfo
        && (seg.junctionInfo.kind === 'tee' || seg.junctionInfo.kind === 'cross')
      ) {
        drawProceduralWallJunction(ctx, gx, gy, bw, bh, seg.junctionInfo, alpha);
      } else {
        drawProceduralStripBuilding(ctx, placeType, gx, gy, bw, bh, segRot, alpha);
        if (seg.junctionInfo) {
          drawStripJunctionOverlay(ctx, placeType, gx, gy, bw, bh, seg.junctionInfo, alpha);
        }
      }
      ctx.strokeStyle = seg.valid ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = Math.max(1.2, 1.8 / cam.zoom);
      ctx.setLineDash(seg.valid ? [] : [4, 3]);
      ctx.strokeRect(gx - bw / 2, gy - bh / 2, bw, bh);
      ctx.setLineDash([]);
    }
  }

  // Build ghost — full building footprint
  if (state.buildMode && state.buildGhost && !(state.buildStripPreview && isStripBuildType(state.buildMode))) {
    const footprint = getBuildingFootprintForType(state.buildMode, state.buildRotation);
    const [gx, gy] = w2s(state.buildGhost.x, state.buildGhost.y, cam, cw, ch);
    const bw = footprint.width * cam.zoom;
    const bh = footprint.height * cam.zoom;
    const valid = state.buildGhost.valid;
    const x0 = gx - bw / 2;
    const y0 = gy - bh / 2;

    ctx.fillStyle = valid ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    ctx.fillRect(x0, y0, bw, bh);

    ctx.setLineDash([Math.max(4, 6 / cam.zoom), Math.max(3, 4 / cam.zoom)]);
    ctx.strokeStyle = valid ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)';
    ctx.lineWidth = Math.max(1.5, 2.2 / cam.zoom);
    ctx.strokeRect(x0, y0, bw, bh);
    ctx.setLineDash([]);

    // Inner cell lines for large footprints
    if (cam.zoom >= 0.5 && bw > gs * cam.zoom * 1.5) {
      ctx.strokeStyle = valid ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const left = state.buildGhost.x - footprint.width / 2;
      const right = state.buildGhost.x + footprint.width / 2;
      const top = state.buildGhost.y - footprint.height / 2;
      const bottom = state.buildGhost.y + footprint.height / 2;
      for (let wx = Math.ceil(left / gs) * gs; wx < right; wx += gs) {
        const px = (wx - cam.x) * cam.zoom + cw / 2;
        ctx.moveTo(px, y0);
        ctx.lineTo(px, y0 + bh);
      }
      for (let wy = Math.ceil(top / gs) * gs; wy < bottom; wy += gs) {
        const py = (wy - cam.y) * cam.zoom + ch / 2;
        ctx.moveTo(x0, py);
        ctx.lineTo(x0 + bw, py);
      }
      ctx.stroke();
    }

    // Snap anchor
    ctx.fillStyle = valid ? '#4ade80' : '#f87171';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(1, 1.2 / cam.zoom);
    ctx.beginPath();
    ctx.arc(gx, gy, Math.max(3, 4.5 * cam.zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** Placement grid on top of sprites — major lines only during play; full grid in build mode. */
function drawGridTopOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.showGrid) return;

  const cam = state.camera;
  const inBuildMode = !!state.buildMode;
  const vp = getGridViewport(cam, cw, ch);
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const isNight = isNightHour(state.hourOfDay);

  if (inBuildMode) {
    const minorW = Math.max(0.9, 1.2 / cam.zoom);
    const majorW = Math.max(1.2, 2 / cam.zoom);
    strokeGridLines(ctx, vp, cam, cw, ch, gs, true, 'rgba(110, 231, 183, 0.55)', 'rgba(0,0,0,0.35)', minorW);
    strokeGridLines(ctx, vp, cam, cw, ch, majorGs, false, 'rgba(52, 211, 153, 0.85)', 'rgba(0,0,0,0.45)', majorW);
    if (cam.zoom >= 0.4) {
      const dotR = Math.max(2, 2.5 * cam.zoom);
      ctx.save();
      ctx.fillStyle = 'rgba(167, 243, 208, 0.9)';
      for (let x = vp.mx0; x <= vp.majorEx; x += majorGs) {
        for (let y = vp.my0; y <= vp.majorEy; y += majorGs) {
          const px = worldToScreenX(x, cam, cw);
          const py = worldToScreenY(y, cam, ch);
          if (px < -8 || px > cw + 8 || py < -8 || py > ch + 8) continue;
          ctx.beginPath();
          ctx.arc(px, py, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    return;
  }

  // Normal play: one clean major grid (every 5 cells) — no minor lines, dots, or checker
  const majorW = Math.max(1, 1.4 / cam.zoom);
  const lineColor = isNight
    ? 'rgba(226, 232, 240, 0.4)'
    : 'rgba(31, 56, 28, 0.28)';
  strokeGridLines(ctx, vp, cam, cw, ch, majorGs, false, lineColor, 'rgba(0,0,0,0)', majorW);
}

// ============ GRASS (BATCHED, NO SPRITES, NO SHADOWS) ============
function drawGrass(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  // Batch all grass into a single path for much faster rendering
  ctx.save();
  ctx.fillStyle = '#22c55e';
  ctx.globalAlpha = 0.16;

  let drawn = 0;
  for (const grass of _cachedGrass) {
    const sx = (grass.x - cam.x) * cam.zoom + cw / 2;
    const sy = (grass.y - cam.y) * cam.zoom + ch / 2;
    const size = grass.size * 1.0 * cam.zoom;
    // Fast culling without function call
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;
    // Only draw every other grass at low zoom
    if (cam.zoom < 0.8 && drawn % 2 !== 0) { drawn++; continue; }
    const r = size * 0.3;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    drawn++;
  }
  ctx.restore();
}

// ============ TREES (CULLED) ============
function drawTrees(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  for (const tree of _cachedTrees) {
    const sx = (tree.x - cam.x) * cam.zoom + cw / 2;
    const sy = (tree.y - cam.y) * cam.zoom + ch / 2;
    const size = tree.size * 2.4 * cam.zoom;
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;

    // Shadow - simple dark circle, no save/restore
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + size * 0.3, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    const treeFrame = getSpriteFrame('/sprites/tree.png');
    if (treeFrame) {
      drawSpriteFrame(ctx, treeFrame, sx, sy, size * 2, size * 2.2, 0.5, 0.92);
    } else {
      ctx.fillStyle = '#228B22';
      ctx.beginPath();
      ctx.arc(sx, sy, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ============ BUILDINGS (CULLED) ============
function drawBuildings(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;

  function getBuildingScreenRect(b: typeof state.buildings[0]) {
    const sx = (b.x - cam.x) * cam.zoom + cw / 2;
    const sy = (b.y - cam.y) * cam.zoom + ch / 2;
    const w = b.width * cam.zoom;
    const h = b.height * cam.zoom;
    return { sx, sy, w, h };
  }

  const isHovered = (b: typeof state.buildings[0]) => state.hoveredBuilding?.id === b.id;

  // Roads first
  for (const b of state.buildings) {
    if (b.type !== BuildingType.Road || !b.completed) continue;
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;
    const hover = isHovered(b);
    const rot = normalizeBuildingRotation(b.rotation);
    drawProceduralStripBuilding(ctx, b.type, sx, sy, w, h, rot, hover ? 1 : 0.92);
    const roadJunction = detectBuildingJunction(state.buildings, b, 'road');
    if (roadJunction.kind !== 'end' && roadJunction.kind !== 'straight') {
      drawStripJunctionOverlay(ctx, b.type, sx, sy, w, h, roadJunction, hover ? 1 : 0.92);
    }
  }

  // Palisade walls, corners & gates (procedural — chains read clearly on the map)
  for (const b of state.buildings) {
    if (!ISO_PANEL_BUILDINGS.has(b.type) || !b.completed) continue;
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;
    const rot = b.type === BuildingType.WallCorner
      ? (b.rotation ?? 0)
      : normalizeBuildingRotation(b.rotation);
    const hover = isHovered(b);
    const alpha = hover ? 1 : 0.94;
    if (b.type === BuildingType.WallCorner) {
      const wallJunction = detectBuildingJunction(state.buildings, b, 'wall');
      if (wallJunction.kind === 'tee' || wallJunction.kind === 'cross') {
        drawProceduralWallJunction(ctx, sx, sy, w, h, wallJunction, alpha);
      } else {
        drawProceduralStripBuilding(ctx, b.type, sx, sy, w, h, rot, alpha);
      }
    } else {
      drawProceduralStripBuilding(ctx, b.type, sx, sy, w, h, rot, alpha);
    }
  }

  // Under construction
  for (const b of state.buildings) {
    if (b.completed) continue;
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;
    const cfg = BUILDING_CONFIGS[b.type];
    const tint = cfg.backgroundColor;
    const border = darkerColor(tint, 0.35);
    const dash = categoryBorderDashForType(b.type);
    const hover = isHovered(b);
    drawBuildingPad(ctx, cfg.padShape, sx, sy, w, h, tint, border, hover ? 0.45 : 0.28, dash, 1.5);
    const rot = normalizeBuildingRotation(b.rotation);
    if (isStripBuildType(b.type)) {
      drawProceduralStripBuilding(ctx, b.type, sx, sy, w, h, rot, 0.55);
    } else {
      const frame = getSpriteFrame(cfg.sprite);
      if (frame) {
        drawBuildingSprite(
          ctx, b.type, frame, sx, sy, w, h,
          Math.max(0.55, b.spriteScale || 0.55),
          rot,
        );
      }
    }

    // Progress bar
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx - w / 2, sy + h / 2 - 4, w, 4);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(sx - w / 2, sy + h / 2 - 4, w * (b.constructionProgress / 100), 4);
    ctx.fillStyle = '#44403c';
    ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(b.constructionProgress)}%`, sx, sy + 3);
  }

  // Completed buildings (roads and wall panels already drawn above)
  const sorted = state.buildings
    .filter((b) => b.completed && b.type !== BuildingType.Road && !ISO_PANEL_BUILDINGS.has(b.type))
    .sort((a, b) => {
      const depthA = a.y + a.height / 2;
      const depthB = b.y + b.height / 2;
      if (depthA !== depthB) return depthA - depthB;
      return a.id - b.id;
    });
  for (const b of sorted) {
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;

    const cfg = BUILDING_CONFIGS[b.type];
    const frame = getSpriteFrame(cfg.sprite);
    const sel = state.selectedBuilding?.id === b.id;
    const hover = isHovered(b);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + h * 0.1 + 2, w * 0.35, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Category-colored foundation pad
    const pad = Math.max(2, Math.min(w, h) * 0.08);
    const padW = w + pad * 2;
    const padH = h + pad * 2;
    const isRival = b.faction === 'rival';
    const tint = isRival ? '#312e81' : cfg.backgroundColor;
    const border = isRival ? '#6366f1' : darkerColor(tint, 0.4);
    const dash = categoryBorderDashForType(b.type);
    const baseAlpha = hover ? 0.52 : isRival ? 0.42 : 0.38;
    drawBuildingPad(ctx, cfg.padShape, sx, sy, padW, padH, tint, border, baseAlpha, dash, isRival ? 2 : 1.5);

    if (frame) {
      drawBuildingSprite(
        ctx, b.type, frame, sx, sy, w, h,
        b.spriteScale || 1,
        normalizeBuildingRotation(b.rotation),
        cfg.spriteDisplayScale ?? DEFAULT_SPRITE_DISPLAY_SCALE,
      );
    } else {
      ctx.fillStyle = '#e7e5e4';
      ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
      ctx.strokeStyle = sel ? tint : '#a8a29e';
      ctx.lineWidth = sel ? 3 : 1;
      ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
    }

    // Selection ring uses the building's category color
    if (isRival && b.campLabel && cam.zoom > 0.45) {
      ctx.font = `bold ${Math.max(7, 8 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      const label = b.campLabel;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(sx - tw / 2 - 4, sy - h / 2 - 14, tw + 8, 12);
      ctx.fillStyle = '#a5b4fc';
      ctx.fillText(label, sx, sy - h / 2 - 5);
    }

    if (sel || hover) {
      const ringColor = sel ? (isRival ? '#818cf8' : tint) : '#ffffff';
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = sel ? 10 : 6;
      ctx.strokeRect(sx - w / 2 - 2, sy - h / 2 - 2, w + 4, h + 4);
      ctx.shadowBlur = 0;
    }

    if (b.level > 1) {
      ctx.fillStyle = '#b45309';
      ctx.font = `bold ${Math.max(7, 9 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`Lv${b.level}`, sx + w / 2 - 4, sy - h / 2 + 10);
    }

    // Health bar
    if (b.health < b.maxHealth * 0.5) {
      const bw = w * 0.8;
      const bh = 3;
      const by = sy - h / 2 - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - bw / 2, by, bw, bh);
      ctx.fillStyle = b.health < b.maxHealth * 0.25 ? '#ef4444' : '#f59e0b';
      ctx.fillRect(sx - bw / 2, by, bw * (b.health / b.maxHealth), bh);
    }

    // Worker badge
    if (b.occupants.length > 0 && cam.zoom > 0.8) {
      const bs = Math.max(10, 12 * cam.zoom);
      const bx = sx + w / 2 - bs / 2;
      const by = sy + h / 2 - bs / 2;
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(bx, by, bs / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(7, 8 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${b.occupants.length}`, bx, by + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

// ============ ANIMALS (CULLED) ============
function drawAnimals(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
  forEntityLayerCache = false,
) {
  const cam = state.camera;

  for (const e of _cachedAnimals) {
    const sx = (e.x - cam.x) * cam.zoom + cw / 2;
    const sy = (e.y - cam.y) * cam.zoom + ch / 2;
    const cfg = SPECIES_CONFIG[e.type];
    const { spriteH, shadowW, shadowY } = getAnimalSpriteMetrics(e, cam.zoom);
    const cullPad = spriteH * 0.75;
    if (sx + cullPad < -20 || sx - cullPad > cw + 20 || sy + cullPad < -20 || sy - cullPad > ch + 20) continue;

    const sel = state.selectedEntity?.id === e.id;
    const flipX = e.vx < 0;
    const frame = getSpriteFrame(cfg.sprite);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + shadowY, shadowW * 0.45, shadowW * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawAnimal = () => {
      if (isDrawableSpriteFrame(frame)) {
        const aspect = frame.sw / frame.sh;
        drawSpriteFrame(
          ctx, frame, sx, sy, spriteH * aspect, spriteH,
          0.5, ANIMAL_SPRITE_ANCHOR_Y, flipX, {}, 'height',
        );
        return;
      }
      ctx.fillStyle = cfg.color;
      ctx.beginPath();
      ctx.arc(sx, sy, spriteH * 0.35, 0, Math.PI * 2);
      ctx.fill();
    };

    if (e.flash > 0 && !forEntityLayerCache) {
      ctx.globalAlpha = 0.7 + Math.sin(_time * 20) * 0.3;
      drawAnimal();
      ctx.globalAlpha = 1;
    } else {
      drawAnimal();
    }

    if (e.huntTargetId && cam.zoom > 0.5) {
      ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🐾', sx, sy - spriteH * 0.55 - 4);
    } else if (e.type === EntityType.Werewolf && cam.zoom > 0.55) {
      ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🌝', sx, sy - spriteH * 0.55 - 4);
    }

    if (e.combatTicks && e.combatTicks > 0) {
      drawCombatBurst(ctx, sx, sy, spriteH * 0.45, state.tick, e.id);
    }

    if (sel) {
      ctx.strokeStyle = e.type === EntityType.Werewolf ? '#a78bfa' : '#d97706';
      ctx.lineWidth = 2;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx, sy, spriteH * 0.38 + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}

// ============ HUMANS (CULLED) ============
function drawTalkingMouth(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  flipX: boolean,
  animFrame: number,
) {
  const talking = Math.sin(animFrame * 0.9) > -0.15;
  if (!talking) return;
  const mx = Math.round(sx + (flipX ? -size * 0.08 : size * 0.08));
  const my = Math.round(sy - size * 0.38);
  ctx.fillStyle = '#3d2817';
  ctx.fillRect(mx, my, 2, talking && Math.sin(animFrame * 1.6) > 0 ? 2 : 1);
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  text: string,
  tick: number,
  entityId: number,
  zoom: number,
) {
  if (zoom < 0.45) return;

  ctx.save();
  const bob = Math.sin(tick * 0.14 + entityId) * 1.5;
  const fontSize = Math.max(5.5, Math.min(7.5, 6.5 * zoom));
  ctx.font = `bold ${fontSize}px sans-serif`;
  const padX = 5;
  const padY = 3;
  const lineGap = 2;
  const lines = text.includes('\n') ? text.split('\n') : wrapChatLines(text);
  let maxLineW = 0;
  for (const line of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
  }
  const bw = Math.ceil(maxLineW + padX * 2);
  const lineH = fontSize + lineGap;
  const bh = Math.ceil(padY * 2 + lines.length * lineH - lineGap);
  const bx = Math.round(sx - bw / 2);
  const by = Math.round(sy - size - bh - 12 + bob);

  ctx.fillStyle = 'rgba(255,253,245,0.96)';
  ctx.strokeStyle = 'rgba(28,25,23,0.55)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,253,245,0.96)';
  ctx.beginPath();
  ctx.moveTo(sx - 4, by + bh - 1);
  ctx.lineTo(sx, sy - size - 3 + bob * 0.3);
  ctx.lineTo(sx + 4, by + bh - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1c1917';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const textStartY = by + padY + fontSize * 0.1;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, sx, textStartY + i * lineH);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function buildConstructionWorkerIds(buildings: RenderSnapshot['buildings']): Set<number> {
  const ids = new Set<number>();
  for (const b of buildings) {
    if (b.completed) continue;
    for (const id of b.occupants) ids.add(id);
  }
  return ids;
}

interface HumanStatusIconContext {
  hourOfDay: number;
  villageLeaderId: number | null;
  constructionWorkerIds: Set<number>;
  combatFlags: HumanCombatStatusFlags;
  childSchoolById: Map<number, RenderSnapshot['buildings'][number] | undefined>;
}

function buildHumanStatusIconContext(
  state: RenderSnapshot,
  humans: readonly Entity[],
): HumanStatusIconContext {
  const staffedSchools = findStaffedSchools(state.buildings);
  const childSchoolById = new Map<number, RenderSnapshot['buildings'][number] | undefined>();
  for (const human of humans) {
    if (!human.isJuvenile) continue;
    childSchoolById.set(human.id, findNearestStaffedSchool(human, staffedSchools));
  }
  return {
    hourOfDay: state.hourOfDay,
    villageLeaderId: state.villageLeaderId,
    constructionWorkerIds: buildConstructionWorkerIds(state.buildings),
    combatFlags: buildHumanCombatStatusFlags(
      state.unlockedTechs,
      state.hasBlacksmith,
      state.villageForge,
      state.buildings,
    ),
    childSchoolById,
  };
}

function getStatusIcon(human: Entity, ctx: HumanStatusIconContext): string {
  if (ctx.villageLeaderId != null && human.id === ctx.villageLeaderId) return '👑';
  if (human.moonHowlerCursed) return '🌝';
  const combatIcon = getHumanStatusCombatIconFromFlags(human, ctx.combatFlags);
  if (combatIcon) return combatIcon;
  if (human.faction === 'visitor') return '🧳';
  if (human.faction === 'rival') return '🏕️';
  if (human.isJuvenile) {
    const school = ctx.childSchoolById.get(human.id);
    if (school && isWorkHour(ctx.hourOfDay)) {
      return isChildAtSchool(human, school) ? '📚' : '🎒';
    }
    return '👶';
  }
  if (human.pregnant) return '🤰';
  if (human.courtshipProgress && human.courtshipProgress > 0 && !shouldBeAtHome(ctx.hourOfDay)) return '💕';
  if (shouldBeAtHome(ctx.hourOfDay)) return '🏠';
  if (isWorkHour(ctx.hourOfDay) && (human.homeBuildingId || ctx.constructionWorkerIds.has(human.id))) return '🔨';
  if (human.relationshipStatus === 'married' && human.partnerId) return '💍';
  return '🚶';
}

function getPlayerCampCenterFromBuildings(buildings: RenderSnapshot['buildings']): { x: number; y: number } {
  const playerBuildings = buildings.filter((b) => b.completed && b.faction !== 'rival');
  const townHall = playerBuildings.find((b) => b.type === BuildingType.TownHall);
  if (townHall) {
    return { x: townHall.x + townHall.width / 2, y: townHall.y + townHall.height / 2 };
  }
  const house = playerBuildings.find((b) => b.type === BuildingType.House);
  if (house) {
    return { x: house.x + house.width / 2, y: house.y + house.height / 2 };
  }
  if (playerBuildings.length > 0) {
    const b = playerBuildings[0];
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  return { x: 0, y: 0 };
}

function drawTradeRouteLines(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.camera.zoom < 0.35) return;
  const cam = state.camera;
  const hubTypes: BuildingType[] = [BuildingType.Market, BuildingType.Store, BuildingType.TownHall, BuildingType.Workshop];
  let hub = state.buildings.find((b) => b.completed && b.faction !== 'rival' && hubTypes.includes(b.type));
  if (!hub) hub = state.buildings.find((b) => b.completed && b.faction !== 'rival');
  if (!hub) return;
  const hx = (hub.x + hub.width / 2 - cam.x) * cam.zoom + cw / 2;
  const hy = (hub.y + hub.height / 2 - cam.y) * cam.zoom + ch / 2;

  for (const route of state.tradeRoutes) {
    if (!route.active || route.partnerX == null || route.partnerY == null) continue;
    const px = (route.partnerX - cam.x) * cam.zoom + cw / 2;
    const py = (route.partnerY - cam.y) * cam.zoom + ch / 2;
    const marching = route.caravanCarrierId != null;
    ctx.strokeStyle = marching ? 'rgba(251,191,36,0.55)' : 'rgba(52,211,153,0.35)';
    ctx.lineWidth = marching ? 2.5 : 1.5;
    ctx.setLineDash(marching ? [10, 5] : [6, 8]);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = marching ? '#fbbf24' : '#34d399';
    ctx.fillText('🚚', (hx + px) / 2, (hy + py) / 2 - 6);
  }
}

function drawRaidMarchLines(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.pendingRaidEvents?.length || state.camera.zoom < 0.35) return;
  const cam = state.camera;
  const village = getPlayerCampCenterFromBuildings(state.buildings);
  const vx = (village.x - cam.x) * cam.zoom + cw / 2;
  const vy = (village.y - cam.y) * cam.zoom + ch / 2;

  for (const raid of state.pendingRaidEvents) {
    const rival = state.rivalSettlements.find((r) => r.id === raid.rivalId);
    if (!rival) continue;
    const rx = (rival.campX - cam.x) * cam.zoom + cw / 2;
    const ry = (rival.campY - cam.y) * cam.zoom + ch / 2;
    ctx.strokeStyle = 'rgba(239,68,68,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(vx, vy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f87171';
    ctx.fillText('⚔️', (rx + vx) / 2, (ry + vy) / 2 - 6);
  }
}

function drawHuntChaseLines(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.camera.zoom < 0.4) return;
  const cam = state.camera;
  const hunters = state.renderSoA
    ? [..._tickAnimals, ..._tickHumans]
    : state.entities.filter((e) => e.alive && e.huntTargetId);
  const entityById = new Map<number, Entity>();
  if (state.renderSoA) {
    const buckets = _renderSoABuckets ?? getRenderSoABuckets();
    for (const shim of buckets.shims) entityById.set(shim.id, shim);
  } else {
    for (const e of state.entities) {
      if (e.alive) entityById.set(e.id, e);
    }
  }

  for (const hunter of hunters) {
    if (!hunter.huntTargetId) continue;
    const prey = entityById.get(hunter.huntTargetId);
    if (!prey) continue;

    const hx = (hunter.x - cam.x) * cam.zoom + cw / 2;
    const hy = (hunter.y - cam.y) * cam.zoom + ch / 2;
    const px = (prey.x - cam.x) * cam.zoom + cw / 2;
    const py = (prey.y - cam.y) * cam.zoom + ch / 2;

    const isHumanHunter = hunter.type === EntityType.Human;
    ctx.strokeStyle = isHumanHunter ? 'rgba(249,115,22,0.55)' : 'rgba(168,162,158,0.45)';
    ctx.lineWidth = isHumanHunter ? 1.5 : 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `${Math.max(7, 8 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isHumanHunter ? '#fb923c' : '#a8a29e';
    ctx.fillText(isHumanHunter ? '🏹' : isPredatorType(hunter.type) ? '🐾' : '•', (hx + px) / 2, (hy + py) / 2 - 4);
  }
}

function drawCombatBurst(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, tick: number, entityId: number) {
  const pulse = 0.5 + Math.sin(tick * 0.5 + entityId) * 0.5;
  ctx.save();
  ctx.strokeStyle = `rgba(251,191,36,${0.35 + pulse * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, size * 0.55 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHumans(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
  forEntityLayerCache = false,
) {
  const tick = state.tick;
  const cam = state.camera;
  const statusCtx = buildHumanStatusIconContext(state, _cachedHumans);

  for (const human of _cachedHumans) {
    const sx = (human.x - cam.x) * cam.zoom + cw / 2;
    const sy = (human.y - cam.y) * cam.zoom + ch / 2;
    const { size, spriteH, footOffset } = getHumanSpriteMetrics(human, cam.zoom);
    const cullPad = Math.max(size * 1.5, spriteH);
    if (sx + cullPad < -20 || sx - cullPad > cw + 20 || sy + cullPad < -20 || sy - cullPad > ch + 20) continue;

    const isSel = state.selectedEntity?.id === human.id;
    const flipX = human.vx < -0.05 || (Math.abs(human.vx) <= 0.05 && Math.cos(human.spriteAngle ?? 0) < 0);
    const speed = Math.hypot(human.vx, human.vy);
    const isWalking = speed > HUMAN_WALK_SPEED_THRESHOLD;
    const walkFrame = isWalking ? getHumanWalkFrameIndex(human.animFrame ?? 0, speed) : 0;
    const walkMotion = getHumanWalkMotion(human, cam.zoom, isWalking, walkFrame);
    const drawSize = size;
    const footY = sy + footOffset;
    const headY = footY - spriteH;
    const bobY = walkMotion.bobY ?? 0;

    const shadowScale = speed > 0.1 ? 1.08 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, footY + 1, size * 0.42 * shadowScale, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawHuman = () => {
      const gender = (human.gender ?? 'male') as HumanGender;
      const frame = isWalking
        ? getHumanSpriteFrame(gender, human.spriteVariant ?? 0, walkFrame)
        : getSpriteFrame(HUMAN_BASE_SPRITES[gender]);
      if (isDrawableSpriteFrame(frame)) {
        const aspect = frame.sw / frame.sh;
        const anchorY = frame.anchorY ?? 1;
        // fit:'height' + feet anchor — full 27x72 body, not a cropped head
        drawSpriteFrame(
          ctx, frame, sx, footY, spriteH * aspect, spriteH,
          0.5, anchorY, flipX, { bobY }, 'height',
        );
        return;
      }
      drawPioneerAt(
        ctx, sx, footY, spriteH,
        human.gender, human.spriteVariant ?? 0, walkFrame, flipX, bobY,
      );
    };

    if (human.flash > 0 && !forEntityLayerCache) {
      ctx.save();
      ctx.globalAlpha = 0.7 + Math.sin(_time * 20) * 0.3;
      drawHuman();
      ctx.restore();
    } else {
      drawHuman();
    }

    if (human.combatTicks && human.combatTicks > 0) {
      drawCombatBurst(ctx, sx, footY - spriteH * 0.45, drawSize, tick, human.id);
    }

    const isTalking = (human.chatTicks ?? 0) > 0;
    if (isTalking) {
      drawTalkingMouth(ctx, sx, headY + spriteH * 0.12, drawSize, flipX, human.animFrame ?? 0);
      const bubbleText = getChatBubbleText(human, tick);
      drawSpeechBubble(ctx, sx, headY, drawSize, bubbleText, tick, human.id, cam.zoom);
    }

    // Status badge
    if (cam.zoom > 0.6) {
      const bx = sx + size * 0.35;
      const by = headY + spriteH * 0.12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(getStatusIcon(human, statusCtx), bx, by);
      ctx.textBaseline = 'alphabetic';
    }

    // Name label
    const labelY = headY - (isTalking ? 22 : 4);
    if (human.faction && cam.zoom > 0.55) {
      ctx.strokeStyle = human.faction === 'visitor' ? '#22d3ee' : '#fb923c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.38, spriteH * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if ((human.name || human.surname) && cam.zoom > (human.isJuvenile ? 0.38 : 0.45)) {
      const prefix = human.faction === 'visitor' ? '↗ ' : human.faction === 'rival' ? '⚑ ' : '';
      const childTag = human.isJuvenile ? ' · child' : '';
      const idTag = !human.faction && cam.zoom > 0.72 ? ` #${human.id}` : '';
      const displayName = human.name?.trim() || 'Settler';
      const fullName = prefix + (human.surname ? `${displayName} ${human.surname}` : displayName) + idTag + childTag;
      const fontSize = Math.max(7, Math.min(9, 8 * cam.zoom));
      const tw = getCachedNameWidth(ctx, fullName, fontSize, cam.zoom);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - tw / 2 - 3, labelY - fontSize - 2, tw + 6, fontSize + 4);
      ctx.fillStyle = human.faction === 'visitor' ? '#67e8f9' : human.faction === 'rival' ? '#fdba74' : human.gender === 'male' ? '#fbbf24' : '#fda4af';
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fullName, sx, labelY);
      ctx.textBaseline = 'alphabetic';
    }

    if (isSel) {
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#d97706';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.42, spriteH * 0.54, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}

// ============ CAMP MARKERS ============
function drawCampMarkers(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  if (cam.zoom < 0.35) return;

  for (const group of state.visitorGroups) {
    const sx = (group.campX - cam.x) * cam.zoom + cw / 2;
    const sy = (group.campY - cam.y) * cam.zoom + ch / 2;
    if (sx < -40 || sx > cw + 40 || sy < -40 || sy > ch + 40) continue;
    const highlighted = state.highlightedCampKey === `visitor:${group.id}`;
    if (highlighted) {
      const pulse = 0.55 + 0.25 * Math.sin(state.tick * 0.15);
      ctx.strokeStyle = `rgba(34, 211, 238, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(18, 22 * cam.zoom), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(6, 78, 59, 0.55)';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(10, 14 * cam.zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (cam.zoom > 0.5) {
      ctx.font = `bold ${Math.max(7, 8 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a5f3fc';
      ctx.fillText(group.name, sx, sy - Math.max(12, 16 * cam.zoom));
      ctx.fillStyle = '#6ee7b7';
      ctx.font = `${Math.max(6, 7 * cam.zoom)}px sans-serif`;
      ctx.fillText(`${group.daysLeft}d`, sx, sy + Math.max(14, 18 * cam.zoom));
    }
  }

  for (const rival of state.rivalSettlements) {
    const sx = (rival.campX - cam.x) * cam.zoom + cw / 2;
    const sy = (rival.campY - cam.y) * cam.zoom + ch / 2;
    if (sx < -40 || sx > cw + 40 || sy < -40 || sy > ch + 40) continue;
    const highlighted = state.highlightedCampKey === `rival:${rival.id}`;
    if (highlighted) {
      const pulse = 0.55 + 0.25 * Math.sin(state.tick * 0.15);
      ctx.strokeStyle = `rgba(251, 146, 60, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(20, 24 * cam.zoom), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(67, 20, 7, 0.5)';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(12, 16 * cam.zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (cam.zoom > 0.5) {
      ctx.font = `bold ${Math.max(7, 8 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fed7aa';
      ctx.fillText(rival.name, sx, sy - Math.max(12, 16 * cam.zoom));
      ctx.fillStyle = '#fdba74';
      ctx.font = `${Math.max(6, 7 * cam.zoom)}px sans-serif`;
      ctx.fillText(`${rival.population} · ${rival.relationship}`, sx, sy + Math.max(14, 18 * cam.zoom));
    }
  }
}

// ============ PARTICLES ============
function drawParticleShape(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  p: RenderSnapshot['deathParticles'][0],
  lifeRatio: number,
) {
  const alpha = lifeRatio * (p.type === 'smoke' ? 0.45 : 0.85);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;

  if (p.type === 'star') {
    const r = size;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const x = sx + Math.cos(a) * r;
      const y = sy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      const a2 = a + Math.PI / 4;
      ctx.lineTo(sx + Math.cos(a2) * r * 0.35, sy + Math.sin(a2) * r * 0.35);
    }
    ctx.closePath();
    ctx.fill();
  } else if (p.type === 'sparkle') {
    ctx.fillRect(sx - size * 0.15, sy - size, size * 0.3, size * 2);
    ctx.fillRect(sx - size, sy - size * 0.15, size * 2, size * 0.3);
  } else if (p.type === 'smoke') {
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 1.8);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, size * 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  ctx.save();
  for (const p of state.deathParticles) {
    const sx = (p.x - cam.x) * cam.zoom + cw / 2;
    const sy = (p.y - cam.y) * cam.zoom + ch / 2;
    const size = p.size * cam.zoom;
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;
    drawParticleShape(ctx, sx, sy, size, p, p.life / p.maxLife);
  }
  ctx.restore();
}

// ============ NIGHT BUILDING GLOW ============
function drawNightBuildingGlow(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!isNightHour(state.hourOfDay) || state.camera.zoom < 0.32 || !state.juiceEffectsEnabled) return;
  const cam = state.camera;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    const mayGlow = NIGHT_HOME_GLOW_TYPES.has(b.type)
      || (NIGHT_STAFFED_GLOW_TYPES.has(b.type) && b.occupants.length > 0);
    if (!mayGlow) continue;
    const residentCount = NIGHT_HOME_GLOW_TYPES.has(b.type) ? b.occupants.length : 0;
    const intensity = getNightGlowIntensity(b, residentCount);
    if (intensity <= 0) continue;

    const sx = (b.x - cam.x) * cam.zoom + cw / 2;
    const sy = (b.y - cam.y) * cam.zoom + ch / 2;
    const w = b.width * cam.zoom;
    const h = b.height * cam.zoom;
    if (sx + w < -50 || sx - w > cw + 50 || sy + h < -50 || sy - h > ch + 50) continue;

    const flicker = 0.82 + Math.sin(_time * 3.5 + b.id * 1.9) * 0.18;
    const warm = intensity * flicker;

    if (NIGHT_HOME_GLOW_TYPES.has(b.type)) {
      const winW = Math.max(2.5, w * 0.09);
      const winH = Math.max(2.5, h * 0.11);
      const windows = [
        { ox: -w * 0.2, oy: -h * 0.06 },
        { ox: w * 0.06, oy: -h * 0.08 },
        ...(b.type === BuildingType.Mansion ? [{ ox: w * 0.22, oy: -h * 0.04 }] : []),
      ];
      for (const { ox, oy } of windows) {
        const grad = ctx.createRadialGradient(sx + ox, sy + oy, 0, sx + ox, sy + oy, winW * 2.8);
        grad.addColorStop(0, `rgba(255, 210, 140, ${0.6 * warm})`);
        grad.addColorStop(0.55, `rgba(255, 150, 60, ${0.2 * warm})`);
        grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx + ox - winW * 1.2, sy + oy - winH * 1.2, winW * 2.4, winH * 2.4);
      }

      const chimX = sx + w * 0.24;
      const chimY = sy - h * 0.36;
      const emberR = Math.max(2, 3 * cam.zoom);
      const chimGrad = ctx.createRadialGradient(chimX, chimY, 0, chimX, chimY - emberR * 2, emberR * 5);
      chimGrad.addColorStop(0, `rgba(255, 150, 60, ${0.75 * warm})`);
      chimGrad.addColorStop(0.35, `rgba(255, 90, 30, ${0.3 * warm})`);
      chimGrad.addColorStop(1, 'rgba(60, 30, 10, 0)');
      ctx.fillStyle = chimGrad;
      ctx.beginPath();
      ctx.arc(chimX, chimY, emberR * 4, 0, Math.PI * 2);
      ctx.fill();

      if (cam.zoom > 0.42) {
        const drift = Math.sin(_time * 1.2 + b.id) * 2;
        const smokeY = chimY - emberR * 3 - ((_time * 14 + b.id * 3) % 22);
        ctx.globalAlpha = 0.18 * warm;
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(chimX + drift, smokeY, emberR * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      const doorGrad = ctx.createRadialGradient(sx, sy + h * 0.12, 0, sx, sy + h * 0.12, w * 0.4);
      doorGrad.addColorStop(0, `rgba(255, 190, 110, ${0.4 * warm})`);
      doorGrad.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = doorGrad;
      ctx.beginPath();
      ctx.arc(sx, sy + h * 0.12, w * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ============ FLOATING TEXTS ============
function drawFloatingTexts(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  const gridSize = 60;
  const gridMap = new Map<string, number>();

  ctx.save();
  for (const ft of state.floatingTexts) {
    const sx = (ft.x - cam.x) * cam.zoom + cw / 2;
    const sy = (ft.y - cam.y) * cam.zoom + ch / 2;
    const gx = Math.floor(sx / gridSize);
    const gy = Math.floor(sy / gridSize);
    const key = `${gx},${gy}`;
    const count = gridMap.get(key) || 0;
    gridMap.set(key, count + 1);

    const offsetY = count * -12;
    const lifeRatio = ft.life / ft.maxLife;
    const fadeOut = ft.life < 7 ? ft.life / 7 : 1;
    ctx.globalAlpha = Math.min(1, lifeRatio * fadeOut);
    ctx.fillStyle = ft.color;
    ctx.font = `bold ${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, sx, sy + offsetY);
  }
  ctx.restore();
}

// ============ ECOSYSTEM CONNECTIONS ============
function drawEcoConnections(ctx: CanvasRenderingContext2D, _state: RenderSnapshot, cam: Camera, cw: number, ch: number) {
  if (cam.zoom < 0.6) return;

  const humanById = new Map(_cachedHumans.map((h) => [h.id, h]));
  for (const h of _cachedHumans) {
    if (h.partnerId && h.relationshipStatus === 'married' && h.id < h.partnerId) {
      const p = humanById.get(h.partnerId);
      if (!p) continue;
      const x1 = (h.x - cam.x) * cam.zoom + cw / 2;
      const y1 = (h.y - 8 - cam.y) * cam.zoom + ch / 2;
      const x2 = (p.x - cam.x) * cam.zoom + cw / 2;
      const y2 = (p.y - 8 - cam.y) * cam.zoom + ch / 2;
      if ((x1 + x2) / 2 + Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) < -50) continue;
      if ((x1 + x2) / 2 - Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) > cw + 50) continue;

      ctx.strokeStyle = 'rgba(255,215,0,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,215,0,0.5)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💍', (x1 + x2) / 2, (y1 + y2) / 2);
    }
  }
}

// ============ BUILD PREVIEW ============
function drawBuildPreview(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.buildMode) return;
  if (state.buildStripPreview && isStripBuildType(state.buildMode)) return;
  if (!state.buildGhost) return;
  const sx = (state.buildGhost.x - state.camera.x) * state.camera.zoom + cw / 2;
  const sy = (state.buildGhost.y - state.camera.y) * state.camera.zoom + ch / 2;
  const cfg = BUILDING_CONFIGS[state.buildMode];
  const footprint = getBuildingFootprintForType(state.buildMode, state.buildRotation);
  const w = footprint.width * state.camera.zoom;
  const h = footprint.height * state.camera.zoom;

  // Category-colored pad with validity tint
  const tint = state.buildGhost.valid ? cfg.backgroundColor : '#7f1d1d';
  const border = state.buildGhost.valid ? darkerColor(tint, 0.4) : '#ef4444';
  const dash = categoryBorderDashForType(state.buildMode);
  const pad = Math.max(2, Math.min(w, h) * 0.08);
  drawBuildingPad(ctx, cfg.padShape, sx, sy, w + pad * 2, h + pad * 2, tint, border, 0.35, dash, 1.5);

  const previewFrame = getSpriteFrame(cfg.sprite);
  ctx.globalAlpha = 0.55;
  if (previewFrame) {
    drawBuildingSprite(
      ctx, state.buildMode, previewFrame, sx, sy, w, h, 1,
      state.buildRotation,
      cfg.spriteDisplayScale ?? DEFAULT_SPRITE_DISPLAY_SCALE,
    );
  } else {
    ctx.fillStyle = state.buildGhost.valid ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
    ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
  }
  ctx.globalAlpha = 1;

  // Validity outline
  ctx.strokeStyle = state.buildGhost.valid ? '#22c55e' : '#ef4444';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(sx - w / 2 - 2, sy - h / 2 - 2, w + 4, h + 4);
  ctx.setLineDash([]);
}

// ============ WEATHER PARTICLES (BATCHED) ============
interface WParticle { x: number; y: number; vx: number; vy: number; s: number; a: number }
let wParts: WParticle[] = [];
let lastWType: WeatherType | null = null;
let lastWeatherCw = 0;
let lastWeatherCh = 0;

function updateWeatherParticles(w: WeatherType, cw: number, ch: number) {
  if (w === WeatherType.Clear) {
    wParts = [];
    lastWType = w;
    return;
  }
  if (w !== lastWType) {
    lastWType = w;
    wParts = [];
  }
  if (wParts.length === 0 || cw !== lastWeatherCw || ch !== lastWeatherCh) {
    wParts = [];
    const count = WEATHER_CONFIGS[w].particleCount;
    for (let i = 0; i < count; i++) {
      wParts.push({
        x: Math.random() * cw * 1.5 - cw * 0.25,
        y: Math.random() * ch * 1.5 - ch * 0.25,
        vx: w === WeatherType.Storm ? (Math.random() - 0.3) * 3 : (Math.random() - 0.5) * 0.5,
        vy: w === WeatherType.Snow ? 0.5 + Math.random() : 2 + Math.random() * 3,
        s: w === WeatherType.Snow ? 2 + Math.random() * 2 : 1 + Math.random(),
        a: 0.3 + Math.random() * 0.4,
      });
    }
    lastWeatherCw = cw;
    lastWeatherCh = ch;
  }
  for (const p of wParts) {
    p.x += p.vx; p.y += p.vy;
    if (p.y > ch * 1.3) { p.y = -10; p.x = Math.random() * cw * 1.5 - cw * 0.25; }
    if (p.x > cw * 1.3) p.x = -10;
    if (p.x < -cw * 0.3) p.x = cw * 1.3;
  }
}

function weatherOverlayStyle(color: string, alpha: number): string {
  if (!color) return `rgba(0, 0, 0, ${alpha})`;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawWeather(ctx: CanvasRenderingContext2D, w: WeatherType, cw: number, ch: number) {
  updateWeatherParticles(w, cw, ch);
  const weatherCfg = WEATHER_CONFIGS[w];
  if (weatherCfg.overlayAlpha > 0) {
    ctx.fillStyle = weatherOverlayStyle(weatherCfg.color, weatherCfg.overlayAlpha);
    ctx.fillRect(0, 0, cw, ch);
    return;
  }
  if (wParts.length === 0) return;

  ctx.save();
  // Batch weather particles
  if (w === WeatherType.Snow) {
    ctx.fillStyle = weatherCfg.color || '#fff';
    for (const p of wParts) {
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = weatherCfg.color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (const p of wParts) {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 2, p.y + p.vy * 2);
    }
    ctx.stroke();
  }
  ctx.restore();

  if (w === WeatherType.Storm && Math.random() < 0.003) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
    ctx.fillRect(0, 0, cw, ch);
  }
}

function drawScentOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!SCENT_DEBUG) return;
  const grid = state.scentGrid;
  const reader = state.scentReader;
  if (!grid && !reader) return;

  const cam = state.camera;
  const cellSize = grid?.cellSize ?? reader!.cellSize;
  const cols = grid?.cols ?? reader!.cols;
  const rows = grid?.rows ?? reader!.rows;
  let max = 0;
  if (reader) {
    max = reader.maxScent();
  } else if (grid) {
    for (let i = 0; i < grid.values.length; i++) {
      if (grid.values[i] > max) max = grid.values[i];
    }
  }
  if (max <= 0) return;

  const wl = cam.x - (cw / 2) / cam.zoom;
  const wr = cam.x + (cw / 2) / cam.zoom;
  const wt = cam.y - (ch / 2) / cam.zoom;
  const wb = cam.y + (ch / 2) / cam.zoom;
  const col0 = Math.max(0, Math.floor(wl / cellSize));
  const col1 = Math.min(cols - 1, Math.ceil(wr / cellSize));
  const row0 = Math.max(0, Math.floor(wt / cellSize));
  const row1 = Math.min(rows - 1, Math.ceil(wb / cellSize));
  const cellPx = cellSize * cam.zoom;

  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const scent = grid ? grid.values[row * cols + col] : reader!.scentAt(col, row);
      if (scent <= 0) continue;
      const sx = worldToScreenX(col * cellSize, cam, cw);
      const sy = worldToScreenY(row * cellSize, cam, ch);
      const alpha = Math.min(0.5, (scent / max) * 0.45);
      ctx.fillStyle = `rgba(168,72,232,${alpha})`;
      ctx.fillRect(sx, sy, cellPx, cellPx);
    }
  }
}

function paintWorldEntityLayer(ctx: CanvasContext2d, state: RenderSnapshot, cw: number, ch: number): void {
  // OffscreenCanvas 2d contexts are API-compatible with CanvasRenderingContext2D for draw passes.
  const drawCtx = ctx as CanvasRenderingContext2D;
  drawScentOverlay(drawCtx, state, cw, ch);
  drawBuildZoneOverlay(drawCtx, state, cw, ch);
  drawGrid(drawCtx, state, cw, ch);
  drawGrass(drawCtx, state, cw, ch);
  drawTrees(drawCtx, state, cw, ch);
  drawBuildings(drawCtx, state, cw, ch);
  drawCampMarkers(drawCtx, state, cw, ch);
  drawEcoConnections(drawCtx, state, state.camera, cw, ch);
  drawBuildPreview(drawCtx, state, cw, ch);
  drawAnimals(drawCtx, state, cw, ch, true);
  drawTradeRouteLines(drawCtx, state, cw, ch);
  drawRaidMarchLines(drawCtx, state, cw, ch);
  drawHuntChaseLines(drawCtx, state, cw, ch);
  drawHumans(drawCtx, state, cw, ch, true);
  drawParticles(drawCtx, state, cw, ch);
  drawFloatingTexts(drawCtx, state, cw, ch);
}

function drawEntityFlashOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number): void {
  const cam = state.camera;
  for (const e of _cachedAnimals) {
    if (e.flash <= 0) continue;
    const sx = (e.x - cam.x) * cam.zoom + cw / 2;
    const sy = (e.y - cam.y) * cam.zoom + ch / 2;
    const { spriteH } = getAnimalSpriteMetrics(e, cam.zoom);
    ctx.save();
    ctx.globalAlpha = 0.7 + Math.sin(_time * 20) * 0.3;
    ctx.strokeStyle = 'rgba(251,191,36,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, spriteH * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  for (const human of _cachedHumans) {
    if (human.flash <= 0) continue;
    const sx = (human.x - cam.x) * cam.zoom + cw / 2;
    const sy = (human.y - cam.y) * cam.zoom + ch / 2;
    const { size, spriteH, footOffset } = getHumanSpriteMetrics(human, cam.zoom);
    const footY = sy + footOffset;
    ctx.save();
    ctx.globalAlpha = 0.7 + Math.sin(_time * 20) * 0.3;
    ctx.strokeStyle = 'rgba(251,191,36,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.42, spriteH * 0.54, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function compositeCachedEntityLayer(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
): void {
  const layerKey = buildEntityLayerKey(state, cw, ch);
  const existing = getEntityLayerCache();
  if (!entityLayerNeedsRebuild(existing, layerKey, cw, ch)) {
    paintEntityLayerTo(ctx, existing!);
    return;
  }

  const layer = beginEntityLayerPaint(layerKey, cw, ch);
  paintWorldEntityLayer(layer.ctx, state, cw, ch);
  commitEntityLayerPaint(layerKey);
  paintEntityLayerTo(ctx, layer);
}

// ============ MAIN RENDER ============
/** Read-only render pass — camera/screenShake must be pre-interpolated in the snapshot. */
/** Clear module-level render caches when starting a new session or loading a save. */
export function resetRendererCaches(): void {
  disposeTerrainLayer(terrainCache);
  terrainCache = null;
  disposeTerrainDecor(terrainDecorCache);
  terrainDecorCache = null;
  disposeEntityLayerCache();
  invalidateRenderSoABucketsCache();
  resetDialogueSessions();
  _cachedEntityTick = UNCACHED_RENDER_TICK;
  _cachedEntityViewportKey = '';
  _tickTrees = [];
  _tickAnimals = [];
  _tickHumans = [];
  _cachedTrees = [];
  _cachedAnimals = [];
  _cachedHumans = [];
  _cachedGrass = [];
  _renderSoABuckets = null;
  _nameWidthCache.clear();
  wParts = [];
  lastWType = null;
  lastWeatherCw = 0;
  lastWeatherCh = 0;
  _time = 0;
  _lastRenderTime = 0;
}

export function renderGame(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const now = performance.now();
  const dt = _lastRenderTime > 0 ? Math.min(0.1, (now - _lastRenderTime) / 1000) : 1 / 60;
  _lastRenderTime = now;
  _time += dt;
  ctx.imageSmoothingEnabled = false;

  if (state.renderSoA) {
    updateCachedEntitiesFromSoA(state, cw, ch);
  } else {
    updateCachedEntities(
      state.entityByType,
      state.grassGrid,
      state.tick,
      state.camera,
      state.width,
      state.height,
      cw,
      ch,
    );
  }

  const shake = state.screenShake;
  if (shake > 0.1) {
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
  }

  drawGround(ctx, state, cw, ch);
  compositeCachedEntityLayer(ctx, state, cw, ch);
  drawEntityFlashOverlay(ctx, state, cw, ch);
  drawWeather(ctx, state.weather, cw, ch);

  if (isNightHour(state.hourOfDay)) {
    const depth = state.hourOfDay >= 22 || state.hourOfDay < 4 ? 0.4 : 0.28;
    ctx.fillStyle = `rgba(8,12,32,${depth})`;
    ctx.fillRect(0, 0, cw, ch);
    drawNightBuildingGlow(ctx, state, cw, ch);
  }

  // Grid lines on top of all map sprites (underlay was hidden under trees/grass)
  drawGridTopOverlay(ctx, state, cw, ch);

  if (state.renffrOmen) {
    drawRenffrOmen(ctx, state.renffrOmen, cw, ch, _time);
  }

  if (shake > 0.1) {
    ctx.restore();
  }
}


