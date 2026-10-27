/**
 * A zoom must re-bake the visible ground **in place**, at the camera's target step, one chunk a frame.
 *
 * The fixed 1:1 bake made the Teraforge overviews unaffordable: at 50 % the whole view is re-baked at
 * a resolution the monitor cannot show, and at the spec map sizes that is millions of useless pixels
 * per view. The bake step therefore follows the camera again (`targetGroundStep`), but the chunk grid
 * and the cache key do **not** — the step lives on the chunk (`bakedStep`) and a chunk that is off its
 * target step swaps its old canvas in as a stand-in, refills the new one under the existing pixel
 * budget, and disposes the stand-in once whole. This case pins that the swap happens at the target
 * step, that it can never re-bake more than one chunk in a frame, and that a settled view re-bakes
 * nothing at all.
 *
 * The bake only calls `createImageData` / `putImageData`, so the capture stub below is enough — no
 * canvas dependency, no browser (same harness as `groundChunk.bands.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { drawGround, GROUND_BAKE_PIXEL_BUDGET, resetTerrainCaches, targetGroundStep } from '../src/game/renderer/terrain';
import { MapSize, Season } from '../src/game/gameTypes';
import type { RenderSnapshot } from '../src/game/renderSnapshot';

interface CapturedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface SurfaceSize {
  width: number;
  height: number;
}

const capture: { image: CapturedImage | null } = { image: null };
/** Pixels the bake asked for, the widths of every `drawImage`, and every surface that was sized. */
const counts = { paintedPixels: 0, drawnWidths: [] as number[], created: [] as SurfaceSize[] };
const realDocument = (globalThis as { document?: unknown }).document;

/** The context every offscreen surface gets: captures the bake, counts the pixels it asked for. */
function surfaceContext(): Record<string, unknown> {
  return {
    createImageData: (w: number, h: number): CapturedImage => {
      counts.paintedPixels += w * h;
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    },
    putImageData: (img: CapturedImage) => { capture.image = img; },
    fillRect: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    drawImage: () => {},
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    strokeRect: () => {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
  };
}

beforeAll(() => {
  (globalThis as { document?: unknown }).document = {
    // A fresh surface per call. `createCanvasSurface` sizes width then height, so the height setter is
    // the one moment the finished size is known; `disposeCanvasSurface` zeroes them and is filtered out.
    createElement: () => {
      let w = 0;
      let h = 0;
      return {
        get width() { return w; },
        set width(value: number) { w = value; },
        get height() { return h; },
        set height(value: number) { h = value; counts.created.push({ width: w, height: value }); },
        getContext: () => surfaceContext(),
      };
    },
  };
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = realDocument;
});

/** The destination context `drawGround` paints into — records what it is asked to blit. */
function destinationContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  return {
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    beginPath: () => {},
    closePath: () => {},
    fill: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    roundRect: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    ellipse: () => {},
    stroke: () => {},
    setLineDash: () => {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    drawImage: (source: { width: number }) => { counts.drawnWidths.push(source.width); },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    imageSmoothingEnabled: false,
  } as unknown as CanvasRenderingContext2D;
}

const WORLD_W = 1200;
const WORLD_H = 900;
const SEED = 4242;
const VIEW_W = 1400;
const VIEW_H = 1100;
const CHUNK = 256;

describe('a zoom re-bakes the ground chunk by chunk, in place', () => {
  it('rounds the camera step to a capped power of two', () => {
    expect(targetGroundStep(1)).toBe(1);
    expect(targetGroundStep(2)).toBe(1);
    expect(targetGroundStep(0.5)).toBe(2);
    expect(targetGroundStep(0.25)).toBe(4);
    expect(targetGroundStep(0)).toBe(1);
    expect(targetGroundStep(Number.NaN)).toBe(1);
  });

  it('re-bakes an off-step chunk at the target step, at most one per frame', () => {
    const map = generateRawTerrain(WORLD_W, WORLD_H, SEED, MapSize.Medium, 'continental');
    // The L3 props are `decor.tint`'s business; dropping them keeps this case about the ground step.
    map.decorations = [];
    const destination = destinationContext();
    // A view larger than the world at every zoom below, so the planned chunk set is the whole map and
    // is identical at 0.5× and 1× — every surface allocated while zooming is therefore a re-bake.
    const snapshot = (zoom: number): RenderSnapshot => ({
      worldMap: map,
      camera: { x: WORLD_W / 2, y: WORLD_H / 2, zoom },
      width: WORLD_W,
      height: WORLD_H,
      season: Season.Spring,
      dayInYear: 100,
      buildGhost: null,
      buildStripPreview: null,
      showGrid: false,
      showPaths: false,
    } as unknown as RenderSnapshot);

    const frame = (zoom: number): void => {
      counts.paintedPixels = 0;
      counts.drawnWidths = [];
      counts.created = [];
      drawGround(destination, snapshot(zoom), VIEW_W, VIEW_H);
    };

    resetTerrainCaches();

    // Settle at the 0.5× overview: the target step is 2, so every chunk canvas is 128 px wide.
    let frames = 0;
    for (; frames < 400; frames++) {
      frame(0.5);
      if (counts.paintedPixels === 0) break;
    }
    expect(counts.paintedPixels, `overview fill did not finish in ${frames} frames`).toBe(0);
    expect(counts.drawnWidths, 'a coarse chunk canvas was never drawn').toContain(CHUNK / 2);

    // A settled frame at the target step re-bakes nothing and allocates nothing.
    frame(0.5);
    expect(counts.paintedPixels).toBe(0);
    expect(counts.created, 'a chunk already at the target step was re-baked').toEqual([]);

    // Zoom in to 1:1 — every chunk's baked step is now coarser than the target, so each re-bakes.
    // A chunk's own canvas is larger than any single budgeted bake band, so area tells the two apart.
    const chunkSurfaces = (): number =>
      counts.created.filter((s) => s.width > 0 && s.width * s.height > GROUND_BAKE_PIXEL_BUDGET).length;
    const allocationsPerFrame: number[] = [];
    let sawTargetStepDraw = false;
    for (let f = 0; f < 500; f++) {
      frame(1);
      allocationsPerFrame.push(chunkSurfaces());
      if (counts.drawnWidths.includes(CHUNK)) sawTargetStepDraw = true;
      if (counts.paintedPixels === 0) break;
    }
    expect(counts.paintedPixels, 'the 1:1 refill did not finish').toBe(0);
    // The cap: one chunk (one canvas allocation) per frame, never the whole view at once.
    expect(Math.max(...allocationsPerFrame), 'more than one chunk was re-baked in a frame')
      .toBeLessThanOrEqual(1);
    expect(allocationsPerFrame.reduce((sum, n) => sum + n, 0), 'no chunk was re-baked')
      .toBeGreaterThan(0);
    expect(sawTargetStepDraw, 'no chunk was ever drawn at the target step').toBe(true);
  });
});
