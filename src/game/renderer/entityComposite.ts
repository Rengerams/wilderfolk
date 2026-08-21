import type { CanvasContext2d } from '../canvasLayer';
import { getAnimalSpriteMetrics } from '../entitySprites';
import { getHumanSpriteMetrics } from '../humanSprites';
import type { RenderSnapshot } from '../renderSnapshot';
import { renderTime } from './shared';
import { _cachedAnimals, _cachedHumans } from './entityCache';
import { drawAnimals } from './animals';
import { drawBuildings } from './buildings';
import { drawBuildZoneOverlay, drawGrid } from './grid';
import { drawGrass } from './grass';
import { drawHumans, drawHuntChaseLines, drawHuntVisuals, drawRaidMarchLines, drawTradeRouteLines } from './humans';
import { drawCampMarkers, drawEcoConnections, drawFloatingTexts } from './markers';
import { drawParticles } from './particles';
import { drawScentOverlay } from './scent';
import { drawTrees } from './trees';
import {
  beginEntityLayerPaint,
  buildEntityLayerKey,
  commitEntityLayerPaint,
  entityLayerAnchorMoved,
  entityLayerNeedsRebuild,
  getEntityLayerCache,
  paintEntityLayerTo,
} from '../entityLayer';

function paintWorldEntityLayer(ctx: CanvasContext2d, state: RenderSnapshot, cw: number, ch: number): void {
  // OffscreenCanvas 2d contexts are API-compatible with CanvasRenderingContext2D for draw passes.
  const drawCtx = ctx as CanvasRenderingContext2D;
  drawScentOverlay(drawCtx, state, cw, ch);
  drawBuildZoneOverlay(drawCtx, state, cw, ch);
  drawGrid(drawCtx, state, cw, ch);
  drawGrass(drawCtx, state, cw, ch);
  drawTrees(drawCtx, state, cw, ch);
  drawBuildings(drawCtx, state, cw, ch);
  drawCampMarkers(drawCtx, state, cw, ch);
  drawEcoConnections(drawCtx, state, state.camera, cw, ch);
  // Build ghost is drawn live in renderGame (animated bob / brackets)
  drawAnimals(drawCtx, state, cw, ch, true);
  drawTradeRouteLines(drawCtx, state, cw, ch);
  drawRaidMarchLines(drawCtx, state, cw, ch);
  drawHuntChaseLines(drawCtx, state, cw, ch);
  drawHuntVisuals(drawCtx, state, cw, ch);
  // Simulation notices remain visible, but active speech/name overlays are the
  // higher-priority readable text directly above settlers.
  drawFloatingTexts(drawCtx, state, cw, ch);
  drawHumans(drawCtx, state, cw, ch, true);
  drawParticles(drawCtx, state, cw, ch);
}

function drawEntityFlashOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number): void {
  const cam = state.camera;
  for (const e of _cachedAnimals) {
    if (e.flash <= 0) continue;
    const sx = (e.x - cam.x) * cam.zoom + cw / 2;
    const sy = (e.y - cam.y) * cam.zoom + ch / 2;
    const { spriteH } = getAnimalSpriteMetrics(e, cam.zoom);
    ctx.save();
    ctx.globalAlpha = 0.7 + Math.sin(renderTime * 20) * 0.3;
    ctx.strokeStyle = 'rgba(251,191,36,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, spriteH * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  for (const human of _cachedHumans) {
    if (human.flash <= 0) continue;
    const sx = (human.x - cam.x) * cam.zoom + cw / 2;
    const sy = (human.y - cam.y) * cam.zoom + ch / 2;
    const { size, spriteH, footOffset } = getHumanSpriteMetrics(human, cam.zoom);
    const footY = sy + footOffset;
    ctx.save();
    ctx.globalAlpha = 0.7 + Math.sin(renderTime * 20) * 0.3;
    ctx.strokeStyle = 'rgba(251,191,36,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.42, spriteH * 0.54, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function compositeCachedEntityLayer(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
): void {
  const layerKey = buildEntityLayerKey(state, cw, ch);
  const existing = getEntityLayerCache();
  if (
    existing
    && !entityLayerNeedsRebuild(existing, layerKey, cw, ch)
    && !entityLayerAnchorMoved(existing, state.camera, cw, ch)
  ) {
    paintEntityLayerTo(ctx, existing, state.camera);
    return;
  }

  const layer = beginEntityLayerPaint(layerKey, cw, ch, state.camera);
  const anchorCam = { ...state.camera, x: layer.anchorX, y: layer.anchorY, zoom: layer.anchorZoom };
  paintWorldEntityLayer(layer.ctx, { ...state, camera: anchorCam }, layer.width, layer.height);
  commitEntityLayerPaint(layerKey);
  paintEntityLayerTo(ctx, layer, state.camera);
}

export { drawEntityFlashOverlay };
