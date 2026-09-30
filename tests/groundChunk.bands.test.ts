/**
 * The budgeted ground fill has to produce the same picture as the unbudgeted one.
 *
 * `renderer/terrain.ts` no longer bakes a 256² chunk in one frame: a chunk is filled in **horizontal
 * bands** under a per-frame pixel budget, because one chunk measures 100–300 ms of per-pixel shader
 * work and a fresh view of 20–24 of them blocked the main thread for 3.9–6.0 s (the "0 fps" stall
 * reported from play). That is only safe if a band written at its own row offset is identical to the
 * matching rows of a whole-chunk bake — the bake is documented as a pure function of the world
 * coordinate, and this case holds it to that.
 *
 * The bake only calls `createImageData` / `putImageData`, so the capture stub below is enough — no
 * canvas dependency, no browser (same harness as `groundLook.bands.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { GROUND_BAKE_PIXEL_BUDGET, drawGround, planGroundChunks, resetTerrainCaches } from '../src/game/renderer/terrain';
import { MapSize, Season, type WorldMap } from '../src/game/gameTypes';
import type { RenderSnapshot } from '../src/game/renderSnapshot';

interface CapturedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const capture: { image: CapturedImage | null } = { image: null };
/** Pixels the bake asked for, and the widths of every `drawImage` the frame issued. */
const counts = { paintedPixels: 0, drawnWidths: [] as number[] };
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
    // The decor overlay bake (`bakeTerrainDecor`) also strokes the rivers and the map frame on a
    // surface of its own.
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
    // A fresh surface per call, like the real `createCanvasSurface`: the budgeted fill writes bands into
    // one chunk canvas while the next chunk's stand-in lives in another.
    createElement: () => ({ width: 0, height: 0, getContext: () => surfaceContext() }),
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
const CHUNK = 256;

/** Bake one world rect and hand back the pixels it wrote. */
async function bakeRect(
  map: WorldMap,
  view: { x: number; y: number; width: number; height: number },
  step: number,
): Promise<CapturedImage> {
  const { bakeWhittakerGround } = await import('../src/game/renderer/whittakerTerrain');
  capture.image = null;
  bakeWhittakerGround(
    map, WORLD_W, WORLD_H, map.seaLevel ?? 0.24, map.moistureBias ?? 0,
    view, undefined, step,
  );
  if (!capture.image) throw new Error('the bake produced no image data');
  return capture.image;
}

/** FNV-1a over the pixels — cheap equality for a 256×256 surface. */
function hashPixels(d: Uint8ClampedArray): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
  return h;
}

describe('the ground bake is a pure function of the world rect it covers', () => {
  it('bakes a chunk in horizontal bands exactly as it bakes it whole', async () => {
    const map = generateRawTerrain(WORLD_W, WORLD_H, SEED, MapSize.Medium, 'continental');
    for (const step of [1, 2]) {
      const whole = await bakeRect(map, { x: CHUNK, y: CHUNK, width: CHUNK, height: CHUNK }, step);

      // Three bands — the shape the per-frame budget writes into the chunk canvas.
      const first = Math.floor(whole.height / 3);
      const bandRows = [first, first, whole.height - 2 * first];
      const stitched = new Uint8ClampedArray(whole.data.length);
      let worldY = CHUNK;
      let rowOffset = 0;
      for (const rows of bandRows) {
        const band = await bakeRect(map, { x: CHUNK, y: worldY, width: CHUNK, height: rows * step }, step);
        expect(band.width).toBe(whole.width);
        expect(band.height).toBe(rows);
        stitched.set(band.data, rowOffset);
        rowOffset += band.data.length;
        worldY += rows * step;
      }

      expect(rowOffset).toBe(whole.data.length);
      expect(hashPixels(stitched)).toBe(hashPixels(whole.data));
    }
  });

  it('plans the visible window nearest the view centre first, and covers it', () => {
    // The view centre has to sit inside the world for "the centre chunk is first" to mean anything:
    // at a wide zoom the camera can show void around the map slab, and then the nearest chunk wins.
    const view = { x: 400, y: 300, width: 500, height: 400 };
    const plan = planGroundChunks(WORLD_W, WORLD_H, CHUNK, view);

    // No chunk is planned twice.
    expect(new Set(plan.map((p) => `${p.x},${p.y}`)).size).toBe(plan.length);

    // The first chunk is the one under the view centre: the ground the player is looking at is baked
    // before the one-chunk margin around it.
    const centreX = view.x + view.width / 2;
    const centreY = view.y + view.height / 2;
    const [first] = plan;
    expect(first.x).toBeLessThanOrEqual(centreX);
    expect(first.x + CHUNK).toBeGreaterThan(centreX);
    expect(first.y).toBeLessThanOrEqual(centreY);
    expect(first.y + CHUNK).toBeGreaterThan(centreY);

    // Distance from the centre never decreases — the fill grows outward from the middle.
    const distance = (p: { x: number; y: number }): number =>
      Math.hypot(p.x + CHUNK / 2 - centreX, p.y + CHUNK / 2 - centreY);
    for (let i = 1; i < plan.length; i++) {
      expect(distance(plan[i])).toBeGreaterThanOrEqual(distance(plan[i - 1]));
    }

    // Every planned chunk is chunk-aligned and inside the world.
    for (const p of plan) {
      expect(p.x % CHUNK).toBe(0);
      expect(p.y % CHUNK).toBe(0);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(WORLD_W);
      expect(p.y).toBeLessThan(WORLD_H);
    }

    // The window still covers every chunk the viewport itself touches.
    const planned = new Set(plan.map((p) => `${p.x},${p.y}`));
    for (let x = Math.floor(view.x / CHUNK) * CHUNK; x < view.x + view.width; x += CHUNK) {
      for (let y = Math.floor(view.y / CHUNK) * CHUNK; y < view.y + view.height; y += CHUNK) {
        expect(planned.has(`${x},${y}`), `chunk ${x},${y} missing from the plan`).toBe(true);
      }
    }
  });
});

