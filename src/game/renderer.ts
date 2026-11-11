import type { RenderSnapshot } from './renderSnapshot';
import { profileEnd, profileRenderedFrame, profileStart } from './performanceProfiler';
import { resetDialogueSessions } from './humanChat';
import { disposeEntityLayerCache } from './entityLayer';
import { effectiveScreenShake, resetRenderClock, tickRenderClock } from './renderer/shared';
import { drawGround, resetTerrainCaches } from './renderer/terrain';
import {
  resetEntityCaches,
  updateCachedEntities,
  updateCachedEntitiesFromSoA,
  _tickAnimals,
  _tickHumans,
} from './renderer/entityCache';
import { resetWeatherCaches } from './renderer/weather';
import { resetHumanRenderCaches } from './renderer/humans';
import { compositeCachedEntityLayer, paintMovingEntities } from './renderer/entityComposite';
import { drawGameOverlay } from './renderer/overlay';
import { beginMotionFrame, resetMotionInterpolation, setSpotlightPresentationFrame, type SpotlightPresentation } from './renderer/motionInterpolation';
import { drawMiniMapFrame } from './renderer/miniMapFrame';
import { getPresentationRng } from './simRng';
import { resetLogisticsOverlayCache } from './logisticsOverlayData';

// ============ MAIN RENDER ============
/** Clear module-level render caches when starting a new session or loading a save. */
export function resetRendererCaches(): void {
  resetTerrainCaches();
  resetEntityCaches();
  disposeEntityLayerCache();
  resetDialogueSessions();
  resetWeatherCaches();
  resetHumanRenderCaches();
  resetRenderClock();
  resetMotionInterpolation();
  // The logistics projection memo is keyed on world identity and caches a reference to it, so dropping
  // it here keeps a replaced world from being pinned alive.
  resetLogisticsOverlayCache();
}

/**
 * Read-only render pass — camera/screenShake must be pre-interpolated in the snapshot. `tickFraction`
 * is how far the accumulator advanced through the fixed step; `1` (paused) draws the exact tick state.
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
  tickFraction = 1,
  spotlightPresentation: SpotlightPresentation | null = null,
) {
  setSpotlightPresentationFrame(spotlightPresentation);
  try {
  profileRenderedFrame(state.tick, state.weather);
  tickRenderClock(performance.now());
  ctx.imageSmoothingEnabled = false;

  if (state.renderSoA) {
    updateCachedEntitiesFromSoA(state, cw, ch);
  } else {
    updateCachedEntities(
      state.entityByType,
      state.grassGrid,
      state.tick,
      state.camera,
      state.width,
      state.height,
      cw,
      ch,
    );
  }

  beginMotionFrame(state.tick, tickFraction, _tickHumans, _tickAnimals);

  // Camera shake is the one canvas motion the OS preference removes outright, not just freezes.
  const shake = effectiveScreenShake(state.screenShake);
  if (shake > 0.1) {
    ctx.save();
    ctx.translate((getPresentationRng('rendererShake')() - 0.5) * shake * 2, (getPresentationRng('rendererShake')() - 0.5) * shake * 2);
  }

  const rendergroundStart = profileStart();
  drawGround(ctx, state, cw, ch);
  profileEnd('render.ground', rendergroundStart);
  const renderentityLayerStart = profileStart();
  compositeCachedEntityLayer(ctx, state, cw, ch);
  profileEnd('render.entityLayer', renderentityLayerStart);
  const rendermovingEntitiesStart = profileStart();
  paintMovingEntities(ctx, state, cw, ch);
  profileEnd('render.movingEntities', rendermovingEntitiesStart);
  const renderoverlaysStart = profileStart();
  drawGameOverlay(ctx, state, cw, ch);
  profileEnd('render.overlays', renderoverlaysStart);

  if (shake > 0.1) {
    ctx.restore();
  }

  // The mini-map paints on this frame, from the registration its panel makes on mount.
  const renderminimapStart = profileStart();
  drawMiniMapFrame();
  profileEnd('render.minimap', renderminimapStart);
  } finally {
    setSpotlightPresentationFrame(null);
  }
}
