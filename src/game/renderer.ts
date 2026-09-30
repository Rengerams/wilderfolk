import type { RenderSnapshot } from './renderSnapshot';
import { resetDialogueSessions } from './humanChat';
import { disposeEntityLayerCache } from './entityLayer';
import { resetRenderClock, tickRenderClock } from './renderer/shared';
import { drawGround, resetTerrainCaches } from './renderer/terrain';
import {
  resetEntityCaches,
  updateCachedEntities,
  updateCachedEntitiesFromSoA,
} from './renderer/entityCache';
import { resetWeatherCaches } from './renderer/weather';
import { compositeCachedEntityLayer } from './renderer/entityComposite';
import { drawGameOverlay } from './renderer/overlay';
import { getPresentationRng } from './simRng';
import { resetLogisticsOverlayCache } from './logisticsOverlayData';

// ============ MAIN RENDER ============
/** Read-only render pass — camera/screenShake must be pre-interpolated in the snapshot. */
/** Clear module-level render caches when starting a new session or loading a save. */
export function resetRendererCaches(): void {
  resetTerrainCaches();
  resetEntityCaches();
  disposeEntityLayerCache();
  resetDialogueSessions();
  resetWeatherCaches();
  resetRenderClock();
  // The logistics projection memo is keyed on world identity, and a new session, a loaded save or a
  // `setWorld` all replace that object — but the key also has a cached *reference* to it, so dropping
  // it here keeps the cache from pinning a dead world alive and makes the invalidation explicit.
  resetLogisticsOverlayCache();
}

export function renderGame(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
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

  const shake = state.screenShake;
  if (shake > 0.1) {
    ctx.save();
    ctx.translate((getPresentationRng('rendererShake')() - 0.5) * shake * 2, (getPresentationRng('rendererShake')() - 0.5) * shake * 2);
  }

  drawGround(ctx, state, cw, ch);
  compositeCachedEntityLayer(ctx, state, cw, ch);
  drawGameOverlay(ctx, state, cw, ch);

  if (shake > 0.1) {
    ctx.restore();
  }
}