describe('the ground fill is budgeted per frame, and a season change costs nothing', () => {
  it('bakes no more than the per-frame budget, and never re-bakes for a season', () => {
    const map = generateRawTerrain(WORLD_W, WORLD_H, SEED, MapSize.Medium, 'continental');
    // The L3 props are `decor.tint`'s business, not the chunker's; dropping them keeps this case about
    // the fill (and keeps it fast).
    map.decorations = [];
    const view = { x: 400, y: 300, width: 512, height: 384 };
    // One context for the destination; the offscreen surfaces come from the document stub.
    const destination = destinationContext();
    const snapshot = (season: Season): RenderSnapshot => ({
      worldMap: map,
      camera: { x: view.x + view.width / 2, y: view.y + view.height / 2, zoom: 1 },
      width: WORLD_W,
      height: WORLD_H,
      season,
      dayInYear: 100,
      buildGhost: null,
      buildStripPreview: null,
      showGrid: false,
      showPaths: false,
    } as unknown as RenderSnapshot);

    /** Ground blits are chunk/preview sized; the one whole-map blit is the decor overlay. */
    const groundDraws = (): number => counts.drawnWidths.filter((w) => w <= CHUNK * 2).length;

    resetTerrainCaches();
    let frames = 0;
    let sawCoarseCover = false;
    let groundWasDrawn = false;
    for (; frames < 200; frames++) {
      counts.paintedPixels = 0;
      counts.drawnWidths = [];
      drawGround(destination, snapshot(Season.Spring), view.width, view.height);
      // A frame may overshoot the budget by at most the one-row minimum that keeps the fill moving.
      expect(counts.paintedPixels, `frame ${frames}`).toBeLessThanOrEqual(GROUND_BAKE_PIXEL_BUDGET + CHUNK);
      if (counts.drawnWidths.some((w) => w <= CHUNK / 2)) sawCoarseCover = true;
      if (groundDraws() > 0) groundWasDrawn = true;
      if (counts.paintedPixels === 0) break;
    }
    // The fill finished inside the loop, and something was on screen the whole time.
    expect(counts.paintedPixels, `fill did not finish in ${frames} frames`).toBe(0);
    expect(groundWasDrawn).toBe(true);
    // The coarse stand-ins cover the view before the crisp pass finishes — the ground arrives early.
    expect(sawCoarseCover).toBe(true);

    // The ground is **not** seasonal: the season is not part of the chunk key, so a rollover re-bakes
    // nothing and the map it is already showing stays. (It used to re-bake the whole view four times an
    // in-game year for a palette change.)
    counts.paintedPixels = 0;
    counts.drawnWidths = [];
    drawGround(destination, snapshot(Season.Winter), view.width, view.height);
    expect(counts.paintedPixels, 'a season change re-baked ground').toBe(0);
    expect(groundDraws(), 'a season change left the map with nothing to draw').toBeGreaterThan(0);
  });
});
