import { BUILDING_CONFIGS } from '../buildings';
import { getBuildingFootprintForType } from '../buildingRotation';
import { categoryBorderDashForType } from '../buildCatalog';
import { getSpriteFrame } from '../spriteLoader';
import { isStripBuildType } from '../stripBuild';
import type { RenderSnapshot } from '../renderSnapshot';
import { darkerColor, DEFAULT_SPRITE_DISPLAY_SCALE, renderTime } from './shared';
import { drawBuildingPad, drawBuildingSprite } from './spriteDrawing';

// ============ BUILD PREVIEW ============
export function drawBuildPreview(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
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
  const bob = Math.sin(renderTime * 3.2) * Math.max(1.5, 2.5 * state.camera.zoom);
  const pulse = 0.55 + Math.sin(renderTime * 4.5) * 0.2;

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
      cfg.spriteAnchorY,
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
