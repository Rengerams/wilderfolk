import type { RenderSnapshot } from '../renderSnapshot';

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

export function drawParticles(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
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
