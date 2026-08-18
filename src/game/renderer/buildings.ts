import { BuildingType, BUILDING_CONFIGS } from '../gameTypes';
import { isDecorType } from '../beautyGrid';
import { categoryBorderDashForType } from '../buildCatalog';
import { drawProceduralDecor } from '../decorRender';
import { normalizeBuildingRotation } from '../buildingRotation';
import { isNightHour } from '../dayCycle';
import type { RenderSnapshot } from '../renderSnapshot';
import { getSpriteFrame } from '../spriteLoader';
import {
  drawProceduralStripBuilding,
  drawProceduralWallJunction,
  drawStripJunctionOverlay,
} from '../stripRender';
import { isStripBuildType } from '../stripBuild';
import { detectBuildingJunction } from '../stripJunction';
import { terrainRiseAt } from '../terrainAtlas';
import { darkerColor, DEFAULT_SPRITE_DISPLAY_SCALE, ISO_PANEL_BUILDINGS } from './shared';
import {
  drawBuildingLevelMark,
  drawBuildingLevelUpgrades,
  drawBuildingPad,
  drawBuildingSprite,
  drawGroundAO,
} from './spriteDrawing';

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
    } else if (isDecorType(b.type)) {
      drawProceduralDecor(ctx, b.type, sx, sy, w, h, isNightHour(state.hourOfDay), 0.75);
    } else {
      const frame = getSpriteFrame(cfg.sprite);
      if (frame) {
        // Construction builds up — the frame grows from scaffold to full size.
        const buildScale = Math.max(0.35, 0.45 + 0.55 * (b.constructionProgress / 100));
        drawBuildingSprite(
          ctx, b.type, frame, sx, sy, w, h,
          Math.max(buildScale, b.spriteScale || 0.55),
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

    // Soft ambient-occlusion pool — the ground darkens right under the pad.
    drawGroundAO(ctx, sx, sy + h * 0.34, Math.max(w, h) * 0.8, 0.10);

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

    if (isDecorType(b.type)) {
      drawProceduralDecor(ctx, b.type, sx, sy - h * 0.04, w, h, isNightHour(state.hourOfDay));
    } else if (frame) {
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
}

