import { BuildingType, BUILDING_CONFIGS, BUILDING_JOB_TYPES } from '../gameTypes';
import type { Building, Camera } from '../gameTypes';
import { isDecorType } from '../beautyGrid';
import { categoryBorderDashForType } from '../buildCatalog';
import { drawProceduralDecor } from '../decorRender';
import { getBuildingFootprintRect } from '../buildingGeometry';
import { effectiveBuildingRotation } from '../buildingRotation';
import { displayedConstructionProgress } from '../buildingProgressDisplay';
import type { RenderSnapshot } from '../renderSnapshot';
import { getSpriteFrame } from '../spriteLoader';
import {
  drawProceduralStripBuilding,
  drawStripJunctionOverlay,
} from '../stripRender';
import { isStripBuildType } from '../stripBuild';
import { analyzeStripJunction, collectStripCenters } from '../stripJunction';
import { terrainRiseAt } from '../terrainAtlas';
import { darkerColor, DEFAULT_SPRITE_DISPLAY_SCALE, ISO_PANEL_BUILDINGS } from './shared';
import {
  drawBuildingLevelMark,
  drawBuildingLevelUpgrades,
  drawBuildingPad,
  drawBuildingSprite,
  drawContactShadow,
  drawGroundAO,
} from './spriteDrawing';

let sortedBuildingsKey: { array: readonly Building[]; count: number } | null = null;
let sortedBuildings: Building[] | null = null;

export function isHighlightableBuilding(b: Building): boolean {
  return b.completed && b.type !== BuildingType.Road && !ISO_PANEL_BUILDINGS.has(b.type);
}

function completedDepthSortedBuildings(buildings: readonly Building[]): Building[] {
  let count = 0;
  for (const b of buildings) {
    if (isHighlightableBuilding(b)) count++;
  }
  if (sortedBuildings && sortedBuildingsKey?.array === buildings && sortedBuildingsKey.count === count) {
    return sortedBuildings;
  }
  const sorted = buildings
    .filter((b) => isHighlightableBuilding(b))
    .sort((a, b) => {
      const depthA = a.y + a.height / 2;
      const depthB = b.y + b.height / 2;
      if (depthA !== depthB) return depthA - depthB;
      return a.id - b.id;
    });
  sortedBuildings = sorted;
  sortedBuildingsKey = { array: buildings, count };
  return sorted;
}

export function footprintGroundRise(
  map: RenderSnapshot['worldMap'],
  footprint: Pick<Building, 'x' | 'y' | 'width' | 'height'>,
): number {
  return terrainRiseAt(map, footprint.x, getBuildingFootprintRect(footprint).bottom);
}

export function getBuildingScreenRect(
  b: Pick<Building, 'x' | 'y' | 'width' | 'height'>,
  state: RenderSnapshot,
  cam: Camera,
  cw: number,
  ch: number,
): { sx: number; sy: number; w: number; h: number } {
  const sx = (b.x - cam.x) * cam.zoom + cw / 2;
  const sy = (b.y - cam.y) * cam.zoom + ch / 2
    - footprintGroundRise(state.worldMap, b) * cam.zoom;
  return { sx, sy, w: b.width * cam.zoom, h: b.height * cam.zoom };
}

export function getBuildingFootprintScreenRect(
  b: Pick<Building, 'x' | 'y' | 'width' | 'height'>,
  state: RenderSnapshot,
  cam: Camera,
  cw: number,
  ch: number,
): { left: number; top: number; right: number; bottom: number } {
  const { sx, sy } = getBuildingScreenRect(b, state, cam, cw, ch);
  const rect = getBuildingFootprintRect(b);
  return {
    left: sx + (rect.left - b.x) * cam.zoom,
    top: sy + (rect.top - b.y) * cam.zoom,
    right: sx + (rect.right - b.x) * cam.zoom,
    bottom: sy + (rect.bottom - b.y) * cam.zoom,
  };
}

export interface BuildingHighlightStyle {
  stroke: string;
  lineWidth: number;
  pad: number;
  fill?: string;
  dash?: number[];
  shadowBlur?: number;
}

export function drawBuildingHighlightRing(
  _ctx: CanvasRenderingContext2D,
  _rect: { left: number; top: number; right: number; bottom: number },
  _style: BuildingHighlightStyle,
): void {
  // VOLLEDIG UITGESCHAKELD: tekent nooit meer kaders om gebouwen.
  return;
}

const ROAD_STRIP_ALPHA = 0.92;
const WALL_PANEL_ALPHA = 0.94;
const STRIP_HOVER_ALPHA = 1;
const CONSTRUCTION_PAD_ALPHA = 0.28;
const CONSTRUCTION_HOVER_PAD_ALPHA = 0.45;

