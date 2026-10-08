import { BuildingType, BUILDING_CONFIGS, EntityType } from '../gameTypes';
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

/**
 * The last sorted-depth list, keyed by the buildings array identity **and** the count of buildings
 * that qualify for it.
 *
 * The key is deliberately not the array identity alone: `gameTick` mutates buildings in place, so a
 * construction finishing flips `completed` on the same array and must move the building from the
 * "under construction" pass into this list. The count is O(B) with a cheap predicate — cheaper than
 * the O(B log B) sort and the allocation it fed every repaint — while identity catches add/remove,
 * which replace the array. A placed building's geometry (`y`, `height`) and `type` never change, so
 * the sort order itself is stable between those two events.
 */
let sortedBuildingsKey: { array: readonly Building[]; count: number } | null = null;
let sortedBuildings: Building[] | null = null;

/** The buildings the completed pass depth-sorts and highlights: finished, not roads or wall panels. */
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

/** The relief under a building's ground: the bottom centre of its owner-defined footprint. */
export function footprintGroundRise(
  map: RenderSnapshot['worldMap'],
  footprint: Pick<Building, 'x' | 'y' | 'width' | 'height'>,
): number {
  return terrainRiseAt(map, footprint.x, getBuildingFootprintRect(footprint).bottom);
}

/** Screen anchor of a building: its footprint centre projected onto the sampled relief. */
function getBuildingScreenRect(
  b: Pick<Building, 'x' | 'y' | 'width' | 'height'>,
  state: RenderSnapshot,
  cam: Camera,
  cw: number,
  ch: number,
): { sx: number; sy: number; w: number; h: number } {
  const sx = (b.x - cam.x) * cam.zoom + cw / 2;
  // Ride the 2.5D relief — the footprint base sits on the raised terrain
  const sy = (b.y - cam.y) * cam.zoom + ch / 2
    - footprintGroundRise(state.worldMap, b) * cam.zoom;
  return { sx, sy, w: b.width * cam.zoom, h: b.height * cam.zoom };
}

/** The owner's footprint rect (`getBuildingFootprintRect`) in screen px, around that same anchor. */
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

/** Stroke of one building highlight — the click selection ring or the hover ring. */
export interface BuildingHighlightStyle {
  stroke: string;
  lineWidth: number;
  pad: number;
  fill?: string;
  dash?: number[];
  shadowBlur?: number;
}

/** The one ring painter, around a footprint rect from {@link getBuildingFootprintScreenRect}. */
export function drawBuildingHighlightRing(
  ctx: CanvasRenderingContext2D,
  rect: { left: number; top: number; right: number; bottom: number },
  style: BuildingHighlightStyle,
): void {
  const x = rect.left - style.pad;
  const y = rect.top - style.pad;
  const w = rect.right - rect.left + style.pad * 2;
  const h = rect.bottom - rect.top + style.pad * 2;
  ctx.save();
  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.lineWidth;
  if (style.dash) ctx.setLineDash(style.dash);
  if (style.shadowBlur) {
    ctx.shadowColor = style.stroke;
    ctx.shadowBlur = style.shadowBlur;
  }
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/** Baked strip opacity for a road segment and for a wall panel. */
const ROAD_STRIP_ALPHA = 0.92;
const WALL_PANEL_ALPHA = 0.94;
/** The hover tint repaints the same art at full opacity over its baked copy. */
const STRIP_HOVER_ALPHA = 1;
/** Foundation-pad opacity while a building is under construction, and the hover tint it takes. */
const CONSTRUCTION_PAD_ALPHA = 0.28;
const CONSTRUCTION_HOVER_PAD_ALPHA = 0.45;

/** Which hover tint a building gets: a repainted strip, a brighter foundation pad, or none. */
export function hoverTintKindFor(building: Building): 'strip' | 'pad' | null {
  if (!building.completed) return 'pad';
  if (building.type === BuildingType.Road || ISO_PANEL_BUILDINGS.has(building.type)) return 'strip';
  return null;
}

/**
 * One strip-painted building — a road segment or a wall panel, with a road's junction overlay.
 * `strips` is the pass's shared road index; `hover` is the tint, so the hover pass reuses this.
 */
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
  if (building.type !== BuildingType.Road || !strips) return;
  const roadJunction = analyzeStripJunction(building.x, building.y, strips.hList, strips.vList, strips.along);
  if (roadJunction.kind !== 'end' && roadJunction.kind !== 'straight') {
    drawStripJunctionOverlay(ctx, building.type, sx, sy, w, h, roadJunction, alpha);
  }
}

