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
 * Dynamic world-entity bitmap cache: painted from an anchor camera into a surface padded by
 * `LAYER_MARGIN_PX`, so panning inside the margin reuses the bitmap without a rebake.
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
 * Cache key for the dynamic world entity bitmap; camera position is deliberately excluded, since
 * panning within the margin reuses the layer. Only what a layer painter reads belongs here.
 */
/** Reused key scratch — this runs every frame, so the array and the joined string are memoised. */
const layerKeyParts: (string | number)[] = [];
let layerKeySnapshot: (string | number)[] = [];
let layerKeyString = '';

export function buildEntityLayerKey(state: RenderSnapshot, cw: number, ch: number): string {
  const parts = layerKeyParts;
  parts.length = 0;
  parts.push(
    state.staticLayerRevision,
    cw,
    ch,
    state.showGrid ? 1 : 0,
    state.showPaths ? 1 : 0,
    state.selectedEntity?.id ?? '',
  );
  // Painters read the whole selection and the juice-effects preference, so both are keyed. Time-only
  // state is not: no static painter reads `hourOfDay`, and the season already arrives via the
  // static revision. `drawGridTopOverlay` reads the hour in the per-frame overlay pass.
  for (const id of state.selectedEntityIds ?? []) parts.push(id);
  parts.push(
    state.juiceEffectsEnabled ? 1 : 0,
    state.selectedBuilding?.id ?? '',
    state.villageLeaderId ?? '',
    state.highlightedCampKey ?? '',
    // A running performance repaints the stage without building level marks (drawBuildings reads it).
    state.spotlightLore?.phase ?? '',
    state.buildMode ?? '',
    state.buildRotation ?? 0,
    state.pendingRaidEvents?.length ?? 0,
    state.pendingOutgoingRaidEvents?.length ?? 0,
    state.visitorGroups.length,
    state.buildings.length,
    state.entities.length,
  );

  const cached = layerKeySnapshot;
  if (cached.length === parts.length) {
    let same = true;
    for (let i = 0; i < parts.length; i++) {
      if (cached[i] !== parts[i]) {
        same = false;
        break;
      }
    }
    if (same) return layerKeyString;
  }
  layerKeySnapshot = parts.slice();
  layerKeyString = parts.join('|');
  return layerKeyString;
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
 * The surface is `dpr × logical` with a matching context scale, so painters stay in logical px.
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
    entityLayerCache.anchorX = cam.x;
    entityLayerCache.anchorY = cam.y;
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
    anchorX: cam.x,
    anchorY: cam.y,
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
 * The destination size must be the logical width/height for a 1:1 device-pixel blit under DPR.
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