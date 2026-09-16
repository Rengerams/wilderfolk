import { drawRenffrOmen } from '../renffrStar';
import type { RenderSnapshot } from '../renderSnapshot';
import { renderTime } from './shared';
import { drawBuildPreview } from './buildPreview';
import { drawGridTopOverlay } from './grid';
import { drawBuildingActiveEffects } from './nightEffects';
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

  // Day & night lighting overlays, glows, and tints disabled

  // Grid lines on top of all map sprites (underlay was hidden under trees/grass)
  drawGridTopOverlay(ctx, state, cw, ch);

  // Screen vignette — neutral edge shading without night darkening
  drawScreenVignette(ctx, cw, ch, false);

  if (state.renffrOmen) {
    drawRenffrOmen(ctx, state.renffrOmen, cw, ch, renderTime);
  }
}

/** Cool blue night wash — no-op to disable night darkening. */
export function drawNightAtmosphere(
  _ctx: CanvasRenderingContext2D,
  _state: RenderSnapshot,
  _cw: number,
  _ch: number,
): void {}

/** Warm / seasonal day grade — no-op to disable day tinting. */
export function drawDayAtmosphere(
  _ctx: CanvasRenderingContext2D,
  _state: RenderSnapshot,
  _cw: number,
  _ch: number,
): void {}

export function drawScreenVignette(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  night: boolean = false,
): void {
  const g = ctx.createRadialGradient(
    cw * 0.5,
    ch * 0.45,
    Math.min(cw, ch) * 0.22,
    cw * 0.5,
    ch * 0.52,
    Math.max(cw, ch) * 0.78,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(0.85, night ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.12)');
  g.addColorStop(1, night ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}