/**
 * One under-construction building: foundation pad, scaffold art and progress bar.
 * Split out so the per-frame hover pass repaints the same body at the hover pad opacity.
 */
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
  // The authoritative completeness value only changes once per colony day, so the pad, the bar
  // and the number are drawn from the smoothed display value: otherwise they stand still for a
  // whole game day (48 real seconds at 1x) and then jump.
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
      // Construction builds up — the frame grows from scaffold to full size.
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

  // Progress bar
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(sx - w / 2, sy + h / 2 - 4, w, 4);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(sx - w / 2, sy + h / 2 - 4, w * (shownProgress / 100), 4);
  ctx.fillStyle = '#44403c';
  ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.floor(shownProgress)}%`, sx, sy + 3);
}

/** Road strip index the last layer bake built, reused by the hover tint's junction overlay. */
let lastBakedRoadStrips: ReturnType<typeof collectStripCenters> | null = null;

/**
 * Hover tint for the building under the cursor, drawn per frame over the baked layer.
 * The layer key carries no hover, so a tint painted there waited for the next tick and never moved
 * while the game was paused.
 */
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

  // Roads first. The strip-centre index is collected **once** for the whole pass: it walks
  // every building and allocates an entry per strip, so calling `detectBuildingJunction` per
  // road turned one repaint into O(roads × buildings) work plus O(buildings) allocations per
  // road — and this whole layer repaints on every sim tick (audit `visuals-looks.md` D14).
  // Lazy so a village with no roads pays nothing.
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

  // Palisade walls, corners & gates (procedural — chains read clearly on the map)
  for (const b of state.buildings) {
    if (!ISO_PANEL_BUILDINGS.has(b.type) || !b.completed) continue;
    const rect = getBuildingScreenRect(b, state, cam, cw, ch);
    if (rect.sx + rect.w < -20 || rect.sx - rect.w > cw + 20) continue;
    if (rect.sy + rect.h < -20 || rect.sy - rect.h > ch + 20) continue;
    drawStripBuilding(ctx, b, rect, null, false);
  }

  // Under construction
  for (const b of state.buildings) {
    if (b.completed) continue;
    const rect = getBuildingScreenRect(b, state, cam, cw, ch);
    if (rect.sx + rect.w < -20 || rect.sx - rect.w > cw + 20) continue;
    if (rect.sy + rect.h < -20 || rect.sy - rect.h > ch + 20) continue;
    drawConstructionBody(ctx, state, b, rect, false);
  }

  // Completed buildings (roads and wall panels already drawn above)
  for (const b of completedDepthSortedBuildings(state.buildings)) {
    const { sx, sy, w, h } = getBuildingScreenRect(b, state, cam, cw, ch);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;

    const cfg = BUILDING_CONFIGS[b.type];
    const frame = cfg.sprite ? getSpriteFrame(cfg.sprite) : null;
    const sel = state.selectedBuilding?.id === b.id;

    // Shared long contact/cast shadow establishes one SE light direction for every visible subject.
    drawContactShadow(
      ctx,
      sx,
      sy + h * 0.24,
      w * 0.48,
      h * 0.16,
      { offsetX: w * 0.08, offsetY: h * 0.08, alpha: 0.32, enhanced: state.juiceEffectsEnabled },
    );

    // Soft ambient-occlusion pool — the ground darkens right under the pad.
    drawGroundAO(ctx, sx, sy + h * 0.34, Math.max(w, h) * 0.8, state.juiceEffectsEnabled ? 0.10 : 0.06);

    // Completed buildings already have a contact shadow and ambient occlusion
    // above. Do not paint a large category-coloured foundation here: it reads as
    // an opaque terrain slab and can extend far beyond the sprite footprint.
    // Foundations remain visible for incomplete buildings in the construction pass.
    const isRival = b.faction === 'rival';
    const tint = isRival ? '#312e81' : cfg.backgroundColor;

    if (isDecorType(b.type)) {
      drawProceduralDecor(ctx, b.type, sx, sy - h * 0.04, w, h);
    } else if (frame) {
      // Lift sprite slightly above pad so the footprint reads as a base.
      //
      // The rotation is the owner's `effectiveBuildingRotation`, so a type the player cannot rotate
      // draws upright even when an older save still stores a 90 on it — a Watchtower at 90 was drawn
      // lying on its side, which is what the `flipX` argument here used to paper over. That argument is
      // gone with the rotation; a rotatable type is unaffected.
      drawBuildingSprite(
        ctx, b.type, frame, sx, sy - h * 0.04, w, h,
        b.spriteScale || 1,
        effectiveBuildingRotation(b.type, b.rotation),
        cfg.spriteDisplayScale ?? DEFAULT_SPRITE_DISPLAY_SCALE,
        cfg.spriteAnchorY,
      );
    } else {
      // No loaded frame for this type (sprite absent or still in flight): draw the building's own
      // footprint pad so the fallback reads as the place the building stands, not a blank white box.
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

    // Procedural level upgrades — roof/chimney/gold rim so upgrades read at a glance
    if (b.faction !== 'rival' && !isDecorType(b.type)) {
      drawBuildingLevelUpgrades(ctx, b.level, sx, sy, w, h, cam.zoom);
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

    if (sel) {
      drawBuildingHighlightRing(ctx, getBuildingFootprintScreenRect(b, state, cam, cw, ch), {
        stroke: isRival ? '#a5b4fc' : '#6ee7b7',
        fill: isRival ? 'rgba(99, 102, 241, 0.12)' : 'rgba(16, 185, 129, 0.12)',
        lineWidth: 2.5,
        pad: 3,
        shadowBlur: 12,
      });
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

  // Selected settler → light up the two places the inspector names: where they live and where they
  // work. Both ids are already on the selected entity and the inspector reads the same pair
  // (`residenceBuildingId` is the HOME, `homeBuildingId` is the WORKPLACE — see the field-naming
  // note in `relationships.ts`), so this rings exactly the two buildings the panel is talking about
  // rather than a re-derived guess. Drawn last so the rings sit above every building pass.
  const selected = state.selectedEntity;
  if (selected != null && selected.type === EntityType.Human) {
    const ring = (id: number | undefined, stroke: string): void => {
      if (id == null) return;
      const building = state.buildings.find((candidate) => candidate.id === id);
      if (!building) return;
      // Both rings read the owner's footprint rect (`buildingGeometry`), so neither can sit half
      // a footprint off the building it marks.
      drawBuildingHighlightRing(ctx, getBuildingFootprintScreenRect(building, state, cam, cw, ch), {
        stroke,
        lineWidth: Math.max(2, 2.5 * cam.zoom),
        pad: Math.max(3, 4 * cam.zoom),
        dash: [Math.max(4, 6 * cam.zoom), Math.max(3, 4 * cam.zoom)],
      });
    };
    ring(selected.residenceBuildingId, '#38bdf8'); // home — sky blue
    ring(selected.homeBuildingId, '#facc15'); // workplace — amber
  }
}

