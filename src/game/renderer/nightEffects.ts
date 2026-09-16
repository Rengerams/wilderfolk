
import { BuildingType } from '../buildings';
import type { RenderSnapshot } from '../renderSnapshot';
import { renderTime } from './shared';

// ============ NIGHT BUILDING GLOW ============
/** Disabled: day and night visual differences are removed. */
export function drawNightBuildingGlow(
  _ctx: CanvasRenderingContext2D,
  _state: RenderSnapshot,
  _cw: number,
  _ch: number,
): void {}

/**
 * Polish effects: forge fire pulse, house chimney smoke, blacksmith heat, and work dust.
 * Drawn every frame (outside entity-layer cache) so motion stays smooth.
 */
export function drawBuildingActiveEffects(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
): void {
  if (!state.juiceEffectsEnabled || state.camera.zoom < 0.35) return;
  const cam = state.camera;
  const forgeActive = !!state.villageForge?.activeOrder;

  ctx.save();
  for (const b of state.buildings) {
    if (b.faction === 'rival') continue;
    const sx = (b.x - cam.x) * cam.zoom + cw / 2;
    const sy = (b.y - cam.y) * cam.zoom + ch / 2;
    const w = b.width * cam.zoom;
    const h = b.height * cam.zoom;
    if (sx + w < -40 || sx - w > cw + 40 || sy + h < -40 || sy - h > ch + 40) continue;

    // Construction dust — unfinished buildings
    if (!b.completed) {
      const dustN = cam.zoom > 0.7 ? 5 : 3;
      for (let i = 0; i < dustN; i++) {
        const phase = renderTime * 1.8 + b.id * 0.7 + i * 1.3;
        const px = sx + Math.sin(phase * 0.9 + i) * w * 0.35;
        const py = sy - h * 0.1 - ((phase * 12 + i * 7) % (h * 0.7));
        const a = 0.12 + (Math.sin(phase) * 0.5 + 0.5) * 0.18;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#d6d3d1';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1.2, 1.8 * cam.zoom), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      continue;
    }

    // Blacksmith forge heat when order active or staffed
    if (b.type === BuildingType.Blacksmith && (forgeActive || b.occupants.length > 0)) {
      const pulse = 0.55 + Math.sin(renderTime * 5 + b.id) * 0.25;
      const heat = forgeActive ? 1 : 0.55;
      ctx.globalCompositeOperation = 'lighter';
      const gx = sx;
      const gy = sy + h * 0.05;
      const r = Math.max(w, h) * (0.55 + pulse * 0.15);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, `rgba(255, 160, 40, ${0.45 * heat * pulse})`);
      g.addColorStop(0.4, `rgba(255, 80, 20, ${0.18 * heat})`);
      g.addColorStop(1, 'rgba(255, 40, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // Rising sparks when forging
      if (forgeActive && cam.zoom > 0.45) {
        for (let i = 0; i < 4; i++) {
          const t = (renderTime * 2.2 + b.id + i * 0.55) % 1.4;
          const px = sx + Math.sin(renderTime * 3 + i * 2 + b.id) * w * 0.15;
          const py = sy - h * 0.15 - t * h * 0.55;
          ctx.globalAlpha = (1 - t / 1.4) * 0.7;
          ctx.fillStyle = i % 2 === 0 ? '#fbbf24' : '#fb923c';
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1, 1.4 * cam.zoom), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Chimney smoke — constant standard appearance
    if (
      (b.type === BuildingType.House || b.type === BuildingType.Mansion || b.type === BuildingType.Hotel)
      && cam.zoom > 0.4
    ) {
      const strength = 0.14;
      const chimX = sx + w * 0.22;
      const chimY = sy - h * 0.38;
      for (let i = 0; i < 3; i++) {
        const phase = renderTime * 1.1 + b.id * 0.4 + i * 0.9;
        const drift = Math.sin(phase) * (3 + i);
        const rise = ((phase * 16 + i * 11) % 28);
        const smokeY = chimY - rise;
        const r = (2.2 + i * 0.9) * cam.zoom;
        ctx.globalAlpha = strength * (1 - rise / 30);
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(chimX + drift, smokeY, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Lumber mill / quarry / mine light industrial dust when staffed
    if (
      (b.type === BuildingType.LumberMill || b.type === BuildingType.Quarry || b.type === BuildingType.Mine)
      && b.occupants.length > 0
      && cam.zoom > 0.5
    ) {
      for (let i = 0; i < 3; i++) {
        const phase = renderTime * 1.4 + b.id + i;
        const px = sx + Math.sin(phase) * w * 0.3;
        const py = sy - ((phase * 10) % (h * 0.4));
        ctx.globalAlpha = 0.1 + (Math.sin(phase * 2) * 0.5 + 0.5) * 0.1;
        ctx.fillStyle = b.type === BuildingType.LumberMill ? '#a8a29e' : '#d6d3d1';
        ctx.beginPath();
        ctx.arc(px, py, 1.5 * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
