import type { RenderSnapshot } from './renderSnapshot';
import {
  clearCanvasSurface,
  createCanvasSurface,
  disposeCanvasSurface,
  getCanvasContext,
  type CanvasContext2d,
  type CanvasSurface,
} from './canvasLayer';

/** Viewport cache key precision — sub-pixel camera drift should not invalidate layers. */
const LAYER_KEY_XY_DIGITS = 1;
const LAYER_KEY_ZOOM_DIGITS = 3;

export interface EntityLayerCache {
  surface: CanvasSurface;
  ctx: CanvasContext2d;
  key: string;
  width: number;
  height: number;
}

let entityLayerCache: EntityLayerCache | null = null;

/** Cache key for the dynamic world entity bitmap (invalidates on tick, camera, or UI build state). */
export function buildEntityLayerKey(state: RenderSnapshot, cw: number, ch: number): string {
  const cam = state.camera;
  const ghost = state.buildGhost;
  const strip = state.buildStripPreview;
  return [
    state.tick,
    cam.x.toFixed(LAYER_KEY_XY_DIGITS),
    cam.y.toFixed(LAYER_KEY_XY_DIGITS),
    cam.zoom.toFixed(LAYER_KEY_ZOOM_DIGITS),
    cw,
    ch,
    state.hourOfDay,
    state.showGrid ? 1 : 0,
    state.showPaths ? 1 : 0,
    state.hoveredBuilding?.id ?? '',
    state.selectedEntity?.id ?? '',
    state.selectedBuilding?.id ?? '',
    state.highlightedCampKey ?? '',
    state.buildMode ?? '',
    state.buildRotation ?? 0,
    ghost ? `${ghost.x.toFixed(0)},${ghost.y.toFixed(0)},${ghost.valid ? 1 : 0}` : '',
    strip ? `${strip.segments.length}|${strip.rotation}` : '',
    state.pendingRaidEvents?.length ?? 0,
    state.pendingOutgoingRaidEvents?.length ?? 0,
    state.visitorGroups.length,
    state.buildings.length,
  ].join('|');
}

export function entityLayerNeedsRebuild(
  cache: EntityLayerCache | null,
  key: string,
  cw: number,
  ch: number,
): boolean {
  if (!cache) return true;
  const w = Math.max(1, Math.floor(cw));
  const h = Math.max(1, Math.floor(ch));
  return cache.key !== key || cache.width !== w || cache.height !== h;
}

export function disposeEntityLayerCache(): void {
  if (!entityLayerCache) return;
  disposeCanvasSurface(entityLayerCache.surface);
  entityLayerCache = null;
}

/** Acquire (or resize) the entity offscreen layer and clear it for painting. */
export function beginEntityLayerPaint(key: string, cw: number, ch: number): EntityLayerCache {
  const w = Math.max(1, Math.floor(cw));
  const h = Math.max(1, Math.floor(ch));

  if (entityLayerCache && entityLayerCache.width === w && entityLayerCache.height === h) {
    entityLayerCache.key = key;
    clearCanvasSurface(entityLayerCache.ctx, w, h);
    return entityLayerCache;
  }

  disposeEntityLayerCache();
  const surface = createCanvasSurface(w, h);
  const ctx = getCanvasContext(surface);
  clearCanvasSurface(ctx, w, h);
  entityLayerCache = { surface, ctx, key, width: w, height: h };
  return entityLayerCache;
}

export function getEntityLayerCache(): EntityLayerCache | null {
  return entityLayerCache;
}

export function commitEntityLayerPaint(key: string): void {
  if (entityLayerCache) entityLayerCache.key = key;
}

export function paintEntityLayerTo(
  target: CanvasRenderingContext2D,
  cache: EntityLayerCache,
): void {
  target.drawImage(cache.surface as CanvasImageSource, 0, 0, cache.width, cache.height);
}