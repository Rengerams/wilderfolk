import type { RenderSnapshot } from './renderSnapshot';
import {
  clearCanvasSurface,
  createCanvasSurface,
  disposeCanvasSurface,
  getCanvasContext,
  type CanvasContext2d,
  type CanvasSurface,
} from './canvasLayer';
import type { Camera } from './gameTypes';

/**
 * Dynamic world-entity bitmap cache.
 *
 * The layer is painted relative to an **anchor camera** into a surface padded by
 * {@link LAYER_MARGIN_PX} on every side. While the live camera stays inside that
 * margin (panning without zoom), the cached bitmap is reused and just blitted at
 * an offset — no per-frame rebake. Rebake happens only when: the sim tick / UI
 * state changes, the camera leaves the margin, the zoom changes, or the surface
 * must resize.
 */

/** Padding (px) around the viewport so small pans reuse the cached layer. */
const LAYER_MARGIN_PX = 160;
/** Zoom change beyond this triggers a rebake (we blit without scaling). */
const LAYER_ANCHOR_ZOOM_EPSILON = 1e-4;

export interface EntityLayerCache {
  surface: CanvasSurface;
  ctx: CanvasContext2d;
  key: string;
  /** Logical px (viewport + margins) — the units every painter and the blit use. */
  width: number;
  height: number;
  /** Device pixel ratio the surface is rasterised at; {@link ctx} carries the same scale. */
  dpr: number;
  /** Camera used when painting the layer (world coords of its center). */
  anchorX: number;
  anchorY: number;
  anchorZoom: number;
  margin: number;
}

let entityLayerCache: EntityLayerCache | null = null;

/**
 * Cache key for the dynamic world entity bitmap.
 * Camera position is intentionally NOT part of the key — panning within the
 * margin reuses the layer via {@link entityLayerAnchorMoved} instead.
 */
export function buildEntityLayerKey(state: RenderSnapshot, cw: number, ch: number): string {
  const ghost = state.buildGhost;
  const strip = state.buildStripPreview;
  return [
    state.tick,
    cw,
    ch,
    state.hourOfDay,
    state.showGrid ? 1 : 0,
    state.showPaths ? 1 : 0,
    state.hoveredBuilding?.id ?? '',
    state.selectedEntity?.id ?? '',
    // The painters read the whole selection (`humans.ts` / `animals.ts` draw a ring per id) and the
    // juice-effects preference (contact-shadow strength), but neither was keyed — so a shift-click
    // that changed only a non-primary id, or toggling the preference, left the cached bitmap stale
    // until the next tick, and indefinitely while paused. `state.season` is deliberately not keyed:
    // `gameTick` advances `state.tick` and assigns `state.season` in the same call, and `tick` is
    // already in this key, so the season can never change without a rebuild.
    state.selectedEntityIds.join(','),
    state.juiceEffectsEnabled ? 1 : 0,
    state.selectedBuilding?.id ?? '',
    state.villageLeaderId ?? '',
    state.highlightedCampKey ?? '',
    state.buildMode ?? '',
    state.buildRotation ?? 0,
    ghost ? `${ghost.x.toFixed(0)},${ghost.y.toFixed(0)},${ghost.valid ? 1 : 0},${ghost.reason ?? ''}` : '',
    strip ? `${strip.segments.length}|${strip.rotation}` : '',
    state.pendingRaidEvents?.length ?? 0,
    state.pendingOutgoingRaidEvents?.length ?? 0,
    state.visitorGroups.length,
    state.buildings.length,
    state.entities.length,
  ].join('|');
}

/** Surface dimensions for a viewport of cw×ch (padded on all sides). */
function layerSize(cw: number, ch: number): { w: number; h: number } {
  return {
    w: Math.max(1, Math.floor(cw + LAYER_MARGIN_PX * 2)),
    h: Math.max(1, Math.floor(ch + LAYER_MARGIN_PX * 2)),
  };
}

export function entityLayerNeedsRebuild(
  cache: EntityLayerCache | null,
  key: string,
  cw: number,
  ch: number,
  dpr: number,
): boolean {
  const { w, h } = layerSize(cw, ch);
  if (!cache) return true;
  return cache.key !== key || cache.width !== w || cache.height !== h || cache.dpr !== dpr;
}

