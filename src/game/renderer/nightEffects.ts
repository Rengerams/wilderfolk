import { BuildingType } from '../buildings';
import { isNightHour } from '../dayCycle';
import {
  getNightGlowIntensity,
  LIGHT_POOL_TYPES,
  NIGHT_HOME_GLOW_TYPES,
  NIGHT_STAFFED_GLOW_TYPES,
} from '../juiceEffects';
import type { RenderSnapshot } from '../renderSnapshot';
import { renderTime } from './shared';

// ============ NIGHT BUILDING GLOW ============
export function drawNightBuildingGlow(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!isNightHour(state.hourOfDay) || state.camera.zoom < 0.32 || !state.juiceEffectsEnabled) return;
  const cam = state.camera;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    const isPool = LIGHT_POOL_TYPES.has(b.type) && b.occupants.length > 0;
    const mayGlow = NIGHT_HOME_GLOW_TYPES.has(b.type)
      || (NIGHT_STAFFED_GLOW_TYPES.has(b.type) && b.occupants.length > 0)
      || isPool
      || b.level >= 3; // upgraded buildings glow softly at night
    if (!mayGlow) continue;
    const residentCount = NIGHT_HOME_GLOW_TYPES.has(b.type) ? b.occupants.length : 0;
    const intensity = isPool
      ? Math.min(0.85, 0.5 + b.level * 0.12)
      : b.level >= 3
        ? 0.3 // Lv3 non-pool glow — modest, reads as "well-kept and lit"
        : getNightGlowIntensity(b, residentCount);
    if (intensity <= 0) continue;

    const sx = (b.x - cam.x) * cam.zoom + cw / 2;
    const sy = (b.y - cam.y) * cam.zoom + ch / 2;
    const w = b.width * cam.zoom;
    const h = b.height * cam.zoom;
    if (sx + w < -50 || sx - w > cw + 50 || sy + h < -50 || sy - h > ch + 50) continue;

    const flicker = 0.82 + Math.sin(renderTime * 3.5 + b.id * 1.9) * 0.18;
    const warm = intensity * flicker;

    // Warm light pooling on the ground around community buildings (plaza glow).
    if (isPool) {
      const poolR = Math.max(16, (w + h) * 0.9);
      const poolY = sy + h * 0.42;
      const grad = ctx.createRadialGradient(sx, poolY, 0, sx, poolY, poolR);
      grad.addColorStop(0, `rgba(255, 196, 130, ${0.30 * warm})`);
      grad.addColorStop(0.55, `rgba(255, 150, 85, ${0.12 * warm})`);
      grad.addColorStop(1, 'rgba(255, 130, 60, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx - poolR, poolY - poolR, poolR * 2, poolR * 2);
    }

    if (NIGHT_HOME_GLOW_TYPES.has(b.type)) {
      const winW = Math.max(2.5, w * 0.09);
      const winH = Math.max(2.5, h * 0.11);
      const windows = [
        { ox: -w * 0.2, oy: -h * 0.06 },
        { ox: w * 0.06, oy: -h * 0.08 },
        ...(b.type === BuildingType.Mansion ? [{ ox: w * 0.22, oy: -h * 0.04 }] : []),
      ];
      for (const { ox, oy } of windows) {
        const grad = ctx.createRadialGradient(sx + ox, sy + oy, 0, sx + ox, sy + oy, winW * 2.8);
        grad.addColorStop(0, `rgba(255, 210, 140, ${0.6 * warm})`);
        grad.addColorStop(0.55, `rgba(255, 150, 60, ${0.2 * warm})`);
        grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx + ox - winW * 1.2, sy + oy - winH * 1.2, winW * 2.4, winH * 2.4);
      }

      const chimX = sx + w * 0.24;
      const chimY = sy - h * 0.36;
      const emberR = Math.max(2, 3 * cam.zoom);
      const chimGrad = ctx.createRadialGradient(chimX, chimY, 0, chimX, chimY - emberR * 2, emberR * 5);
      chimGrad.addColorStop(0, `rgba(255, 150, 60, ${0.75 * warm})`);
      chimGrad.addColorStop(0.35, `rgba(255, 90, 30, ${0.3 * warm})`);
      chimGrad.addColorStop(1, 'rgba(60, 30, 10, 0)');
      ctx.fillStyle = chimGrad;
      ctx.beginPath();
      ctx.arc(chimX, chimY, emberR * 4, 0, Math.PI * 2);
      ctx.fill();

      if (cam.zoom > 0.42) {
        const drift = Math.sin(renderTime * 1.2 + b.id) * 2;
        const smokeY = chimY - emberR * 3 - ((renderTime * 14 + b.id * 3) % 22);
        ctx.globalAlpha = 0.18 * warm;
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(chimX + drift, smokeY, emberR * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      const doorGrad = ctx.createRadialGradient(sx, sy + h * 0.12, 0, sx, sy + h * 0.12, w * 0.4);
      doorGrad.addColorStop(0, `rgba(255, 190, 110, ${0.4 * warm})`);
      doorGrad.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = doorGrad;
      ctx.beginPath();
      ctx.arc(sx, sy + h * 0.12, w * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Day + night polish: forge fire pulse, house chimney smoke, blacksmith heat.
 * Drawn every frame (outside entity-layer cache) so motion stays smooth.
 */
export function drawBuildingActiveEffects(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.juiceEffectsEnabled || state.camera.zoom < 0.35) return;
  const cam = state.camera;
  const forgeActive = !!state.villageForge?.activeOrder;
  const night = isNightHour(state.hourOfDay);

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

    // Blacksmith forge heat (day or night) when order active or staffed
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

    // Chimney smoke — homes always subtle; stronger at night
    if (
      (b.type === BuildingType.House || b.type === BuildingType.Mansion || b.type === BuildingType.Hotel)
      && cam.zoom > 0.4
    ) {
      const strength = night ? 0.28 : 0.14;
      const chimX = sx + w * 0.22;
      const chimY = sy - h * 0.38;
      for (let i = 0; i < 3; i++) {
        const phase = renderTime * 1.1 + b.id * 0.4 + i * 0.9;
        const drift = Math.sin(phase) * (3 + i);
        const rise = ((phase * 16 + i * 11) % 28);
        const smokeY = chimY - rise;
        const r = (2.2 + i * 0.9) * cam.zoom;
        ctx.globalAlpha = strength * (1 - rise / 30);
        ctx.fillStyle = night ? '#94a3b8' : '#cbd5e1';
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
