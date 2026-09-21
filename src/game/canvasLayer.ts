export type CanvasSurface = OffscreenCanvas | HTMLCanvasElement;

export type CanvasContext2d = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Device pixel ratio the main canvas is sized at.
 *
 * One owner for the value, because two places must agree: `GameLoop.draw` scales the
 * destination context by it, and every offscreen layer must rasterise at the same scale.
 * When a layer rasterised at logical size and was then blitted through a DPR-scaled
 * context, `imageSmoothingEnabled = false` nearest-neighbour-upscaled every sprite,
 * shadow and particle by the DPR while HUD text drawn straight into the context stayed
 * crisp (audit `visuals-looks.md` D1).
 */
export function getRenderDpr(): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio;
  return typeof dpr === 'number' && dpr > 0 ? dpr : 1;
}

export function createCanvasSurface(width: number, height: number): CanvasSurface {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  throw new Error('No canvas implementation available');
}

export function getCanvasContext(surface: CanvasSurface): CanvasContext2d {
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2d context for canvas layer');
  return ctx;
}

/** Release GPU/RAM held by an offscreen surface before replacing the cache. */
export function disposeCanvasSurface(surface: CanvasSurface | null | undefined): void {
  if (!surface) return;
  surface.width = 0;
  surface.height = 0;
}

export function resizeCanvasSurface(
  surface: CanvasSurface,
  width: number,
  height: number,
): CanvasContext2d {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (surface.width !== w || surface.height !== h) {
    surface.width = w;
    surface.height = h;
  }
  return getCanvasContext(surface);
}

export function clearCanvasSurface(ctx: CanvasContext2d, width: number, height: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);
}