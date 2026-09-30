/**
 * L3 decor props: baked per ground chunk, once, with the brightness variation carried by the prop's own
 * colours rather than a canvas `filter`.
 *
 * Three costs are pinned here.
 *
 * **The props are static.** `terragen.placeDecorations` writes them at generation and nothing mutates
 * them since, so they are baked once with the chunk that holds them instead of being re-drawn every
 * frame — a CPU profile of a built session (drag pan, dev build) put `drawProp`, `tinted` and the
 * transforms plus most of the `stroke`/`fill`/`arc`/`ellipse` time at **~35 % of main-thread work**,
 * over 6,220 props on a Medium map and 36,110 on Huge.
 *
 * **They are baked per viewport chunk**, not onto one full-map surface: a whole-map decor canvas is
 * 4.3 MB at 1200×900 but **113 MB at the 6144×4608 spec size** the renderer is built for, and only the
 * chunks the camera plans (visible rect plus one chunk of margin) are ever baked — props off screen cost
 * nothing.
 *
 * **And the variation is not a canvas `filter`.** `brightness(…)` per prop makes each 2D draw its own
 * software-composited pass — measured in one live session at **p50 6,288 ms** per frame against
 * **p50 109 ms** with the filter writes dropped. That is the 0 FPS stall reported from play.
 */
import { describe, expect, it } from 'vitest';
import { bakeDecorInRect } from '../src/game/renderer/decor';
import type { TerrainDecoration, WorldMap } from '../src/game/gameTypes';

interface Recorded {
  fills: string[];
  strokes: string[];
  filters: string[];
}

/** Minimal 2D context: records the paint state the decor pass sets, and the transforms it uses. */
function recordingCtx(): { ctx: CanvasRenderingContext2D; log: Recorded } {
  const log: Recorded = { fills: [], strokes: [], filters: [] };
  const noop = (): void => {};
  const ctx = {
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    closePath: noop,
    arc: noop,
    ellipse: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    get fillStyle(): string { return log.fills[log.fills.length - 1] ?? ''; },
    set fillStyle(value: string) { log.fills.push(value); },
    get strokeStyle(): string { return log.strokes[log.strokes.length - 1] ?? ''; },
    set strokeStyle(value: string) { log.strokes.push(value); },
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    get filter(): string { return log.filters[log.filters.length - 1] ?? 'none'; },
    set filter(value: string) { log.filters.push(value); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

/** One bush prop — its first colour is the ground shadow, its layers are `bush`'s greens. */
function decorationsWith(tint: number): TerrainDecoration[] {
  return [{ x: 0, y: 0, type: 'bush', scale: 1, variant: 0, flipX: false, tint }];
}

/** A map carrying just those props (and no rivers) — all `bakeDecorInRect` reads. */
function mapWith(decorations: TerrainDecoration[] | undefined): WorldMap {
  return { decorations, rivers: [] } as unknown as WorldMap;
}

/** The chunk rect the bake is given, widened by the overhang margin the props are baked against. */
const CHUNK_RECT = { x: -32, y: -32, width: 320, height: 320 };

/** Channels of either form the pass emits: the authored `#rrggbb` or a shaded `rgb()/rgba()`. */
function rgbOf(css: string): { r: number; g: number; b: number } {
  if (css.startsWith('#')) {
    const hex = css.slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const match = /^rgba?\((\d+),(\d+),(\d+)/.exec(css);
  if (!match) throw new Error(`not a colour: ${css}`);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

/** `bush`'s first green layer as authored. */
const BUSH_LAYER = { r: 0x38, g: 0x74, b: 0x2e };

describe('L3 decor props — baked per chunk, tinted by shading, never by a canvas filter', () => {
  it('bakes the props in its rect without writing a canvas filter, and shades their colours', () => {
    const { ctx, log } = recordingCtx();
    const baked = bakeDecorInRect(ctx, mapWith(decorationsWith(1)), CHUNK_RECT, 1);

    // The props are baked into the chunk, once — the count is the contract.
    expect(baked).toBe(1);
    // The stall: any non-'none' filter write here is a software-composited draw per prop.
    expect(log.filters.filter((f) => f !== 'none')).toEqual([]);
    expect(log.fills.length).toBeGreaterThan(1);

    // The prop's own colours carry the variation — a 1.18× brightness at tint = 1, matching the
    // `brightness(1 + tint * 0.18)` the retired filter applied.
    const layer = log.fills.map(rgbOf).find((c) => Math.abs(c.g - BUSH_LAYER.g * 1.18) <= 1);
    expect(layer, `no shaded bush green among ${JSON.stringify(log.fills)}`).toBeDefined();
    expect(layer!.r).toBeGreaterThanOrEqual(Math.round(BUSH_LAYER.r * 1.18) - 1);
    expect(layer!.b).toBeGreaterThanOrEqual(Math.round(BUSH_LAYER.b * 1.18) - 1);
  });

  it('leaves the authored colour untouched at tint 0 and darkens it at a negative tint', () => {
    const neutral = recordingCtx();
    bakeDecorInRect(neutral.ctx, mapWith(decorationsWith(0)), CHUNK_RECT, 1);
    const base = neutral.log.fills.map(rgbOf).find((c) => c.r === BUSH_LAYER.r && c.g === BUSH_LAYER.g);
    expect(base, `authored bush green missing from ${JSON.stringify(neutral.log.fills)}`).toBeDefined();
    expect(neutral.log.filters).toEqual([]);

    const dark = recordingCtx();
    bakeDecorInRect(dark.ctx, mapWith(decorationsWith(-1)), CHUNK_RECT, 1);
    const shaded = dark.log.fills.map(rgbOf).find((c) => Math.abs(c.g - BUSH_LAYER.g * 0.82) <= 1);
    expect(shaded, `no darkened bush green among ${JSON.stringify(dark.log.fills)}`).toBeDefined();
    expect(shaded!.g).toBeLessThan(BUSH_LAYER.g);
  });

  it('bakes nothing for a map with no props, and nothing for a rect they all stand outside', () => {
    const empty = recordingCtx();
    expect(bakeDecorInRect(empty.ctx, mapWith(undefined), CHUNK_RECT, 1)).toBe(0);
    expect(bakeDecorInRect(empty.ctx, mapWith([]), CHUNK_RECT, 1)).toBe(0);
    expect(empty.log.fills).toEqual([]);

    // The prop's **origin** decides which chunk paints it, so a neighbouring chunk that only its art
    // overlaps paints nothing — that is what keeps every prop drawn exactly once.
    const neighbour = recordingCtx();
    expect(bakeDecorInRect(neighbour.ctx, mapWith(decorationsWith(1)), { x: 300, y: 0, width: 320, height: 320 }, 1)).toBe(0);
    expect(neighbour.log.fills).toEqual([]);
  });
});
