/**
 * The entity layer rasterises at the device pixel ratio (audit `visuals-looks.md` D1).
 *
 * The layer used to be allocated at **logical** size and blitted 1:1 through a destination
 * context scaled by `devicePixelRatio`, so under `imageSmoothingEnabled = false` every sprite,
 * building, shadow and particle was nearest-neighbour upscaled by the DPR while HUD text drawn
 * straight into the context stayed crisp.
 *
 * These pin both halves of the fix: the surface is `dpr × logical`, and the blit names the
 * **logical** destination size — which, through the DPR-scaled target, is the 1:1 device copy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => {
  const created: { width: number; height: number }[] = [];
  const transforms: number[][] = [];
  const drawCalls: unknown[][] = [];
  const fakeCtx = {
    setTransform: (...args: number[]) => {
      transforms.push(args);
    },
  };
  return { created, transforms, drawCalls, fakeCtx };
});

vi.mock('../src/game/canvasLayer', () => ({
  createCanvasSurface: (width: number, height: number) => {
    const surface = { width, height };
    mock.created.push(surface);
    return surface;
  },
  getCanvasContext: () => mock.fakeCtx,
  clearCanvasSurface: () => {},
  disposeCanvasSurface: () => {},
}));

import {
  beginEntityLayerPaint,
  disposeEntityLayerCache,
  entityLayerNeedsRebuild,
  paintEntityLayerTo,
} from '../src/game/entityLayer';

/**
 * `targetX` / `targetY` / `targetZoom` are the camera's smoothing targets; `Camera` requires
 * them, and `beginEntityLayerPaint` / `paintEntityLayerTo` read only `x`, `y` and `zoom`
 * (they anchor and translate straight from the live camera), so the targets are set equal to
 * the live values and never read here.
 */
const CAM = { x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 };

describe('entity layer device-pixel rasterisation', () => {
  beforeEach(() => {
    mock.created.length = 0;
    mock.transforms.length = 0;
    mock.drawCalls.length = 0;
    disposeEntityLayerCache();
  });

  it('allocates the surface at dpr × the padded logical viewport', () => {
    const layer = beginEntityLayerPaint('key', 800, 600, CAM, 2);

    // 160 px margin on every side, scaled to device px.
    expect(mock.created.at(-1)).toEqual({ width: (800 + 320) * 2, height: (600 + 320) * 2 });
    // The cache still reports logical px — that is what painters are handed.
    expect(layer.width).toBe(1120);
    expect(layer.height).toBe(920);
    expect(layer.dpr).toBe(2);
    expect(mock.transforms.at(-1)).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('blits with the logical destination size, which is 1:1 in device px', () => {
    const layer = beginEntityLayerPaint('key', 800, 600, CAM, 2);
    const target = {
      drawImage: (...args: unknown[]) => {
        mock.drawCalls.push(args);
      },
    };

    paintEntityLayerTo(target as unknown as CanvasRenderingContext2D, layer, CAM);

    const call = mock.drawCalls.at(-1);
    expect(call?.[3]).toBe(1120);
    expect(call?.[4]).toBe(920);
  });

  it('rebuilds the layer when the device pixel ratio changes (monitor move)', () => {
    const layer = beginEntityLayerPaint('key', 800, 600, CAM, 2);

    expect(entityLayerNeedsRebuild(layer, 'key', 800, 600, 2)).toBe(false);
    expect(entityLayerNeedsRebuild(layer, 'key', 800, 600, 1)).toBe(true);
  });
});
