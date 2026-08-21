import type { Camera } from '../gameTypes';
import type { RenderSnapshot } from '../renderSnapshot';
import { _cachedHumans, _cachedPartnerById } from './entityCache';

// ============ CAMP MARKERS ============
export function drawCampMarkers(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
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
      const action = rival.profile?.lastAction && rival.profile.lastAction !== 'none'
        ? rival.profile.lastAction.replace('_', ' ')
        : rival.peaceTreatyDays > 0 ? 'treaty' : 'quiet';
      ctx.fillText(`${rival.population} · ${rival.relationship} · ${action}`, sx, sy + Math.max(14, 18 * cam.zoom));
    }
  }
}

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
