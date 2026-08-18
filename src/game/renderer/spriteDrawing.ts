import { BuildingType, type Entity } from '../gameTypes';
import type { BuildingRotation } from '../buildingRotation';
import { getHumanWalkBob } from '../humanSprites';
import type { SpriteFrame } from '../spriteLoader';
import {
  DEFAULT_SPRITE_DISPLAY_SCALE,
  ISO_PANEL_BUILDINGS,
  parseHexRgb,
  roundRect,
  rgbaFromRgb,
} from './shared';

export interface SpriteMotion {
  bobY?: number;
  scaleX?: number;
  scaleY?: number;
}

export function drawSpriteFrame(
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

export function getHumanWalkMotion(human: Entity, camZoom: number, hasWalkFrame: boolean, walkFrame: number): SpriteMotion {
  const speed = Math.hypot(human.vx, human.vy);
  if (speed < 0.08) return {};
  if (hasWalkFrame) {
    return { bobY: getHumanWalkBob(walkFrame, speed, camZoom) };
  }
  const stride = Math.min(1, speed / 1.4);
  const phase = (human.animFrame ?? 0) * 1.9 + human.id * 0.15;
  return { bobY: Math.abs(Math.sin(phase)) * stride * 2.8 * camZoom };
}

export function getBuildingSpriteDrawBounds(
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

export function drawBuildingSprite(
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

/** Soft ambient-occlusion pool — darkens the ground right under an object. */
export function drawGroundAO(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  strength: number,
): void {
  if (radius <= 0) return;
  const grad = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
  grad.addColorStop(0, `rgba(10, 15, 8, ${strength})`);
  grad.addColorStop(1, 'rgba(10, 15, 8, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Procedural level upgrades (no new art) — an upgraded building reads at a
 * glance: Lv2 gets a warm fresh roof + a chimney, Lv3 a stronger roof and a
 * soft gold rim. Overlays the footprint rect, safe for every sprite shape.
 */
export function drawBuildingLevelUpgrades(
  ctx: CanvasRenderingContext2D,
  level: number,
  sx: number,
  sy: number,
  w: number,
  h: number,
  zoom: number,
): void {
  if (level < 2 || w < 6 || h < 6) return;
  const roofH = Math.max(3, h * 0.2);
  ctx.save();
  // Fresh-roof wash across the top of the building
  ctx.fillStyle = level >= 3 ? 'rgba(251,191,36,0.30)' : 'rgba(251,191,36,0.16)';
  ctx.fillRect(sx - w / 2, sy - h / 2, w, roofH);
  // Roof ridge highlight
  ctx.fillStyle = level >= 3 ? 'rgba(255,242,190,0.55)' : 'rgba(255,242,190,0.32)';
  ctx.fillRect(sx - w / 2, sy - h / 2, w, Math.max(1, 1.2 * zoom));
  // Chimney stack, top-right
  const chW = Math.max(2, w * 0.09);
  const chH = Math.max(3, roofH * 0.6);
  const chX = sx + w / 2 - chW * 1.5;
  ctx.fillStyle = level >= 3 ? '#6f4a2f' : '#8b5e3c';
  ctx.fillRect(chX, sy - h / 2 - chH * 0.5, chW, chH);
  ctx.fillStyle = '#e9d9ae';
  ctx.fillRect(chX, sy - h / 2 - chH * 0.5, chW, Math.max(1, zoom));
  // Lv3 — soft gold rim so the upgrade reads even zoomed out
  if (level >= 3) {
    ctx.strokeStyle = 'rgba(250,204,21,0.35)';
    ctx.lineWidth = Math.max(1.5, 2 * zoom);
    ctx.shadowColor = 'rgba(250,204,21,0.6)';
    ctx.shadowBlur = Math.max(4, 6 * zoom);
    ctx.strokeRect(sx - w / 2 - 1, sy - h / 2 - 1, w + 2, h + 2);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/**
 * Level-based visual upgrade without new art: Lv2+ gets a gold trim ring on the
 * raised pad, Lv3+ adds a small gold pennant. Only drawn for player buildings.
 */
export function drawBuildingLevelMark(
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

/**
 * Raised foundation pad — top face + south “wall” + soft cast shadow (2.5D tabletop).
 */
export function drawBuildingPad(
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
