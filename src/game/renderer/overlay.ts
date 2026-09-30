import { drawRenffrOmen } from '../renffrStar';
import type { RenderSnapshot } from '../renderSnapshot';
import { renderTime } from './shared';
import { drawBuildPreview } from './buildPreview';
import { drawGridTopOverlay } from './grid';
import { drawBuildingActiveEffects } from './nightEffects';
import { drawSeasonParticles, drawWaterShimmer, drawWeather } from './weather';
import { drawEntityFlashOverlay } from './entityComposite';
import { drawHuntVisuals, drawLeaderAuraOverlay } from './humans';
import { drawLogisticsOverlay } from './logistics';

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
  // Hunt arrows live here, not in the tick-keyed entity layer: `huntAnimProgress` is a
  // millisecond animation (`HUNT_ANIM_MS`), so painting it into a layer that only repaints
  // on a sim tick sampled a ~1 s flight once or twice and made the arrow strobe. The
  // retention window stays on the same millisecond clock (pinned by
  // `tests/huntVisuals.lifecycle.test.ts` and BUG 2026-08-21-hunt-visuals-expire-on-simulation-ticks).
  drawHuntVisuals(ctx, state, cw, ch);
  // Leader aura pulses on `renderTime`, so it lives here rather than in the tick-keyed entity
  // layer (where it froze between rebakes). See `drawLeaderAuraOverlay`.
  drawLeaderAuraOverlay(ctx, state, cw, ch);
  // Weather takes the snapshot rather than just `state.weather`: the ported Teraforge effects paint in
  // screen space against a camera-aware frame (the cloud and fog layers drift with a parallax factor),
  // and the daylight cast needs the hour.
  drawWeather(ctx, state, cw, ch);
  drawWaterShimmer(ctx, state, cw, ch);
  drawSeasonParticles(ctx, state, cw, ch);

  // Day & night lighting overlays, glows, and tints disabled

  // Grid lines on top of all map sprites (underlay was hidden under trees/grass)
  drawGridTopOverlay(ctx, state, cw, ch);

  // F4 logistics overlay. Per-frame like the grid above, never the tick-keyed entity layer: the
  // projection is a live read of the world and the toggle is live view state, so a baked layer
  // would freeze it between sim ticks and leave it stale while paused (the D5/D19 bug class).
  // No-op while `ViewState.showLogistics` is off — `state.logistics` is null then.
  drawLogisticsOverlay(ctx, state, cw, ch);

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