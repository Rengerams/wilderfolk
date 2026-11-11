import { drawCampHighlightRings } from './markers';
import { drawRenffrOmen } from '../renffrStar';
import { profileEnd, profileStart } from '../performanceProfiler';
import type { RenderSnapshot } from '../renderSnapshot';
import { motionTime } from './shared';
import {
  drawBuildingHighlightRing,
  drawHoveredBuildingTint,
  getBuildingFootprintScreenRect,
  isHighlightableBuilding,
} from './buildings';
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
  drawHoveredBuildingTint(ctx, state, cw, ch);
  drawHoveredBuildingRing(ctx, state, cw, ch);
  drawBuildPreview(ctx, state, cw, ch);
  drawEntityFlashOverlay(ctx, state, cw, ch);
  // Hunt arrows live here, not in the tick-keyed entity layer: `huntAnimProgress` is a millisecond
  // animation, so a tick-keyed layer would strobe the arrow.
  drawHuntVisuals(ctx, state, cw, ch);
  // Leader aura pulses on `renderTime`, so it lives here rather than in the tick-keyed entity
  // layer (where it froze between rebakes). See `drawLeaderAuraOverlay`.
  drawLeaderAuraOverlay(ctx, state, cw, ch);
  drawCampHighlightRings(ctx, state, cw, ch);
  // Weather takes the snapshot because the effects paint in screen space against a camera-aware
  // frame, and the daylight cast needs the hour.
  const weatherStart = profileStart();
  drawWeather(ctx, state, cw, ch);
  profileEnd('render.weather', weatherStart);
  drawWaterShimmer(ctx, state, cw, ch);
  drawSeasonParticles(ctx, state, cw, ch);

  // Day & night lighting overlays, glows, and tints disabled

  // Grid lines on top of all map sprites (underlay was hidden under trees/grass)
  drawGridTopOverlay(ctx, state, cw, ch);

  // F4 logistics overlay is a per-frame live read, never the tick-keyed layer (a baked layer would
  // freeze it between ticks); no-op while `ViewState.showLogistics` is off.
  drawLogisticsOverlay(ctx, state, cw, ch);

  // Screen vignette — neutral edge shading without night darkening
  drawScreenVignette(ctx, cw, ch, false);

  if (state.renffrOmen) {
    drawRenffrOmen(ctx, state.renffrOmen, cw, ch, motionTime);
  }
}

/**
 * Hover feedback repaints every frame, never in the tick-keyed entity layer: the layer is keyed on
 * the tick and the selection, so a ring baked there lagged a tick and never appeared while paused.
 */
function drawHoveredBuildingRing(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
): void {
  const hovered = state.hoveredBuilding;
  // The layer already paints the selection ring for the same footprint.
  if (hovered == null || hovered.id === state.selectedBuilding?.id) return;
  if (!isHighlightableBuilding(hovered)) return;
  drawBuildingHighlightRing(
    ctx,
    getBuildingFootprintScreenRect(hovered, state, state.camera, cw, ch),
    { stroke: 'rgba(255,255,255,0.85)', lineWidth: 1.5, pad: 3, shadowBlur: 5 },
  );
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

/** The vignette's gradient depends only on the target context, the viewport and `night`. */
let vignetteCache: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  night: boolean;
  gradient: CanvasGradient;
} | null = null;

export function drawScreenVignette(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  night: boolean = false,
): void {
  const cached = vignetteCache;
  let g = cached
    && cached.ctx === ctx
    && cached.width === cw
    && cached.height === ch
    && cached.night === night
    ? cached.gradient
    : null;
  if (!g) {
    g = ctx.createRadialGradient(
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
    vignetteCache = { ctx, width: cw, height: ch, night, gradient: g };
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}