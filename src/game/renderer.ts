import type { Entity, EntityByType } from './gameEngine';
import { worldToScreen as w2s } from './viewState';
import { buildEntityDrawBuckets } from './gameEngine';
import { UNCACHED_RENDER_TICK } from './gameTypes';
import type { RenderSnapshot } from './renderSnapshot';
import { updateRenderSoABuckets, getRenderSoABuckets } from './simBuffers/renderSoAEntities';
import { collectGrassInViewport, viewportFromCamera } from './spatialGrid';
import type { RenderSoABuckets } from './simBuffers/renderSoAEntities';
import { invalidateRenderSoABucketsCache } from './simBuffers/renderSoAEntities';
import { EntityType, BuildingType, Season, WeatherType, SPECIES_CONFIG, BUILDING_CONFIGS, GRID_SIZE, TERRAIN_TILE_SIZE, snapToGrid, TerrainType } from './gameEngine';
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
import { huntAnimProgress } from './huntvisuals';
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
  entityLayerAnchorMoved,
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

/** Per-season shift on land tiles so spring/fall/winter aren't only a faint overlay. */
function seasonTerrainShift(season: Season, type: TerrainType): { r: number; g: number; b: number } {
  const isWater =
    type === TerrainType.DeepWater
    || type === TerrainType.ShallowWater
    || type === TerrainType.River
    || type === TerrainType.RiverBank;
  if (isWater) {
    if (season === Season.Winter) return { r: 12, g: 18, b: 28 };
    if (season === Season.Fall) return { r: 8, g: 4, b: -4 };
    return { r: 0, g: 0, b: 0 };
  }
  switch (season) {
    case Season.Spring:
      return { r: -8, g: 22, b: -6 };
    case Season.Summer:
      // Drier, yellower grass/dirt (distinct from spring green)
      return { r: 22, g: 8, b: -28 };
    case Season.Fall:
      return { r: 28, g: -6, b: -22 };
    case Season.Winter:
      return { r: 18, g: 22, b: 32 };
    default:
      return { r: 0, g: 0, b: 0 };
  }
}