export function hoverTintKindFor(building: Building): 'strip' | 'pad' | null {
  if (!building.completed) return 'pad';
  if (building.type === BuildingType.Road || ISO_PANEL_BUILDINGS.has(building.type)) return 'strip';
  return null;
}

function drawStripBuilding(
  ctx: CanvasRenderingContext2D,
  building: Building,
  rect: { sx: number; sy: number; w: number; h: number },
  strips: ReturnType<typeof collectStripCenters> | null,
  hover: boolean,
): void {
  const { sx, sy, w, h } = rect;
  const alpha = hover
    ? STRIP_HOVER_ALPHA
    : building.type === BuildingType.Road ? ROAD_STRIP_ALPHA : WALL_PANEL_ALPHA;
  const rot = effectiveBuildingRotation(building.type, building.rotation);
  drawProceduralStripBuilding(ctx, building.type, sx, sy, w, h, rot, alpha);
  if (building.type === BuildingType.WallGate && building.gateClosed === true) {
    // Mark the sealed opening on the same axis as the gate's physical footprint.
    ctx.save();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.22);
    ctx.beginPath();
    if (w >= h) {
      ctx.moveTo(sx - w * 0.34, sy);
      ctx.lineTo(sx + w * 0.34, sy);
    } else {
      ctx.moveTo(sx, sy - h * 0.34);
      ctx.lineTo(sx, sy + h * 0.34);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (!strips) return;
  const junction = analyzeStripJunction(building.x, building.y, strips.hList, strips.vList, strips.along);
  if (junction.kind !== 'end' && junction.kind !== 'straight') {
    drawStripJunctionOverlay(ctx, building.type, sx, sy, w, h, junction, alpha);
  }
}

function drawConstructionBody(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  building: Building,
  rect: { sx: number; sy: number; w: number; h: number },
  hover: boolean,
): void {
  const cam = state.camera;
  const { sx, sy, w, h } = rect;
  const cfg = BUILDING_CONFIGS[building.type];
  const tint = cfg.backgroundColor;
  const border = darkerColor(tint, 0.35);
  const dash = categoryBorderDashForType(building.type);
  const shownProgress = displayedConstructionProgress(building, state.tick);
  drawBuildingPad(
    ctx, cfg.padShape, sx, sy, w, h, tint, border,
    hover ? CONSTRUCTION_HOVER_PAD_ALPHA : CONSTRUCTION_PAD_ALPHA, dash, 1.5,
  );
  const rot = effectiveBuildingRotation(building.type, building.rotation);
  if (isStripBuildType(building.type)) {
    drawProceduralStripBuilding(ctx, building.type, sx, sy, w, h, rot, 0.55);
  } else if (isDecorType(building.type)) {
    drawProceduralDecor(ctx, building.type, sx, sy, w, h, 0.75);
  } else {
    const frame = cfg.sprite ? getSpriteFrame(cfg.sprite) : null;
    if (frame) {
      const buildScale = Math.max(0.35, 0.45 + 0.55 * (shownProgress / 100));
      drawBuildingSprite(
        ctx, building.type, frame, sx, sy, w, h,
        Math.max(buildScale, building.spriteScale || 0.55),
        rot,
        cfg.spriteDisplayScale ?? DEFAULT_SPRITE_DISPLAY_SCALE,
        cfg.spriteAnchorY,
      );
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(sx - w / 2, sy + h / 2 - 4, w, 4);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(sx - w / 2, sy + h / 2 - 4, w * (shownProgress / 100), 4);
  ctx.fillStyle = '#44403c';
  ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.floor(shownProgress)}%`, sx, sy + 3);
}

let lastBakedRoadStrips: ReturnType<typeof collectStripCenters> | null = null;

export function drawHoveredBuildingTint(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
): void {
  const hovered = state.hoveredBuilding;
  if (!hovered || hoverTintKindFor(hovered) === null) return;
  const rect = getBuildingScreenRect(hovered, state, state.camera, cw, ch);
  if (hovered.completed) {
    drawStripBuilding(ctx, hovered, rect, lastBakedRoadStrips, true);
    return;
  }
  drawConstructionBody(ctx, state, hovered, rect, true);
}

export function drawBuildings(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;

  let roadStrips: ReturnType<typeof collectStripCenters> | null = null;
  for (const b of state.buildings) {
    if (b.type !== BuildingType.Road || !b.completed) continue;
    const rect = getBuildingScreenRect(b, state, cam, cw, ch);
    if (rect.sx + rect.w < -20 || rect.sx - rect.w > cw + 20) continue;
    if (rect.sy + rect.h < -20 || rect.sy - rect.h > ch + 20) continue;
    roadStrips ??= collectStripCenters(state.buildings, 'road');
    drawStripBuilding(ctx, b, rect, roadStrips, false);
  }
  lastBakedRoadStrips = roadStrips;

  let wallStrips: ReturnType<typeof collectStripCenters> | null = null;
  for (const b of state.buildings) {
    if (!ISO_PANEL_BUILDINGS.has(b.type) || !b.completed) continue;
    const rect = getBuildingScreenRect(b, state, cam, cw, ch);
    if (rect.sx + rect.w < -20 || rect.sx - rect.w > cw + 20) continue;
    if (rect.sy + rect.h < -20 || rect.sy - rect.h > ch + 20) continue;
    wallStrips ??= collectStripCenters(state.buildings, 'wall');
    drawStripBuilding(ctx, b, rect, wallStrips, false);
  }

  for (const b of state.buildings) {
    if (b.completed) continue;
    const rect = getBuildingScreenRect(b, state, cam, cw, ch);
    if (rect.sx + rect.w < -20 || rect.sx - rect.w > cw + 20) continue;
    if (rect.sy + rect.h < -20 || rect.sy - rect.h > ch + 20) continue;
    drawConstructionBody(ctx, state, b, rect, false);
  }

  for (const b of completedDepthSortedBuildings(state.buildings)) {
    const { sx, sy, w, h } = getBuildingScreenRect(b, state, cam, cw, ch);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;

    const cfg = BUILDING_CONFIGS[b.type];
    const frame = cfg.sprite ? getSpriteFrame(cfg.sprite) : null;
    const sel = state.selectedBuilding?.id === b.id;

    drawContactShadow(
      ctx,
      sx,
      sy + h * 0.24,
      w * 0.48,
      h * 0.16,
      { offsetX: w * 0.08, offsetY: h * 0.08, alpha: 0.32, enhanced: state.juiceEffectsEnabled },
    );

    drawGroundAO(ctx, sx, sy + h * 0.34, Math.max(w, h) * 0.8, state.juiceEffectsEnabled ? 0.10 : 0.06);

    const isRival = b.faction === 'rival';
    const tint = isRival ? '#312e81' : cfg.backgroundColor;

    if (isDecorType(b.type)) {
      drawProceduralDecor(ctx, b.type, sx, sy - h * 0.04, w, h);
    } else if (frame) {
      drawBuildingSprite(
        ctx, b.type, frame, sx, sy - h * 0.04, w, h,
        b.spriteScale || 1,
        effectiveBuildingRotation(b.type, b.rotation),
        cfg.spriteDisplayScale ?? DEFAULT_SPRITE_DISPLAY_SCALE,
        cfg.spriteAnchorY,
      );
    } else {
      drawBuildingPad(
        ctx,
        cfg.padShape,
        sx,
        sy - h * 0.04,
        w,
        h,
        tint,
        darkerColor(tint, 0.35),
        sel ? 0.5 : 0.32,
        categoryBorderDashForType(b.type),
        sel ? 2 : 1,
      );
    }

    if (b.faction !== 'rival' && !isDecorType(b.type)) {
      drawBuildingLevelUpgrades(ctx, b.level, sx, sy, w, h, cam.zoom);
    }
    drawBuildingLevelMark(ctx, b.level, sx, sy, w, h, cam.zoom);

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

    // Geen selectiering of kaders meer

    if (b.level > 1) {
      ctx.fillStyle = '#b45309';
      ctx.font = `bold ${Math.max(7, 9 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`Lv${b.level}`, sx + w / 2 - 4, sy - h / 2 + 10);
    }

    if (b.health < b.maxHealth * 0.5) {
      const bw = w * 0.8;
      const bh = 3;
      const by = sy - h / 2 - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - bw / 2, by, bw, bh);
      ctx.fillStyle = b.health < b.maxHealth * 0.25 ? '#ef4444' : '#f59e0b';
      ctx.fillRect(sx - bw / 2, by, bw * (b.health / b.maxHealth), bh);
    }

    // Show empty staffed workplaces as 0 instead of hiding their staffing badge.
    // Non-workplaces keep their previous behavior; construction crews remain visible.
    if (cam.zoom > 0.8 && (b.occupants.length > 0 || (b.completed && !!BUILDING_JOB_TYPES[b.type] && b.faction !== 'rival'))) {
      const bs = Math.max(10, 12 * cam.zoom);
      const bx = sx + w / 2 - bs / 2;
      const by = sy + h / 2 - bs / 2;
      ctx.fillStyle = b.occupants.length > 0 ? '#2563eb' : '#475569';
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