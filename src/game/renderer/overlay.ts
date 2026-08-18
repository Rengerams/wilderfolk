import { Season } from '../gameTypes';
import { isNightHour } from '../dayCycle';
import { drawRenffrOmen } from '../renffrStar';
import type { RenderSnapshot } from '../renderSnapshot';
import { renderTime } from './shared';
import { drawBuildPreview } from './buildPreview';
import { drawGridTopOverlay } from './grid';
import { drawBuildingActiveEffects, drawNightBuildingGlow } from './nightEffects';
import { drawSeasonParticles, drawWaterShimmer, drawWeather } from './weather';
import { drawEntityFlashOverlay } from './entityComposite';

/**
 * Per-frame overlay pass — everything drawn on top of the baked ground +
 * entity layers.
 */
export function drawGameOverlay(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
): void {
  drawBuildingActiveEffects(ctx, state, cw, ch);
  drawBuildPreview(ctx, state, cw, ch);
  drawEntityFlashOverlay(ctx, state, cw, ch);
  drawWeather(ctx, state.weather, cw, ch);
  drawWaterShimmer(ctx, state, cw, ch);
  drawSeasonParticles(ctx, state, cw, ch);

  if (isNightHour(state.hourOfDay)) {
    drawNightAtmosphere(ctx, state, cw, ch);
    drawNightBuildingGlow(ctx, state, cw, ch);
  } else {
    drawDayAtmosphere(ctx, state, cw, ch);
  }

  // Gentle warm vibrance on day scenes — cheap Canvas 2D stand-in for a GPU
  // colour grade (soft-light punch; day only, so night keeps its cool blue).
  if (!isNightHour(state.hourOfDay)) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(240, 205, 150, 0.10)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }

  // Grid lines on top of all map sprites (underlay was hidden under trees/grass)
  drawGridTopOverlay(ctx, state, cw, ch);

  // Screen vignette — focuses the eye on the settlement
  drawScreenVignette(ctx, cw, ch, isNightHour(state.hourOfDay));

  if (state.renffrOmen) {
    drawRenffrOmen(ctx, state.renffrOmen, cw, ch, renderTime);
  }
}

/** Cool blue night wash with stronger edges — leaves center readable for village glows. */
export function drawNightAtmosphere(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const deep = state.hourOfDay >= 22 || state.hourOfDay < 4;
  const depth = deep ? 0.42 : 0.3;
  ctx.fillStyle = `rgba(6, 10, 28, ${depth * 0.85})`;
  ctx.fillRect(0, 0, cw, ch);
  const g = ctx.createRadialGradient(cw * 0.5, ch * 0.42, Math.min(cw, ch) * 0.12, cw * 0.5, ch * 0.5, Math.max(cw, ch) * 0.72);
  g.addColorStop(0, 'rgba(8, 12, 40, 0)');
  g.addColorStop(0.55, `rgba(8, 14, 40, ${depth * 0.35})`);
  g.addColorStop(1, `rgba(2, 4, 18, ${depth * 0.85})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}

/** Warm / seasonal day grade + soft directional key light (2.5D). */
export function drawDayAtmosphere(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const hour = state.hourOfDay;
  let tint = 'rgba(255, 248, 230, 0.05)';
  if (hour < 8 || hour >= 18) {
    tint = 'rgba(255, 170, 90, 0.1)'; // dawn / dusk gold
  } else if (state.season === Season.Winter) {
    tint = 'rgba(190, 215, 245, 0.16)';
  } else if (state.season === Season.Fall) {
    tint = 'rgba(255, 175, 90, 0.14)';
  } else if (state.season === Season.Spring) {
    tint = 'rgba(200, 255, 180, 0.08)';
  } else if (state.season === Season.Summer) {
    tint = 'rgba(255, 230, 100, 0.14)'; // hot noon wash
  }
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, cw, ch);

  // NW sun beam wash — cooler in winter
  const sun = ctx.createLinearGradient(0, 0, cw * 0.85, ch);
  if (state.season === Season.Winter) {
    sun.addColorStop(0, 'rgba(200, 220, 255, 0.1)');
    sun.addColorStop(0.45, 'rgba(255,255,255,0)');
    sun.addColorStop(1, 'rgba(30, 40, 70, 0.1)');
  } else {
    sun.addColorStop(0, hour < 8 || hour >= 18 ? 'rgba(255, 200, 120, 0.08)' : 'rgba(255, 255, 240, 0.05)');
    sun.addColorStop(0.45, 'rgba(255,255,255,0)');
    sun.addColorStop(1, 'rgba(20, 30, 50, 0.06)');
  }
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, cw, ch);
}

export function drawScreenVignette(ctx: CanvasRenderingContext2D, cw: number, ch: number, night: boolean) {
  const g = ctx.createRadialGradient(cw * 0.5, ch * 0.45, Math.min(cw, ch) * 0.22, cw * 0.5, ch * 0.52, Math.max(cw, ch) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(0.85, night ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.12)');
  g.addColorStop(1, night ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}
