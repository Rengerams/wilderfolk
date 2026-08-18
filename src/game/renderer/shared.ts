import type { SpriteFrame } from '../spriteLoader';
import { BuildingType } from '../gameTypes';

let _lastRenderTime = 0;
/** Global render time in seconds, advanced once per frame by {@link tickRenderClock}. */
export let renderTime = 0;

/** Reset the render clock and all derived timing state. */
export function resetRenderClock(): void {
  _lastRenderTime = 0;
  renderTime = 0;
}

/** Advance the render clock from a DOMHighResTimeStamp; returns the new render time. */
export function tickRenderClock(now: number): number {
  const dt = _lastRenderTime > 0 ? Math.min(0.1, (now - _lastRenderTime) / 1000) : 1 / 60;
  _lastRenderTime = now;
  renderTime += dt;
  return renderTime;
}

// ============ COLOR UTILITIES ============
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

export function darkerColor(hex: string, factor = 0.35): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

/** Parse #rrggbb (or short) for 2.5D pad shading. */
export function parseHexRgb(color: string): { r: number; g: number; b: number } {
  const c = color.trim();
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    if (c.length === 7) {
      return {
        r: parseInt(c.slice(1, 3), 16),
        g: parseInt(c.slice(3, 5), 16),
        b: parseInt(c.slice(5, 7), 16),
      };
    }
    return {
      r: parseInt(c[1] + c[1], 16),
      g: parseInt(c[2] + c[2], 16),
      b: parseInt(c[3] + c[3], 16),
    };
  }
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return { r: 80, g: 90, b: 70 };
}

export function rgbaFromRgb(
  rgb: { r: number; g: number; b: number },
  a: number,
  shade = 0,
): string {
  const k = shade >= 0 ? 1 : 1 + shade;
  const lift = shade > 0 ? shade : 0;
  const r = Math.min(255, Math.max(0, rgb.r * k + (255 - rgb.r) * lift));
  const g = Math.min(255, Math.max(0, rgb.g * k + (255 - rgb.g) * lift));
  const b = Math.min(255, Math.max(0, rgb.b * k + (255 - rgb.b) * lift));
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

// ============ CANVAS PRIMITIVES ============
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ============ CACHED NAME WIDTHS ============
const _nameWidthCache = new Map<string, number>();
const NAME_WIDTH_CACHE_MAX = 512;

export function getCachedNameWidth(
  ctx: CanvasRenderingContext2D,
  fullName: string,
  fontSize: number,
  zoom: number,
): number {
  const key = `${fontSize.toFixed(2)}|${zoom.toFixed(3)}|${fullName}`;
  let tw = _nameWidthCache.get(key);
  if (tw == null) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    tw = ctx.measureText(fullName).width;
    if (_nameWidthCache.size >= NAME_WIDTH_CACHE_MAX) {
      const oldest = _nameWidthCache.keys().next().value;
      if (oldest != null) _nameWidthCache.delete(oldest);
    }
    _nameWidthCache.set(key, tw);
  }
  return tw;
}

export function clearNameWidthCache(): void {
  _nameWidthCache.clear();
}

// ============ SPRITE DRAWING CONSTANTS ============
export const DEFAULT_SPRITE_DISPLAY_SCALE = 1.15;

export const ISO_PANEL_BUILDINGS = new Set<BuildingType>([
  BuildingType.Wall,
  BuildingType.WallCorner,
  BuildingType.WallGate,
]);

export function isDrawableSpriteFrame(frame: SpriteFrame | null | undefined): frame is SpriteFrame {
  return !!frame?.image;
}
