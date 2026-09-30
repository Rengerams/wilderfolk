import { BuildingType, BUILDING_CONFIGS, EntityType } from '../gameTypes';
import type { Building } from '../gameTypes';
import { isDecorType } from '../beautyGrid';
import { categoryBorderDashForType } from '../buildCatalog';
import { drawProceduralDecor } from '../decorRender';
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
 * the sort order itself is stable between those two events (2026-09-21 audit, R-12).
 */
let sortedBuildingsKey: { array: readonly Building[]; count: number } | null = null;
let sortedBuildings: Building[] | null = null;

function completedDepthSortedBuildings(buildings: readonly Building[]): Building[] {
  let count = 0;
  for (const b of buildings) {
    if (b.completed && b.type !== BuildingType.Road && !ISO_PANEL_BUILDINGS.has(b.type)) count++;
  }
  if (sortedBuildings && sortedBuildingsKey?.array === buildings && sortedBuildingsKey.count === count) {
    return sortedBuildings;
  }
  const sorted = buildings
    .filter((b) => b.completed && b.type !== BuildingType.Road && !ISO_PANEL_BUILDINGS.has(b.type))
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

export function drawBuildings(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;

  function getBuildingScreenRect(b: typeof state.buildings[0]) {
    const sx = (b.x - cam.x) * cam.zoom + cw / 2;
    // Ride the 2.5D relief — the footprint base sits on the raised terrain
    const sy = (b.y - cam.y) * cam.zoom + ch / 2
      - terrainRiseAt(state.worldMap, b.x + b.width / 2, b.y + b.height) * cam.zoom;
    const w = b.width * cam.zoom;
    const h = b.height * cam.zoom;
    return { sx, sy, w, h };
  }

  const isHovered = (b: typeof state.buildings[0]) => state.hoveredBuilding?.id === b.id;

  // Roads first. The strip-centre index is collected **once** for the whole pass: it walks
  // every building and allocates an entry per strip, so calling `detectBuildingJunction` per
  // road turned one repaint into O(roads × buildings) work plus O(buildings) allocations per
  // road — and this whole layer repaints on every sim tick (audit `visuals-looks.md` D14).
  // Lazy so a village with no roads pays nothing.
  let roadStrips: ReturnType<typeof collectStripCenters> | null = null;
  for (const b of state.buildings) {
    if (b.type !== BuildingType.Road || !b.completed) continue;
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;
    const hover = isHovered(b);
    const rot = effectiveBuildingRotation(b.type, b.rotation);
    drawProceduralStripBuilding(ctx, b.type, sx, sy, w, h, rot, hover ? 1 : 0.92);
    const strips = (roadStrips ??= collectStripCenters(state.buildings, 'road'));
    const roadJunction = analyzeStripJunction(b.x, b.y, strips.hList, strips.vList, strips.along);
    if (roadJunction.kind !== 'end' && roadJunction.kind !== 'straight') {
      drawStripJunctionOverlay(ctx, b.type, sx, sy, w, h, roadJunction, hover ? 1 : 0.92);
    }
  }

  // Palisade walls, corners & gates (procedural — chains read clearly on the map)
  for (const b of state.buildings) {
    if (!ISO_PANEL_BUILDINGS.has(b.type) || !b.completed) continue;
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;
    const rot = effectiveBuildingRotation(b.type, b.rotation);
    const hover = isHovered(b);
    const alpha = hover ? 1 : 0.94;
    drawProceduralStripBuilding(ctx, b.type, sx, sy, w, h, rot, alpha);
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
    // The authoritative completeness value only changes once per colony day, so the pad, the bar
    // and the number are drawn from the smoothed display value: otherwise they stand still for a
    // whole game day (48 real seconds at 1x) and then jump.
    const shownProgress = displayedConstructionProgress(b, state.tick);
    drawBuildingPad(ctx, cfg.padShape, sx, sy, w, h, tint, border, hover ? 0.45 : 0.28, dash, 1.5);
    const rot = effectiveBuildingRotation(b.type, b.rotation);
    if (isStripBuildType(b.type)) {
      drawProceduralStripBuilding(ctx, b.type, sx, sy, w, h, rot, 0.55);
    } else if (isDecorType(b.type)) {
      drawProceduralDecor(ctx, b.type, sx, sy, w, h, 0.75);
    } else {
      const frame = getSpriteFrame(cfg.sprite);
      if (frame) {
        // Construction builds up — the frame grows from scaffold to full size.
        const buildScale = Math.max(0.35, 0.45 + 0.55 * (shownProgress / 100));
        drawBuildingSprite(
          ctx, b.type, frame, sx, sy, w, h,
          Math.max(buildScale, b.spriteScale || 0.55),
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

  // Completed buildings (roads and wall panels already drawn above)
  for (const b of completedDepthSortedBuildings(state.buildings)) {
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;

    const cfg = BUILDING_CONFIGS[b.type];
    const frame = getSpriteFrame(cfg.sprite);
    const sel = state.selectedBuilding?.id === b.id;
    const hover = isHovered(b);

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
      ctx.fillStyle = '#e7e5e4';
      ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
      ctx.strokeStyle = sel ? tint : '#a8a29e';
      ctx.lineWidth = sel ? 3 : 1;
      ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
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
      const { sx, sy, w, h } = getBuildingScreenRect(building);
      const pad = Math.max(3, 4 * cam.zoom);
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(2, 2.5 * cam.zoom);
      ctx.setLineDash([Math.max(4, 6 * cam.zoom), Math.max(3, 4 * cam.zoom)]);
      // `getBuildingScreenRect` returns **centre-x / bottom-y**, not a centre — it is the anchor the
      // sprite itself is drawn from, so the art rises off the footprint base (the convention
      // `buildPreview.ts:23` and `grid.ts:331` both record). Treating it as a centre and subtracting
      // half the footprint put this ring a half-footprint up and to the left of the building, which
      // is the offset the owner reported. Build the rect from the base instead: the box spans the
      // footprint horizontally around `sx`, and vertically **upward** from the base line `sy`.
      ctx.strokeRect(
        sx - w / 2 - pad,
        sy - h - pad,
        w + pad * 2,
        h + pad * 2,
      );
      ctx.restore();
    };
    ring(selected.residenceBuildingId, '#38bdf8'); // home — sky blue
    ring(selected.homeBuildingId, '#facc15'); // workplace — amber
  }
}

