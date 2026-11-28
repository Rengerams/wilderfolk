import { FLOATING_TEXT_FADE_TICKS, type Camera } from '../gameTypes';
import type { RenderSnapshot } from '../renderSnapshot';
import { _cachedHumans, _cachedPartnerById } from './entityCache';
// ============ FLOATING TEXTS ============
export function drawFloatingTexts(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
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
    const fadeOut = ft.life < FLOATING_TEXT_FADE_TICKS ? ft.life / FLOATING_TEXT_FADE_TICKS : 1;
    ctx.globalAlpha = Math.min(1, lifeRatio * fadeOut);
    ctx.fillStyle = ft.color;
    ctx.font = `bold ${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, sx, sy + offsetY);
  }
  ctx.restore();
}

// ============ ECOSYSTEM CONNECTIONS ============
export function drawEcoConnections(ctx: CanvasRenderingContext2D, _state: RenderSnapshot, cam: Camera, cw: number, ch: number) {
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
    const halfSpan = Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    if (midX + halfSpan < -50 || midX - halfSpan > cw + 50) continue;
    if (midY + halfSpan < -50 || midY - halfSpan > ch + 50) continue;

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