/** True when the live camera has moved outside the cached layer's margin (or zoomed). */
export function entityLayerAnchorMoved(cache: EntityLayerCache, cam: Camera, cw: number, ch: number): boolean {
  const { w, h } = layerSize(cw, ch);
  if (cache.width < w || cache.height < h) return true;
  if (Math.abs(cam.zoom - cache.anchorZoom) > LAYER_ANCHOR_ZOOM_EPSILON) return true;
  const dxPx = (cam.x - cache.anchorX) * cam.zoom;
  const dyPx = (cam.y - cache.anchorY) * cam.zoom;
  return Math.abs(dxPx) > cache.margin || Math.abs(dyPx) > cache.margin;
}

export function disposeEntityLayerCache(): void {
  if (!entityLayerCache) return;
  disposeCanvasSurface(entityLayerCache.surface);
  entityLayerCache = null;
}

/** Painter transform: logical px in, device px out (the surface is dpr× larger). */
function setLayerScale(ctx: CanvasContext2d, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Acquire (or resize) the padded entity offscreen layer, cleared for painting.
 *
 * The surface is allocated at `dpr × logical` and its context carries the same scale, so
 * painters keep working in logical px while the raster is device-resolution — otherwise
 * the 1:1 blit in {@link paintEntityLayerTo} upscaled by the DPR under
 * `imageSmoothingEnabled = false`.
 */
export function beginEntityLayerPaint(
  key: string,
  cw: number,
  ch: number,
  cam: Camera,
  dpr: number,
): EntityLayerCache {
  const { w, h } = layerSize(cw, ch);
  const deviceW = Math.max(1, Math.round(w * dpr));
  const deviceH = Math.max(1, Math.round(h * dpr));

  if (
    entityLayerCache
    && entityLayerCache.width === w
    && entityLayerCache.height === h
    && entityLayerCache.dpr === dpr
  ) {
    entityLayerCache.key = key;
    entityLayerCache.anchorX = cam.x - LAYER_MARGIN_PX / cam.zoom;
    entityLayerCache.anchorY = cam.y - LAYER_MARGIN_PX / cam.zoom;
    entityLayerCache.anchorZoom = cam.zoom;
    // Clear in device px (the helper resets the transform), then restore the painter scale.
    clearCanvasSurface(entityLayerCache.ctx, deviceW, deviceH);
    setLayerScale(entityLayerCache.ctx, dpr);
    return entityLayerCache;
  }

  disposeEntityLayerCache();
  const surface = createCanvasSurface(deviceW, deviceH);
  const ctx = getCanvasContext(surface);
  clearCanvasSurface(ctx, deviceW, deviceH);
  setLayerScale(ctx, dpr);
  entityLayerCache = {
    surface,
    ctx,
    key,
    width: w,
    height: h,
    dpr,
    anchorX: cam.x - LAYER_MARGIN_PX / cam.zoom,
    anchorY: cam.y - LAYER_MARGIN_PX / cam.zoom,
    anchorZoom: cam.zoom,
    margin: LAYER_MARGIN_PX,
  };
  return entityLayerCache;
}

export function getEntityLayerCache(): EntityLayerCache | null {
  return entityLayerCache;
}

export function commitEntityLayerPaint(key: string): void {
  if (entityLayerCache) entityLayerCache.key = key;
}

/**
 * Blit the cached layer onto the target, translating for the current camera.
 *
 * Derivation: screen_x(W) = (W − cam.x)·zoom + cw/2. The layer paints world
 * relative to anchorX (a point margin/zoom LEFT of the rebake camera) into a
 * (cw + 2·margin) surface, so the layer-x of viewport-left is 2·margin and the
 * correct offset is dx = (anchorX − cam.x)·zoom − margin. (Earlier versions used
 * +margin — everything drew shifted 2·margin px right/down.)
 *
 * The destination size is passed explicitly as the **logical** `width`/`height`: the
 * surface holds `width·dpr` device px and the target context is DPR-scaled, so this is the
 * 1:1 device-pixel blit. Omitting it draws the source at its intrinsic (device) size
 * through the scaled context, i.e. `dpr²` device px.
 */
export function paintEntityLayerTo(
  target: CanvasRenderingContext2D,
  cache: EntityLayerCache,
  cam: Camera,
): void {
  const dx = (cache.anchorX - cam.x) * cam.zoom - cache.margin;
  const dy = (cache.anchorY - cam.y) * cam.zoom - cache.margin;
  target.drawImage(cache.surface as CanvasImageSource, dx, dy, cache.width, cache.height);
}