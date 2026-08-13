/**
 * Procedural decor rendering (Phase 3.2) — gardens, statues, lamps draw with
 * canvas shapes so the feature ships without new art. Fences draw through the
 * strip path (stripRender.drawProceduralFence).
 */
import type { BuildingType } from './buildings';
import { BuildingType as BT } from './buildings';

function seeded(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Draw a decor building centered on its footprint box. */
export function drawProceduralDecor(
  ctx: CanvasRenderingContext2D,
  type: BuildingType,
  sx: number,
  sy: number,
  w: number,
  h: number,
  night: boolean,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);

  if (type === BT.Garden) {
    drawGarden(ctx, w, h);
  } else if (type === BT.Statue) {
    drawStatue(ctx, w, h);
  } else if (type === BT.Lamp) {
    drawLamp(ctx, w, h, night);
  }

  ctx.restore();
}

function drawGarden(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const hw = w / 2;
  const hh = h / 2;
  // Soil bed
  ctx.fillStyle = '#713f12';
  ctx.beginPath();
  ctx.ellipse(0, 0, hw * 0.94, hh * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  // Grass fringe
  ctx.strokeStyle = '#4d7c0f';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Flowers
  const flowers = 12;
  const colors = ['#f472b6', '#facc15', '#f87171', '#a78bfa', '#fb923c', '#ffffff'];
  for (let i = 0; i < flowers; i++) {
    const a = seeded(i) * Math.PI * 2;
    const r = seeded(i + 50) * Math.min(hw, hh) * 0.62;
    const fx = Math.cos(a) * r;
    const fy = Math.sin(a) * r * 0.8;
    const color = colors[i % colors.length];
    ctx.fillStyle = '#15803d';
    ctx.fillRect(fx - 0.8, fy + 2, 1.6, 3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(fx, fy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath();
    ctx.arc(fx, fy, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStatue(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const hh = h / 2;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, hh * 0.88, w * 0.34, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pedestal
  ctx.fillStyle = '#78716c';
  ctx.fillRect(-w * 0.22, hh * 0.4, w * 0.44, h * 0.3);
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(-w * 0.28, hh * 0.62, w * 0.56, h * 0.14);
  // Figure (head + cloak)
  ctx.fillStyle = '#d6d3d1';
  ctx.beginPath();
  ctx.arc(0, -hh * 0.4, w * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e7e5e4';
  ctx.beginPath();
  ctx.moveTo(0, hh * 0.42);
  ctx.lineTo(-w * 0.2, -hh * 0.1);
  ctx.lineTo(0, -hh * 0.55);
  ctx.lineTo(w * 0.2, -hh * 0.1);
  ctx.closePath();
  ctx.fill();
}

function drawLamp(ctx: CanvasRenderingContext2D, w: number, h: number, night: boolean): void {
  const hh = h / 2;
  // Glow at night
  if (night) {
    const g = ctx.createRadialGradient(0, -hh * 0.15, 2, 0, -hh * 0.15, w * 1.9);
    g.addColorStop(0, 'rgba(251,191,36,0.5)');
    g.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w * 2, -hh - w * 2, w * 4, w * 4);
  }
  // Post
  ctx.fillStyle = '#57534e';
  ctx.fillRect(-1.5, -hh * 0.75, 3, h * 0.85);
  // Base
  ctx.fillStyle = '#44403c';
  ctx.fillRect(-w * 0.16, hh * 0.12, w * 0.32, 3.5);
  // Lamp head
  ctx.fillStyle = night ? '#fbbf24' : '#78716c';
  ctx.fillRect(-w * 0.18, -hh * 0.78, w * 0.36, h * 0.12);
  ctx.fillStyle = night ? '#fde68a' : '#a8a29e';
  ctx.fillRect(-w * 0.12, -hh * 0.66, w * 0.24, h * 0.06);
}