function getTerrainColor(type: TerrainType, variation: number, preset?: MapPreset, season: Season = Season.Spring): string {
  const presetHex = preset ? PRESET_TERRAIN_COLORS[preset]?.[type] : undefined;
  const hex = presetHex ?? TERRAIN_COLORS[type] ?? TERRAIN_COLORS[TerrainType.Grassland];
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
  const season = state.season ?? Season.Spring;
  // Higher bake resolution when zoomed in close so the ground isn't blocky.
  const lod = state.camera.zoom >= 3 ? 2 : 1;
  if (terrainLayerNeedsRebuild(terrainCache, state.worldMap, season, state.width, state.height, lod)) {
    disposeTerrainLayer(terrainCache);
    terrainCache = bakeTerrainLayer(
      state.worldMap,
      state.width,
      state.height,
      season,
      (type, seas, variation, preset) => getTerrainColor(type, variation, preset, seas ?? season),
      lod,
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
const _cachedPartnerById = new Map<number, number>();
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

  _cachedPartnerById.clear();
  for (const h of _cachedHumans) {
    if (h.partnerId && h.relationshipStatus === 'married') {
      _cachedPartnerById.set(h.id, h.partnerId);
    }
  }
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

/**
 * Level-based visual upgrade without new art: Lv2+ gets a gold trim ring on the
 * raised pad, Lv3+ adds a small gold pennant. Only drawn for player buildings.
 */
function drawBuildingLevelMark(
  ctx: CanvasRenderingContext2D,
  level: number,
  sx: number,
  sy: number,
  w: number,
  h: number,
  zoom: number,
): void {
  if (level < 2) return;
  const pad = Math.max(2, Math.min(w, h) * 0.1);
  const padW = w + pad * 2;
  const padH = h + pad * 2;
  const py = sy + h * 0.06;
  ctx.save();
  ctx.strokeStyle = level >= 3 ? 'rgba(250,204,21,0.85)' : 'rgba(250,204,21,0.5)';
  ctx.lineWidth = Math.max(1, 1.2 * zoom);
  ctx.beginPath();
  ctx.rect(sx - padW / 2, py - padH * 0.36, padW, padH * 0.72);
  ctx.stroke();
  if (level >= 3) {
    const px = sx + w * 0.22;
    const topY = sy - h * 0.66;
    ctx.strokeStyle = 'rgba(250,204,21,0.9)';
    ctx.lineWidth = Math.max(1, 1.5 * zoom);
    ctx.beginPath();
    ctx.moveTo(px, topY + h * 0.16);
    ctx.lineTo(px, topY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(250,204,21,0.9)';
    ctx.beginPath();
    ctx.moveTo(px, topY);
    ctx.lineTo(px + w * 0.24, topY + h * 0.05);
    ctx.lineTo(px, topY + h * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Parse #rrggbb (or short) for 2.5D pad shading. */
function parseHexRgb(color: string): { r: number; g: number; b: number } {
  const c = color.trim();
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    if (c.length === 7) {
      return {
        r: parseInt(c.slice(1, 3), 16),
        g: parseInt(c.slice(3, 5), 16),
        b: parseInt(c.slice(5, 7), 16),
      };
    }
    return {
      r: parseInt(c[1] + c[1], 16),
      g: parseInt(c[2] + c[2], 16),
      b: parseInt(c[3] + c[3], 16),
    };
  }
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return { r: 80, g: 90, b: 70 };
}

function rgbaFromRgb(rgb: { r: number; g: number; b: number }, a: number, shade = 0): string {
  const k = shade >= 0 ? 1 : 1 + shade;
  const lift = shade > 0 ? shade : 0;
  const r = Math.min(255, Math.max(0, rgb.r * k + (255 - rgb.r) * lift));
  const g = Math.min(255, Math.max(0, rgb.g * k + (255 - rgb.g) * lift));
  const b = Math.min(255, Math.max(0, rgb.b * k + (255 - rgb.b) * lift));
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

/**
 * Raised foundation pad — top face + south “wall” + soft cast shadow (2.5D tabletop).
 */
function drawBuildingPad(
  ctx: CanvasRenderingContext2D,
  shape: 'round' | 'rect' | 'circle' | 'road',
  x: number, y: number, w: number, h: number,
  fillColor: string, borderColor: string, alpha: number,
  dash: number[], lineWidth: number
) {
  ctx.save();
  const rgb = parseHexRgb(fillColor);
  const depth = Math.max(2, Math.min(h, w) * 0.12);
  // Contact shadow under pad (SE light)
  ctx.fillStyle = `rgba(0,0,0,${Math.min(0.35, alpha * 0.55)})`;
  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.ellipse(x + depth * 0.35, y + r * 0.35 + depth * 0.4, r * 0.92, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape !== 'road') {
    ctx.beginPath();
    ctx.ellipse(x + depth * 0.25, y + h * 0.28 + depth * 0.5, w * 0.48, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    // South disc wall
    ctx.fillStyle = rgbaFromRgb(rgb, alpha * 0.95, -0.35);
    ctx.beginPath();
    ctx.ellipse(x, y + depth * 0.45, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    // Top disc
    const top = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    top.addColorStop(0, rgbaFromRgb(rgb, alpha, 0.28));
    top.addColorStop(0.55, rgbaFromRgb(rgb, alpha, 0.05));
    top.addColorStop(1, rgbaFromRgb(rgb, alpha, -0.18));
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(x, y - depth * 0.15, r, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'road') {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fillColor;
    if (w >= h) {
      const padH = Math.max(4, h * 1.4);
      ctx.fillRect(x - w / 2, y - padH / 2, w, padH);
    } else {
      const padW = Math.max(4, w * 1.4);
      ctx.fillRect(x - padW / 2, y - h / 2, padW, h);
    }
  } else {
    const rw = w;
    const rh = h;
    const x0 = x - rw / 2;
    const y0 = y - rh / 2;
    const rr = shape === 'rect' ? 2 : Math.min(rw, rh) * 0.18;
    // Front (south) face of the platform
    ctx.fillStyle = rgbaFromRgb(rgb, Math.min(1, alpha + 0.1), -0.4);
    if (shape === 'rect') {
      ctx.fillRect(x0 + 1, y0 + rh - depth * 0.2, rw - 2, depth + 1);
    } else {
      roundRect(ctx, x0 + 1, y0 + rh * 0.55, rw - 2, rh * 0.45 + depth, rr * 0.5);
      ctx.fill();
    }
    // Top face with NW light gradient
    const grad = ctx.createLinearGradient(x0, y0, x0 + rw, y0 + rh);
    grad.addColorStop(0, rgbaFromRgb(rgb, alpha, 0.32));
    grad.addColorStop(0.45, rgbaFromRgb(rgb, alpha, 0.06));
    grad.addColorStop(1, rgbaFromRgb(rgb, alpha, -0.22));
    ctx.fillStyle = grad;
    if (shape === 'rect') {
      ctx.fillRect(x0, y0 - depth * 0.15, rw, rh);
    } else {
      roundRect(ctx, x0, y0 - depth * 0.15, rw, rh, rr);
      ctx.fill();
    }
    // Top-edge highlight
    ctx.strokeStyle = rgbaFromRgb(rgb, Math.min(1, alpha + 0.2), 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + rr, y0 - depth * 0.15);
    ctx.lineTo(x0 + rw - rr, y0 - depth * 0.15);
    ctx.stroke();
  }

  // Border (colorblind-friendly secondary cue)
  ctx.globalAlpha = Math.min(1, alpha + 0.3);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);

  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.ellipse(x, y - depth * 0.15, r, r * 0.78, 0, 0, Math.PI * 2);
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
    ctx.strokeRect(x - w / 2, y - h / 2 - depth * 0.15, w, h);
  } else {
    const r = Math.min(w, h) * 0.18;
    roundRect(ctx, x - w / 2, y - h / 2 - depth * 0.15, w, h, r);
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

/** Soft diamond “tile” at a screen point — 2.5D grid cell / snap marker. */
function drawIsoCellMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  fill: string,
  stroke?: string,
  lineWidth = 1,
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
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

  const startTx = Math.max(0, Math.floor(wl / TERRAIN_TILE_SIZE));
  const endTx = Math.min(map.width - 1, Math.ceil(wr / TERRAIN_TILE_SIZE));
  const startTy = Math.max(0, Math.floor(wt / TERRAIN_TILE_SIZE));
  const endTy = Math.min(map.height - 1, Math.ceil(wb / TERRAIN_TILE_SIZE));

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile || !isUnbuildableTerrainType(tile.type)) continue;
      // Water is visible on terrain tiles — only highlight less obvious blockers.
      if (isWaterTerrainType(tile.type)) continue;
      const wx = tx * TERRAIN_TILE_SIZE + TERRAIN_TILE_SIZE / 2;
      const wy = ty * TERRAIN_TILE_SIZE + TERRAIN_TILE_SIZE / 2;
      const cx = worldToScreenX(wx, cam, cw);
      const cy = worldToScreenY(wy, cam, ch);
      const halfW = (TERRAIN_TILE_SIZE * 0.48) * cam.zoom;
      const halfH = (TERRAIN_TILE_SIZE * 0.28) * cam.zoom;
      // Blocked terrain as flattened diamond plates (not flat red squares)
      drawIsoCellMarker(
        ctx, cx, cy, halfW, halfH,
        'rgba(185, 28, 28, 0.32)',
        'rgba(252, 165, 165, 0.35)',
        Math.max(0.8, 1.1 * cam.zoom),
      );
      // Thin south “lip” for height
      ctx.fillStyle = 'rgba(80, 10, 10, 0.35)';
      ctx.beginPath();
      ctx.moveTo(cx - halfW, cy);
      ctx.lineTo(cx, cy + halfH);
      ctx.lineTo(cx + halfW, cy);
      ctx.lineTo(cx, cy + halfH + Math.max(2, 3 * cam.zoom));
      ctx.closePath();
      ctx.fill();
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
      const hw = Math.max(3.5, 5.5 * cam.zoom);
      const hh = Math.max(2, 3.2 * cam.zoom);
      if (valid) {
        drawIsoCellMarker(
          ctx, px, py, hw, hh,
          'rgba(34, 197, 94, 0.55)',
          'rgba(167, 243, 208, 0.85)',
          Math.max(0.9, 1.2 * cam.zoom),
        );
        // Tiny raised nub
        ctx.fillStyle = 'rgba(220, 252, 231, 0.9)';
        ctx.beginPath();
        ctx.ellipse(px, py - hh * 0.15, hw * 0.28, hh * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        drawIsoCellMarker(
          ctx, px, py, hw * 0.85, hh * 0.85,
          'rgba(248, 113, 113, 0.28)',
          'rgba(252, 165, 165, 0.4)',
          1,
        );
      }
    }
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.showGrid || !state.buildMode) return;
  const cam = state.camera;
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const vp = getGridViewport(cam, cw, ch);

  // Validity checker on coarse cells — diamond plates instead of flat squares
  if (cam.zoom >= 0.3 && state.buildMode) {
    const halfW = (majorGs * 0.48) * cam.zoom;
    const halfH = (majorGs * 0.26) * cam.zoom;
    for (let wx = vp.mx0; wx <= vp.majorEx; wx += majorGs) {
      for (let wy = vp.my0; wy <= vp.majorEy; wy += majorGs) {
        const rawX = wx + majorGs / 2;
        const rawY = wy + majorGs / 2;
        const { x: cx, y: cy } = state.buildMode
          ? snapBuildingCenter(state.buildMode, rawX, rawY, state.buildRotation)
          : { x: snapToGrid(rawX, gs), y: snapToGrid(rawY, gs) };
        const px = worldToScreenX(wx + majorGs / 2, cam, cw);
        const py = worldToScreenY(wy + majorGs / 2, cam, ch);
        if (px + halfW < 0 || px - halfW > cw || py + halfH < 0 || py - halfH > ch) continue;
        const valid = canPlaceBuildingSnapshot(state, state.buildMode, cx, cy, state.buildRotation);
        drawIsoCellMarker(
          ctx, px, py, halfW, halfH,
          valid ? 'rgba(16, 185, 129, 0.16)' : 'rgba(127, 29, 29, 0.2)',
          valid ? 'rgba(52, 211, 153, 0.22)' : 'rgba(248, 113, 113, 0.22)',
          Math.max(0.7, 1 / cam.zoom),
        );
      }
    }
  }

  // Cell size hint when zoomed in during build
  if (cam.zoom >= 0.75) {
    ctx.font = `bold ${Math.max(8, Math.round(9 * cam.zoom))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(167, 243, 208, 0.75)';
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

  // Build ghost footprint — ground diamond plate (sprite ghost drawn later in drawBuildPreview)
  if (state.buildMode && state.buildGhost && !(state.buildStripPreview && isStripBuildType(state.buildMode))) {
    const footprint = getBuildingFootprintForType(state.buildMode, state.buildRotation);
    const [gx, gy] = w2s(state.buildGhost.x, state.buildGhost.y, cam, cw, ch);
    const bw = footprint.width * cam.zoom;
    const bh = footprint.height * cam.zoom;
    const valid = state.buildGhost.valid;
    const halfW = bw * 0.52;
    const halfH = Math.max(bh * 0.28, bw * 0.16);

    // Soft ground shadow under the plate
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(gx + 3, gy + halfH * 0.55, halfW * 0.95, halfH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    drawIsoCellMarker(
      ctx, gx, gy, halfW, halfH,
      valid ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)',
      valid ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)',
      Math.max(1.4, 2 / cam.zoom),
    );
    // South lip for thickness
    ctx.fillStyle = valid ? 'rgba(6, 78, 59, 0.45)' : 'rgba(127, 29, 29, 0.5)';
    ctx.beginPath();
    ctx.moveTo(gx - halfW, gy);
    ctx.lineTo(gx, gy + halfH);
    ctx.lineTo(gx + halfW, gy);
    ctx.lineTo(gx, gy + halfH + Math.max(2.5, 3.5 * cam.zoom));
    ctx.closePath();
    ctx.fill();

    // Inner cell ticks for large footprints (along diamond axes)
    if (cam.zoom >= 0.5 && bw > gs * cam.zoom * 1.5) {
      ctx.strokeStyle = valid ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const left = state.buildGhost.x - footprint.width / 2;
      const right = state.buildGhost.x + footprint.width / 2;
      const top = state.buildGhost.y - footprint.height / 2;
      const bottom = state.buildGhost.y + footprint.height / 2;
      for (let wx = Math.ceil(left / gs) * gs; wx < right; wx += gs) {
        const t = (wx - left) / footprint.width;
        const px = gx - halfW + t * halfW * 2;
        ctx.moveTo(px, gy - halfH * 0.35);
        ctx.lineTo(px, gy + halfH * 0.35);
      }
      for (let wy = Math.ceil(top / gs) * gs; wy < bottom; wy += gs) {
        const t = (wy - top) / footprint.height;
        const py = gy - halfH + t * halfH * 2;
        ctx.moveTo(gx - halfW * 0.35, py);
        ctx.lineTo(gx + halfW * 0.35, py);
      }
      ctx.stroke();
    }

    // Snap anchor (small raised diamond)
    drawIsoCellMarker(
      ctx, gx, gy, Math.max(3, 4.5 * cam.zoom), Math.max(2, 2.8 * cam.zoom),
      valid ? '#4ade80' : '#f87171',
      'rgba(0,0,0,0.55)',
      Math.max(1, 1.2 / cam.zoom),
    );
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
    // Softer etched lines — sit on the ground, not neon wireframe
    const minorW = Math.max(0.7, 0.95 / cam.zoom);
    const majorW = Math.max(1.0, 1.5 / cam.zoom);
    strokeGridLines(ctx, vp, cam, cw, ch, gs, true, 'rgba(110, 231, 183, 0.28)', 'rgba(0,0,0,0.22)', minorW);
    strokeGridLines(ctx, vp, cam, cw, ch, majorGs, false, 'rgba(52, 211, 153, 0.5)', 'rgba(0,0,0,0.32)', majorW);
    if (cam.zoom >= 0.4) {
      // Major intersections as tiny diamonds (2.5D pegs)
      const hw = Math.max(2.2, 2.8 * cam.zoom);
      const hh = Math.max(1.3, 1.7 * cam.zoom);
      ctx.save();
      for (let x = vp.mx0; x <= vp.majorEx; x += majorGs) {
        for (let y = vp.my0; y <= vp.majorEy; y += majorGs) {
          const px = worldToScreenX(x, cam, cw);
          const py = worldToScreenY(y, cam, ch);
          if (px < -8 || px > cw + 8 || py < -8 || py > ch + 8) continue;
          drawIsoCellMarker(
            ctx, px, py, hw, hh,
            'rgba(167, 243, 208, 0.75)',
            'rgba(6, 78, 59, 0.55)',
            1,
          );
        }
      }
      ctx.restore();
    }
    return;
  }

  // Phase D — quieter play grid so painted ground reads first
  const majorW = Math.max(0.7, 1.0 / cam.zoom);
  const lineColor = isNight
    ? 'rgba(226, 232, 240, 0.16)'
    : 'rgba(31, 56, 28, 0.11)';
  strokeGridLines(ctx, vp, cam, cw, ch, majorGs, false, lineColor, 'rgba(0,0,0,0.08)', majorW);
}

// ============ GRASS (soft tufts — seasonal tint, still cheap) ============
function grassSeasonFill(season: Season): string {
  switch (season) {
    case Season.Spring: return '#5eea8a';
    case Season.Summer: return '#a3b35c'; // sun-bleached olive, not spring neon
    case Season.Fall: return '#ca8a04';
    case Season.Winter: return '#cbd5e1';
    default: return '#22c55e';
  }
}

const GRASS_SPRITE_PATHS = ['/sprites/grass.png', '/sprites/grass2.png'] as const;
const TREE_SPRITE_PATHS = ['/sprites/tree.png', '/sprites/tree2.png'] as const;

function grassSeasonAlpha(season: Season): number {
  switch (season) {
    case Season.Winter: return 0.38;
    case Season.Fall: return 0.88;
    case Season.Spring: return 0.98;
    case Season.Summer: return 0.85;
    default: return 0.9;
  }
}

function drawGrass(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  const seasonA = grassSeasonAlpha(state.season);
  const frames = GRASS_SPRITE_PATHS.map((p) => getSpriteFrame(p));
  const hasSprite = frames.some(isDrawableSpriteFrame);

  ctx.save();
  let drawn = 0;
  for (const grass of _cachedGrass) {
    const sx = (grass.x - cam.x) * cam.zoom + cw / 2;
    const sy = (grass.y - cam.y) * cam.zoom + ch / 2;
    const size = grass.size * 1.0 * cam.zoom;
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;
    // Density cull when zoomed out
    if (cam.zoom < 0.55 && drawn % 3 !== 0) { drawn++; continue; }
    if (cam.zoom < 0.85 && drawn % 2 !== 0) { drawn++; continue; }

    const energyT = Math.max(0.35, Math.min(1, grass.energy / 100));
    const r = size * (0.55 + 0.35 * energyT);

    // Soft contact shadow under tuft
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(sx + r * 0.06, sy + r * 0.22, r * 0.55, r * 0.18, 0.1, 0, Math.PI * 2);
    ctx.fill();

    const frame = frames[grass.id % frames.length];
    if (hasSprite && isDrawableSpriteFrame(frame)) {
      ctx.globalAlpha = seasonA * (0.65 + 0.35 * energyT);
      // Winter desaturate via slight blue wash on alpha only — keep sprite readable
      if (state.season === Season.Winter) ctx.globalAlpha *= 0.75;
      const flip = (grass.id & 1) === 0;
      drawSpriteFrame(
        ctx,
        frame,
        sx,
        sy,
        r * 2.2,
        r * 2.0,
        0.5,
        0.92,
        flip,
      );
      ctx.globalAlpha = 1;
    } else {
      // Procedural fallback
      ctx.fillStyle = grassSeasonFill(state.season);
      ctx.globalAlpha = 0.22 * energyT;
      ctx.beginPath();
      ctx.ellipse(sx, sy + r * 0.15, r * 1.15, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawn++;
  }
  ctx.restore();
}

// ============ TREES (CULLED) ============
function drawTrees(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  const treeFrames = TREE_SPRITE_PATHS.map((p) => getSpriteFrame(p));
  const bushFrame = getSpriteFrame('/sprites/bush.png');
  const stumpFrame = getSpriteFrame('/sprites/stump.png');

  // Sort by Y so lower trees draw in front (simple 2.5D depth)
  const trees = _cachedTrees.length > 1
    ? [..._cachedTrees].sort((a, b) => a.y - b.y || a.id - b.id)
    : _cachedTrees;

  for (const tree of trees) {
    const sx = (tree.x - cam.x) * cam.zoom + cw / 2;
    const sy = (tree.y - cam.y) * cam.zoom + ch / 2;
    const size = tree.size * 2.4 * cam.zoom;
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;

    // Phase C — denser forest-floor props near trees (stable by id)
    if (cam.zoom >= 0.4) {
      const propRoll = tree.id % 5;
      if ((propRoll === 0 || propRoll === 3) && isDrawableSpriteFrame(stumpFrame)) {
        const px = sx - size * 0.55;
        const py = sy + size * 0.12;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(px + 2, py + size * 0.08, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        drawSpriteFrame(ctx, stumpFrame, px, py, size * 0.85, size * 0.55, 0.5, 0.9);
      }
      if ((propRoll === 1 || propRoll === 2 || propRoll === 4) && isDrawableSpriteFrame(bushFrame)) {
        const px = sx + size * (propRoll === 4 ? -0.4 : 0.48);
        const py = sy + size * 0.08;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(px, py + size * 0.06, size * 0.22, size * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        drawSpriteFrame(ctx, bushFrame, px, py, size * 0.7, size * 0.55, 0.5, 0.9);
      }
    }

    // 2.5D contact shadow (offset SE) + soft canopy pool
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx + size * 0.14, sy + size * 0.34, size * 0.58, size * 0.18, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(sx + size * 0.06, sy + size * 0.22, size * 0.42, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Oak vs pine by entity id for map variety
    const treeFrame = treeFrames[tree.id % treeFrames.length];
    if (isDrawableSpriteFrame(treeFrame)) {
      const isPine = (tree.id % TREE_SPRITE_PATHS.length) === 1;
      const drawW = size * (isPine ? 1.65 : 2.05);
      const drawH = size * (isPine ? 2.55 : 2.3);
      drawSpriteFrame(ctx, treeFrame, sx, sy - size * 0.08, drawW, drawH, 0.5, 0.92);
    } else {
      // Procedural fallback: trunk + canopy
      ctx.fillStyle = '#5c4030';
      ctx.fillRect(sx - size * 0.08, sy - size * 0.1, size * 0.16, size * 0.45);
      ctx.fillStyle = '#228B22';
      ctx.beginPath();
      ctx.arc(sx, sy - size * 0.25, size * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2d8a3e';
      ctx.beginPath();
      ctx.arc(sx - size * 0.18, sy - size * 0.12, size * 0.32, 0, Math.PI * 2);
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

    // Long soft cast shadow (SE sun) — reads as volume under the sprite
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(sx + w * 0.08, sy + h * 0.32, w * 0.48, h * 0.16, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(sx + w * 0.14, sy + h * 0.36, w * 0.38, h * 0.1, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Category-colored raised foundation pad (2.5D platform)
    const pad = Math.max(2, Math.min(w, h) * 0.1);
    const padW = w + pad * 2;
    const padH = h + pad * 2;
    const isRival = b.faction === 'rival';
    const tint = isRival ? '#312e81' : cfg.backgroundColor;
    const border = isRival ? '#6366f1' : darkerColor(tint, 0.4);
    const dash = categoryBorderDashForType(b.type);
    const baseAlpha = hover ? 0.72 : isRival ? 0.58 : 0.55;
    drawBuildingPad(ctx, cfg.padShape, sx, sy + h * 0.06, padW, padH * 0.72, tint, border, baseAlpha, dash, isRival ? 2 : 1.5);

    if (frame) {
      // Lift sprite slightly above pad so the footprint reads as a base
      drawBuildingSprite(
        ctx, b.type, frame, sx, sy - h * 0.04, w, h,
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

    // Level-based visual upgrade — gold trim from Lv2, pennant from Lv3.
    drawBuildingLevelMark(ctx, b.level, sx, sy, w, h, cam.zoom);

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
      const ringColor = sel ? (isRival ? '#a5b4fc' : '#6ee7b7') : 'rgba(255,255,255,0.85)';
      const padX = sx - w / 2 - 3;
      const padY = sy - h / 2 - 3;
      const padRw = w + 6;
      const padRh = h + 6;
      ctx.save();
      if (sel) {
        ctx.fillStyle = isRival ? 'rgba(99, 102, 241, 0.12)' : 'rgba(16, 185, 129, 0.12)';
        ctx.fillRect(padX, padY, padRw, padRh);
      }
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = sel ? 12 : 5;
      ctx.strokeRect(padX, padY, padRw, padRh);
      ctx.shadowBlur = 0;
      ctx.restore();
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

    // Soft contact shadow (SE offset for 2.5D volume)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx + shadowW * 0.08, sy + shadowY + 1, shadowW * 0.5, shadowW * 0.15, 0.1, 0, Math.PI * 2);
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
    } else if (e.type === EntityType.Werewolf && cam.zoom > 0.4) {
      // Village head still wearing the howl — crown so they stay findable (use animal metrics only)
      if (state.villageLeaderId === e.id && !e.faction) {
        ctx.font = `${Math.max(11, Math.round(13 * cam.zoom))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde047';
        ctx.fillText('👑', sx, sy - spriteH * 0.55 - Math.max(10, 12 * cam.zoom));
      }
      ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🌝', sx, sy - spriteH * 0.55 - 4);
    }

    if (e.combatTicks && e.combatTicks > 0) {
      drawCombatBurst(ctx, sx, sy, spriteH * 0.45, state.tick, e.id);
    }

    if (sel) {
      const ring = e.type === EntityType.Werewolf ? '#c4b5fd' : '#fbbf24';
      const rr = spriteH * 0.4 + 5;
      ctx.save();
      ctx.strokeStyle = ring;
      ctx.lineWidth = 2;
      ctx.shadowColor = ring;
      ctx.shadowBlur = 10;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
  // Tree lines are long — show bubbles a bit earlier when zooming out.
  if (zoom < 0.36 || !text) return;

  ctx.save();
  const bob = Math.sin(tick * 0.14 + entityId) * 1.5;
  const fontSize = Math.max(6, Math.min(8.5, 7 * zoom));
  ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  const padX = 7;
  const padY = 5;
  const lineGap = 2.5;
  // formatChatLine already wraps; split on newlines, re-wrap single blobs.
  const lines = text.includes('\n')
    ? text.split('\n').filter(Boolean)
    : wrapChatLines(text, 36, 3);
  let maxLineW = 0;
  for (const line of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
  }
  // Cap width so long tree quotes stay readable near screen edges
  const maxBw = Math.min(220 * Math.max(0.85, zoom), Math.max(72, maxLineW + padX * 2));
  const bw = Math.ceil(Math.min(maxBw, maxLineW + padX * 2));
  const lineH = fontSize + lineGap;
  const bh = Math.ceil(padY * 2 + lines.length * lineH - lineGap);
  const bx = Math.round(sx - bw / 2);
  const by = Math.round(sy - size - bh - 14 + bob);

  // Soft shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, bx + 1, by + 2, bw, bh, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,252,245,0.97)';
  ctx.strokeStyle = 'rgba(41,37,36,0.5)';
  ctx.lineWidth = 1.25;
  roundRect(ctx, bx, by, bw, bh, 6);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.fillStyle = 'rgba(255,252,245,0.97)';
  ctx.beginPath();
  ctx.moveTo(sx - 5, by + bh - 1);
  ctx.lineTo(sx, sy - size - 4 + bob * 0.3);
  ctx.lineTo(sx + 5, by + bh - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1c1917';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const textStartY = by + padY + fontSize * 0.08;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Clip visually if measure overflowed maxBw
    if (ctx.measureText(line).width > bw - padX * 2) {
      let clipped = line;
      while (clipped.length > 4 && ctx.measureText(`${clipped}…`).width > bw - padX * 2) {
        clipped = clipped.slice(0, -1);
      }
      ctx.fillText(`${clipped}…`, sx, textStartY + i * lineH);
    } else {
      ctx.fillText(line, sx, textStartY + i * lineH);
    }
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
  const hasIncoming = (state.pendingRaidEvents?.length ?? 0) > 0;
  const hasOutgoing = (state.pendingOutgoingRaidEvents?.length ?? 0) > 0;
  if ((!hasIncoming && !hasOutgoing) || state.camera.zoom < 0.35) return;
  const cam = state.camera;
  const village = getPlayerCampCenterFromBuildings(state.buildings);
  const vx = (village.x - cam.x) * cam.zoom + cw / 2;
  const vy = (village.y - cam.y) * cam.zoom + ch / 2;

  // Incoming: solid rose (threat toward village)
  for (const raid of state.pendingRaidEvents ?? []) {
    const rival = state.rivalSettlements.find((r) => r.id === raid.rivalId);
    if (!rival) continue;
    const rx = (rival.campX - cam.x) * cam.zoom + cw / 2;
    const ry = (rival.campY - cam.y) * cam.zoom + ch / 2;
    ctx.strokeStyle = 'rgba(244,63,94,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(vx, vy);
    ctx.stroke();
    ctx.font = `${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fb7185';
    ctx.fillText('⚔️', (rx + vx) / 2, (ry + vy) / 2 - 6);
  }

  // Outgoing: dashed amber/orange, heavier stroke; counter-raid uses gold + short dash
  for (const raid of state.pendingOutgoingRaidEvents ?? []) {
    const rival = state.rivalSettlements.find((r) => r.id === raid.rivalId);
    if (!rival) continue;
    const rx = (rival.campX - cam.x) * cam.zoom + cw / 2;
    const ry = (rival.campY - cam.y) * cam.zoom + ch / 2;
    const counter = !!raid.isCounterRaid;
    ctx.strokeStyle = counter ? 'rgba(251,191,36,0.7)' : 'rgba(249,115,22,0.7)';
    ctx.lineWidth = counter ? 3 : 2.75;
    ctx.setLineDash(counter ? [4, 4] : [12, 6]);
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.setLineDash([]);
    // Endpoint marker toward rival camp
    const mx = vx + (rx - vx) * 0.92;
    const my = vy + (ry - vy) * 0.92;
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(2.5, 3.5 * Math.min(1, cam.zoom)), 0, Math.PI * 2);
    ctx.fillStyle = counter ? 'rgba(251,191,36,0.85)' : 'rgba(251,146,60,0.85)';
    ctx.fill();
    ctx.font = `${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = counter ? '#fbbf24' : '#fb923c';
    ctx.fillText(counter ? '🛡️' : '🥾', (vx + rx) / 2, (vy + ry) / 2 - 6);
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

/** Hunting Spot shots — dashed arrow flight toward the prey (data from huntvisuals.ts). */
function drawHuntVisuals(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const visuals = state.huntVisuals;
  if (!visuals || visuals.length === 0 || state.camera.zoom < 0.4) return;
  const cam = state.camera;
  for (const v of visuals) {
    const progress = huntAnimProgress(v);
    if (progress <= 0 || progress >= 1) continue;

    const sx = (v.fromX - cam.x) * cam.zoom + cw / 2;
    const sy = (v.fromY - cam.y) * cam.zoom + ch / 2;
    const tx = (v.toX - cam.x) * cam.zoom + cw / 2;
    const ty = (v.toY - cam.y) * cam.zoom + ch / 2;
    const mx = sx + (tx - sx) * progress;
    const my = sy + (ty - sy) * progress;

    // Dashed flight path behind the arrow
    ctx.strokeStyle = 'rgba(249,115,22,0.45)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow projectile (gold triangle) at the tip
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.atan2(ty - sy, tx - sx));
    ctx.fillStyle = v.foughtBack ? '#f87171' : '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(7 * cam.zoom, 0);
    ctx.lineTo(-4 * cam.zoom, -3.5 * cam.zoom);
    ctx.lineTo(-4 * cam.zoom, 3.5 * cam.zoom);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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

    const shadowScale = speed > 0.1 ? 1.1 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx + size * 0.08, footY + 2, size * 0.46 * shadowScale, size * 0.13, 0.12, 0, Math.PI * 2);
    ctx.fill();

    const drawHuman = () => {
      const gender = (human.gender ?? 'male') as HumanGender;
      const frame = isWalking
        ? getHumanSpriteFrame(gender, human.spriteVariant ?? 0, walkFrame)
        : getSpriteFrame(HUMAN_BASE_SPRITES[gender]);
      if (isDrawableSpriteFrame(frame)) {
        const aspect = frame.sw / frame.sh;
        const anchorY = frame.anchorY ?? 1;
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

    // Village leader — gold ring + crown (visible even zoomed out)
    const isLeader =
      state.villageLeaderId != null
      && human.id === state.villageLeaderId
      && !human.faction;
    if (isLeader && cam.zoom > 0.22) {
      ctx.save();
      const pulse = 0.55 + Math.sin(_time * 2.8 + human.id) * 0.2;
      // Soft gold ground ring (double stroke at closer zoom)
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.5 + pulse * 0.4})`;
      ctx.lineWidth = Math.max(2, 2.5 * cam.zoom);
      ctx.beginPath();
      ctx.ellipse(sx, footY + 1, size * 0.62, size * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (cam.zoom > 0.35) {
        ctx.strokeStyle = `rgba(253, 224, 71, ${0.25 + pulse * 0.2})`;
        ctx.lineWidth = Math.max(1, 1.2 * cam.zoom);
        ctx.beginPath();
        ctx.ellipse(sx, footY + 1, size * 0.78, size * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Head halo
      const halo = ctx.createRadialGradient(sx, headY + bobY, 2, sx, headY + bobY, size * 1.05);
      halo.addColorStop(0, `rgba(253, 224, 71, ${0.4 * pulse})`);
      halo.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, headY + bobY + spriteH * 0.08, size * 0.95, 0, Math.PI * 2);
      ctx.fill();
      // Crown above head
      const crownY = headY + bobY - Math.max(5, 7 * cam.zoom);
      ctx.font = `${Math.max(12, Math.round(15 * cam.zoom))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText('👑', sx + 0.5, crownY + 0.5);
      ctx.fillStyle = '#fde047';
      ctx.fillText('👑', sx, crownY);
      ctx.restore();
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

    // Name label — leaders keep a gold plate at lower zoom
    const labelY = headY - (isTalking ? 22 : 4) - (isLeader && cam.zoom > 0.22 ? Math.max(10, 12 * cam.zoom) : 0);
    if (human.faction && cam.zoom > 0.55) {
      ctx.strokeStyle = human.faction === 'visitor' ? '#22d3ee' : '#fb923c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.38, spriteH * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const nameZoomMin = isLeader ? 0.28 : (human.isJuvenile ? 0.38 : 0.45);
    if ((human.name || human.surname || isLeader) && cam.zoom > nameZoomMin) {
      const prefix = isLeader
        ? '👑 '
        : human.faction === 'visitor'
          ? '↗ '
          : human.faction === 'rival'
            ? '⚑ '
            : '';
      const childTag = human.isJuvenile ? ' · child' : '';
      const roleTag = isLeader && cam.zoom > 0.5 ? ' · Head' : '';
      const idTag = !human.faction && !isLeader && cam.zoom > 0.72 ? ` #${human.id}` : '';
      const displayName = human.name?.trim() || (isLeader ? 'Village head' : 'Settler');
      const fullName = prefix + (human.surname ? `${displayName} ${human.surname}` : displayName) + roleTag + idTag + childTag;
      const fontSize = Math.max(isLeader ? 8 : 7, Math.min(isLeader ? 11 : 9, (isLeader ? 9.5 : 8) * cam.zoom));
      const tw = getCachedNameWidth(ctx, fullName, fontSize, cam.zoom);
      if (isLeader) {
        ctx.fillStyle = 'rgba(120, 53, 15, 0.82)';
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.lineWidth = 1;
        ctx.fillRect(sx - tw / 2 - 4, labelY - fontSize - 3, tw + 8, fontSize + 6);
        ctx.strokeRect(sx - tw / 2 - 4, labelY - fontSize - 3, tw + 8, fontSize + 6);
        ctx.fillStyle = '#fde68a';
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx - tw / 2 - 3, labelY - fontSize - 2, tw + 6, fontSize + 4);
        ctx.fillStyle = human.faction === 'visitor' ? '#67e8f9' : human.faction === 'rival' ? '#fdba74' : human.gender === 'male' ? '#fbbf24' : '#fda4af';
      }
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fullName, sx, labelY);
      ctx.textBaseline = 'alphabetic';
    }

    if (isSel) {
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.44, spriteH * 0.56, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.44, spriteH * 0.56, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ground marker under feet
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(sx, footY + 2, size * 0.5, size * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
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

/**
 * Day + night polish: forge fire pulse, house chimney smoke, blacksmith heat.
 * Drawn every frame (outside entity-layer cache) so motion stays smooth.
 */
function drawBuildingActiveEffects(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.juiceEffectsEnabled || state.camera.zoom < 0.35) return;
  const cam = state.camera;
  const forgeActive = !!state.villageForge?.activeOrder;
  const night = isNightHour(state.hourOfDay);

  ctx.save();
  for (const b of state.buildings) {
    if (b.faction === 'rival') continue;
    const sx = (b.x - cam.x) * cam.zoom + cw / 2;
    const sy = (b.y - cam.y) * cam.zoom + ch / 2;
    const w = b.width * cam.zoom;
    const h = b.height * cam.zoom;
    if (sx + w < -40 || sx - w > cw + 40 || sy + h < -40 || sy - h > ch + 40) continue;

    // Construction dust — unfinished buildings
    if (!b.completed) {
      const dustN = cam.zoom > 0.7 ? 5 : 3;
      for (let i = 0; i < dustN; i++) {
        const phase = _time * 1.8 + b.id * 0.7 + i * 1.3;
        const px = sx + Math.sin(phase * 0.9 + i) * w * 0.35;
        const py = sy - h * 0.1 - ((phase * 12 + i * 7) % (h * 0.7));
        const a = 0.12 + (Math.sin(phase) * 0.5 + 0.5) * 0.18;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#d6d3d1';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1.2, 1.8 * cam.zoom), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      continue;
    }

    // Blacksmith forge heat (day or night) when order active or staffed
    if (b.type === BuildingType.Blacksmith && (forgeActive || b.occupants.length > 0)) {
      const pulse = 0.55 + Math.sin(_time * 5 + b.id) * 0.25;
      const heat = forgeActive ? 1 : 0.55;
      ctx.globalCompositeOperation = 'lighter';
      const gx = sx;
      const gy = sy + h * 0.05;
      const r = Math.max(w, h) * (0.55 + pulse * 0.15);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, `rgba(255, 160, 40, ${0.45 * heat * pulse})`);
      g.addColorStop(0.4, `rgba(255, 80, 20, ${0.18 * heat})`);
      g.addColorStop(1, 'rgba(255, 40, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // Rising sparks when forging
      if (forgeActive && cam.zoom > 0.45) {
        for (let i = 0; i < 4; i++) {
          const t = (_time * 2.2 + b.id + i * 0.55) % 1.4;
          const px = sx + Math.sin(_time * 3 + i * 2 + b.id) * w * 0.15;
          const py = sy - h * 0.15 - t * h * 0.55;
          ctx.globalAlpha = (1 - t / 1.4) * 0.7;
          ctx.fillStyle = i % 2 === 0 ? '#fbbf24' : '#fb923c';
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1, 1.4 * cam.zoom), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Chimney smoke — homes always subtle; stronger at night
    if (
      (b.type === BuildingType.House || b.type === BuildingType.Mansion || b.type === BuildingType.Hotel)
      && cam.zoom > 0.4
    ) {
      const strength = night ? 0.28 : 0.14;
      const chimX = sx + w * 0.22;
      const chimY = sy - h * 0.38;
      for (let i = 0; i < 3; i++) {
        const phase = _time * 1.1 + b.id * 0.4 + i * 0.9;
        const drift = Math.sin(phase) * (3 + i);
        const rise = ((phase * 16 + i * 11) % 28);
        const smokeY = chimY - rise;
        const r = (2.2 + i * 0.9) * cam.zoom;
        ctx.globalAlpha = strength * (1 - rise / 30);
        ctx.fillStyle = night ? '#94a3b8' : '#cbd5e1';
        ctx.beginPath();
        ctx.arc(chimX + drift, smokeY, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Lumber mill / quarry / mine light industrial dust when staffed
    if (
      (b.type === BuildingType.LumberMill || b.type === BuildingType.Quarry || b.type === BuildingType.Mine)
      && b.occupants.length > 0
      && cam.zoom > 0.5
    ) {
      for (let i = 0; i < 3; i++) {
        const phase = _time * 1.4 + b.id + i;
        const px = sx + Math.sin(phase) * w * 0.3;
        const py = sy - ((phase * 10) % (h * 0.4));
        ctx.globalAlpha = 0.1 + (Math.sin(phase * 2) * 0.5 + 0.5) * 0.1;
        ctx.fillStyle = b.type === BuildingType.LumberMill ? '#a8a29e' : '#d6d3d1';
        ctx.beginPath();
        ctx.arc(px, py, 1.5 * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
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
  for (const [id, partnerId] of _cachedPartnerById) {
    if (id > partnerId) continue;
    const h = humanById.get(id);
    const p = humanById.get(partnerId);
    if (!h || !p) continue;
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
  const valid = state.buildGhost.valid;
  const bob = Math.sin(_time * 3.2) * Math.max(1.5, 2.5 * state.camera.zoom);
  const pulse = 0.55 + Math.sin(_time * 4.5) * 0.2;

  // Soft outer glow ring (valid green / invalid red)
  ctx.save();
  const glow = ctx.createRadialGradient(sx, sy, Math.min(w, h) * 0.2, sx, sy, Math.max(w, h) * 0.85);
  glow.addColorStop(0, valid ? `rgba(52, 211, 153, ${0.22 * pulse})` : `rgba(248, 113, 113, ${0.2 * pulse})`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(sx, sy + h * 0.05, w * 0.72, h * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ground projection of footprint
  ctx.save();
  ctx.fillStyle = valid ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.24)';
  ctx.beginPath();
  ctx.ellipse(sx + 2, sy + h * 0.28, w * 0.55, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Solid footprint rectangle outline (clear bounds)
  const fx0 = sx - w / 2;
  const fy0 = sy - h / 2 + bob * 0.3;
  ctx.save();
  ctx.lineWidth = Math.max(2, 2.5 * state.camera.zoom);
  ctx.strokeStyle = valid ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)';
  ctx.setLineDash([]);
  ctx.strokeRect(fx0 - 1, fy0 - 1, w + 2, h + 2);
  // Inner dashed
  ctx.lineWidth = Math.max(1, 1.2 * state.camera.zoom);
  ctx.strokeStyle = valid ? 'rgba(167, 243, 208, 0.85)' : 'rgba(254, 202, 202, 0.85)';
  ctx.setLineDash([Math.max(4, 5 / state.camera.zoom), Math.max(3, 4 / state.camera.zoom)]);
  ctx.strokeRect(fx0 + 2, fy0 + 2, w - 4, h - 4);
  ctx.setLineDash([]);
  ctx.restore();

  // Category-colored raised pad with validity tint
  const tint = valid ? cfg.backgroundColor : '#7f1d1d';
  const border = valid ? darkerColor(tint, 0.4) : '#ef4444';
  const dash = categoryBorderDashForType(state.buildMode);
  const pad = Math.max(2, Math.min(w, h) * 0.1);
  drawBuildingPad(ctx, cfg.padShape, sx, sy + h * 0.08, w + pad * 2, (h + pad * 2) * 0.7, tint, border, 0.55, dash, 2);

  // Floating ghost sprite (hover bob)
  const previewFrame = getSpriteFrame(cfg.sprite);
  ctx.globalAlpha = 0.78;
  if (previewFrame) {
    drawBuildingSprite(
      ctx, state.buildMode, previewFrame, sx, sy - h * 0.06 + bob, w, h, 1,
      state.buildRotation,
      cfg.spriteDisplayScale ?? DEFAULT_SPRITE_DISPLAY_SCALE,
    );
  } else {
    ctx.fillStyle = valid ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)';
    ctx.fillRect(sx - w / 2, sy - h / 2 + bob, w, h);
  }
  ctx.globalAlpha = 1;

  // Thick corner brackets
  const x0 = sx - w / 2 - 5;
  const y0 = sy - h / 2 - 5 + bob;
  const x1 = sx + w / 2 + 5;
  const y1 = sy + h / 2 + 5 + bob;
  const arm = Math.max(8, Math.min(w, h) * 0.28);
  ctx.strokeStyle = valid ? 'rgba(74, 222, 128, 1)' : 'rgba(248, 113, 113, 1)';
  ctx.lineWidth = Math.max(2.2, 2.8 * state.camera.zoom);
  ctx.lineCap = 'square';
  ctx.shadowColor = valid ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.65)';
  ctx.shadowBlur = 6;
  const corners: [number, number, number, number, number, number][] = [
    [x0, y0 + arm, x0, y0, x0 + arm, y0],
    [x1 - arm, y0, x1, y0, x1, y0 + arm],
    [x0, y1 - arm, x0, y1, x0 + arm, y1],
    [x1 - arm, y1, x1, y1, x1, y1 - arm],
  ];
  ctx.beginPath();
  for (const [ax, ay, bx, by, cx2, cy2] of corners) {
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx2, cy2);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Status label under footprint
  ctx.font = `bold ${Math.max(10, Math.round(11 * state.camera.zoom))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const label = valid ? '✓ Place' : '✗ Blocked';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const tw = ctx.measureText(label).width;
  ctx.fillRect(sx - tw / 2 - 5, y1 + 4, tw + 10, 16);
  ctx.fillStyle = valid ? '#6ee7b7' : '#fca5a5';
  ctx.fillText(label, sx, y1 + 6);
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
        vx: w === WeatherType.Storm ? (Math.random() - 0.2) * 4 : (Math.random() - 0.5) * 1.2,
        vy: w === WeatherType.Snow ? 0.6 + Math.random() * 1.2 : 4 + Math.random() * 5,
        s: w === WeatherType.Snow ? 2 + Math.random() * 2.5 : 1.2 + Math.random() * 1.5,
        a: 0.45 + Math.random() * 0.45,
      });
    }
    lastWeatherCw = cw;
    lastWeatherCh = ch;
  }
  for (const p of wParts) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y > ch * 1.3) {
      p.y = -10;
      p.x = Math.random() * cw * 1.5 - cw * 0.25;
    }
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

/** Subtle animated shimmer on water tiles (rivers/lakes) — only close enough to read. */
function drawWaterShimmer(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const map = state.worldMap;
  if (!map || state.camera.zoom < 1.4 || !state.juiceEffectsEnabled) return;
  const cam = state.camera;
  const ts = TERRAIN_TILE_SIZE;
  const z = cam.zoom;
  const tx0 = Math.max(0, Math.floor((cam.x - cw / (2 * z)) / ts));
  const tx1 = Math.min(map.width - 1, Math.floor((cam.x + cw / (2 * z)) / ts));
  const ty0 = Math.max(0, Math.floor((cam.y - ch / (2 * z)) / ts));
  const ty1 = Math.min(map.height - 1, Math.floor((cam.y + ch / (2 * z)) / ts));
  if (tx1 - tx0 > 90 || ty1 - ty0 > 90) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile || !isWaterTerrainType(tile.type)) continue;
      const sx = (tx * ts - cam.x) * z + cw / 2;
      const sy = (ty * ts - cam.y) * z + ch / 2;
      const sw = ts * z;
      const phase = _time * 0.5 + (tx * 7 + ty * 13);
      const p1 = phase % 1;
      const p2 = (phase + 0.55) % 1;
      const alpha = 0.09 + Math.sin(_time * 2.1 + tx + ty * 0.7) * 0.04;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(sx + p1 * sw, sy + sw * 0.32, sw * 0.22, Math.max(1, sw * 0.045));
      ctx.fillRect(sx + p2 * sw, sy + sw * 0.66, sw * 0.16, Math.max(1, sw * 0.045));
    }
  }
  ctx.restore();
}

interface SeasonParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  sway: number;
}

let seasonParts: SeasonParticle[] = [];
let seasonPartsSeason: Season | null = null;

function newSeasonParticle(cw: number, ch: number, season: Season): SeasonParticle {
  const fall = season === Season.Fall;
  return {
    x: Math.random() * cw,
    y: Math.random() * ch,
    vx: (Math.random() - 0.25) * (fall ? 0.4 : 0.16),
    vy: fall ? 0.22 + Math.random() * 0.3 : 0.12 + Math.random() * 0.2,
    size: fall ? 1.6 + Math.random() * 2.2 : 1 + Math.random() * 1.2,
    sway: Math.random() * 10,
  };
}

/** Fall leaves + winter ambient snow-dust — season juice, independent of weather. */
function drawSeasonParticles(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const active = state.season === Season.Fall
    || (state.season === Season.Winter && state.weather === WeatherType.Clear);
  if (!active) {
    seasonParts = [];
    seasonPartsSeason = null;
    return;
  }
  if (seasonPartsSeason !== state.season || seasonParts.length === 0) {
    const n = Math.min(110, Math.floor((cw * ch) / 9000));
    seasonParts = [];
    for (let i = 0; i < n; i++) seasonParts.push(newSeasonParticle(cw, ch, state.season));
    seasonPartsSeason = state.season;
  }
  if (!state.juiceEffectsEnabled) return;
  const fall = state.season === Season.Fall;
  for (const p of seasonParts) {
    p.y += p.vy;
    p.x += p.vx + Math.sin(_time * 1.4 + p.sway) * 0.35;
    if (p.y > ch + 8 || p.x < -8 || p.x > cw + 8) {
      p.y = -8 - Math.random() * 8;
      p.x = Math.random() * cw;
    }
  }
  ctx.save();
  if (fall) {
    ctx.fillStyle = '#e8a24c';
    for (const p of seasonParts) {
      ctx.globalAlpha = 0.45 + Math.sin(_time * 3 + p.sway) * 0.18;
      ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
    }
  } else {
    ctx.fillStyle = '#ffffff';
    for (const p of seasonParts) {
      ctx.globalAlpha = 0.22 + Math.sin(_time * 2 + p.sway) * 0.1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawWeather(ctx: CanvasRenderingContext2D, w: WeatherType, cw: number, ch: number) {
  updateWeatherParticles(w, cw, ch);
  const weatherCfg = WEATHER_CONFIGS[w];
  // Tint first, then particles (fog/drought are overlay-only; rain/snow/storm draw both)
  if (weatherCfg.overlayAlpha > 0) {
    ctx.fillStyle = weatherOverlayStyle(weatherCfg.color, weatherCfg.overlayAlpha);
    ctx.fillRect(0, 0, cw, ch);
  }
  if (wParts.length === 0) return;

  ctx.save();
  if (w === WeatherType.Snow) {
    ctx.fillStyle = weatherCfg.color || '#fff';
    for (const p of wParts) {
      ctx.globalAlpha = Math.min(1, p.a + 0.15);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (w === WeatherType.Rain || w === WeatherType.Storm) {
    // Longer streaks so rain is obvious at normal zoom
    ctx.strokeStyle = weatherCfg.color;
    ctx.lineWidth = w === WeatherType.Storm ? 1.75 : 1.45;
    ctx.lineCap = 'round';
    ctx.globalAlpha = w === WeatherType.Storm ? 0.78 : 0.68;
    ctx.beginPath();
    const len = w === WeatherType.Storm ? 3.5 : 2.9;
    for (const p of wParts) {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * len, p.y + p.vy * len);
    }
    ctx.stroke();
  }
  ctx.restore();

  if (w === WeatherType.Storm && Math.random() < 0.008) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.35})`;
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
  // Build ghost is drawn live in renderGame (animated bob / brackets)
  drawAnimals(drawCtx, state, cw, ch, true);
  drawTradeRouteLines(drawCtx, state, cw, ch);
  drawRaidMarchLines(drawCtx, state, cw, ch);
  drawHuntChaseLines(drawCtx, state, cw, ch);
  drawHuntVisuals(drawCtx, state, cw, ch);
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
  if (
    existing
    && !entityLayerNeedsRebuild(existing, layerKey, cw, ch)
    && !entityLayerAnchorMoved(existing, state.camera, cw, ch)
  ) {
    paintEntityLayerTo(ctx, existing, state.camera);
    return;
  }

  const layer = beginEntityLayerPaint(layerKey, cw, ch, state.camera);
  const anchorCam = { ...state.camera, x: layer.anchorX, y: layer.anchorY, zoom: layer.anchorZoom };
  paintWorldEntityLayer(layer.ctx, { ...state, camera: anchorCam }, layer.width, layer.height);
  commitEntityLayerPaint(layerKey);
  paintEntityLayerTo(ctx, layer, state.camera);
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
  _cachedPartnerById.clear();
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
  drawBuildingActiveEffects(ctx, state, cw, ch);
  drawBuildPreview(ctx, state, cw, ch);
  drawEntityFlashOverlay(ctx, state, cw, ch);
  drawWeather(ctx, state.weather, cw, ch);
  drawWaterShimmer(ctx, state, cw, ch);
  drawSeasonParticles(ctx, state, cw, ch);

  if (isNightHour(state.hourOfDay)) {
    drawNightAtmosphere(ctx, state, cw, ch);
    drawNightBuildingGlow(ctx, state, cw, ch);
  } else {
    drawDayAtmosphere(ctx, state, cw, ch);
  }

  // Grid lines on top of all map sprites (underlay was hidden under trees/grass)
  drawGridTopOverlay(ctx, state, cw, ch);

  // Screen vignette — focuses the eye on the settlement
  drawScreenVignette(ctx, cw, ch, isNightHour(state.hourOfDay));

  if (state.renffrOmen) {
    drawRenffrOmen(ctx, state.renffrOmen, cw, ch, _time);
  }

  if (shake > 0.1) {
    ctx.restore();
  }
}

/** Cool blue night wash with stronger edges — leaves center readable for village glows. */
function drawNightAtmosphere(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const deep = state.hourOfDay >= 22 || state.hourOfDay < 4;
  const depth = deep ? 0.42 : 0.3;
  ctx.fillStyle = `rgba(6, 10, 28, ${depth * 0.85})`;
  ctx.fillRect(0, 0, cw, ch);
  const g = ctx.createRadialGradient(cw * 0.5, ch * 0.42, Math.min(cw, ch) * 0.12, cw * 0.5, ch * 0.5, Math.max(cw, ch) * 0.72);
  g.addColorStop(0, 'rgba(8, 12, 40, 0)');
  g.addColorStop(0.55, `rgba(8, 14, 40, ${depth * 0.35})`);
  g.addColorStop(1, `rgba(2, 4, 18, ${depth * 0.85})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}

/** Warm / seasonal day grade + soft directional key light (2.5D). */
function drawDayAtmosphere(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const hour = state.hourOfDay;
  let tint = 'rgba(255, 248, 230, 0.05)';
  if (hour < 8 || hour >= 18) {
    tint = 'rgba(255, 170, 90, 0.1)'; // dawn / dusk gold
  } else if (state.season === Season.Winter) {
    tint = 'rgba(190, 215, 245, 0.16)';
  } else if (state.season === Season.Fall) {
    tint = 'rgba(255, 175, 90, 0.14)';
  } else if (state.season === Season.Spring) {
    tint = 'rgba(200, 255, 180, 0.08)';
  } else if (state.season === Season.Summer) {
    tint = 'rgba(255, 230, 100, 0.14)'; // hot noon wash
  }
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, cw, ch);

  // NW sun beam wash — cooler in winter
  const sun = ctx.createLinearGradient(0, 0, cw * 0.85, ch);
  if (state.season === Season.Winter) {
    sun.addColorStop(0, 'rgba(200, 220, 255, 0.1)');
    sun.addColorStop(0.45, 'rgba(255,255,255,0)');
    sun.addColorStop(1, 'rgba(30, 40, 70, 0.1)');
  } else {
    sun.addColorStop(0, hour < 8 || hour >= 18 ? 'rgba(255, 200, 120, 0.08)' : 'rgba(255, 255, 240, 0.05)');
    sun.addColorStop(0.45, 'rgba(255,255,255,0)');
    sun.addColorStop(1, 'rgba(20, 30, 50, 0.06)');
  }
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, cw, ch);
}

function drawScreenVignette(ctx: CanvasRenderingContext2D, cw: number, ch: number, night: boolean) {
  const g = ctx.createRadialGradient(cw * 0.5, ch * 0.45, Math.min(cw, ch) * 0.22, cw * 0.5, ch * 0.52, Math.max(cw, ch) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(0.85, night ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.12)');
  g.addColorStop(1, night ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}


