/**
 * L3 decor renderer — draws the biome-density-driven ground props baked into
 * `WorldMap.decorations` (Teraforge's L3 layer), ported from Teraforge `render.ts`.
 */
import type { TerrainDecoration, WorldMap } from '../gameTypes';
import { clamp } from '../terrain/noise';

/**
 * Per-prop brightness variation, applied to the prop's own colours.
 *
 * Teraforge varies every prop's brightness so a dense field of one shape does not read as a stamped
 * pattern. That used to be done with a canvas filter (`ctx.filter = 'brightness(…)'`) set **per prop**,
 * which is a frame killer: the browser renders a filtered 2D draw as its own software-composited pass,
 * and this pass runs every frame over every prop in view. Measured on the built game, camera still, a
 * Medium map in a 1600×900 window: `decorations` holds 6 220 props, **4 283** of them in view, and
 * `terragen.placeDecorations` gives every one a non-zero tint — frames measured **p50 6 288 ms** as
 * shipped against **p50 109 ms** with the filter writes dropped in the same session. Shading the colour
 * itself costs one memoised lookup and keeps the vector art crisp at every zoom.
 */
const TINT_LEVELS = 9;
/** Peak brightness swing at |tint| = 1 — the `1 ± 0.18` the retired filter applied. */
const TINT_STRENGTH = 0.18;
const TINT_STEP = TINT_STRENGTH / TINT_LEVELS;

/** `#rgb` / `#rrggbb` / `rgb()` / `rgba()` → channels; `null` for anything else (left untouched). */
function parseColor(color: string): { r: number; g: number; b: number; a: string | null } | null {
  if (color.charCodeAt(0) === 35 /* # */) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: null,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: null,
      };
    }
    return null;
  }
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] ?? null };
}

/**
 * `color` at one tint level. Memoised per (level, colour): the palette is a few dozen literals and
 * `TINT_LEVELS * 2 + 1` levels, so the table settles after the first frame and every later lookup is a
 * map hit — no per-prop allocation, no compositor pass.
 */
const tintedCache = new Map<string, string>();

function tinted(color: string, level: number): string {
  if (level === 0) return color;
  const key = `${level}|${color}`;
  const cached = tintedCache.get(key);
  if (cached !== undefined) return cached;

  const rgba = parseColor(color);
  const factor = 1 + level * TINT_STEP;
  const out = rgba
    ? `rgba(${clamp(Math.round(rgba.r * factor), 0, 255)},${clamp(Math.round(rgba.g * factor), 0, 255)},${clamp(Math.round(rgba.b * factor), 0, 255)},${rgba.a ?? 1})`
    : color;
  tintedCache.set(key, out);
  return out;
}

/** Draw one decorative ground prop (no trees — those are Wilderfolk entities). */
function drawProp(ctx: CanvasRenderingContext2D, d: TerrainDecoration, s: number, v: number, flipX: boolean) {
  // Props draw around the origin; the caller translates/scales to the decor's screen position.
  const x = 0, y = 0;
  // The prop's brightness offset as a level, computed once and read by every colour below.
  const tint = Math.round(clamp(d.tint ?? 0, -1, 1) * TINT_LEVELS);
  const c = (color: string): string => tinted(color, tint);
  ctx.save();
  if (flipX) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
  switch (d.type) {
    case 'rock_small': {
      const r = 4.5 * s;
      ctx.fillStyle = c('#8a8780');
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.5, y - r); ctx.lineTo(x + r * 0.6, y - r * 0.8); ctx.lineTo(x + r, y); ctx.closePath(); ctx.fill();
      break;
    }
    case 'rock_big': {
      const r = 10 * s;
      ctx.fillStyle = c('rgba(24,36,20,0.18)'); ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + 2, r * 0.65, r * 0.22, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = c('#94918a');
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.5, y - r * 0.85); ctx.lineTo(x + r * 0.2, y - r); ctx.lineTo(x + r, y - r * 0.35); ctx.lineTo(x + r * 0.8, y); ctx.closePath(); ctx.fill();
      break;
    }
    case 'stump':
      ctx.fillStyle = c('#7a5b3a'); ctx.beginPath(); ctx.ellipse(x, y, 3.5 * s, 2.4 * s, 0, 0, 6.284); ctx.fill();
      break;
    case 'flower': {
      ctx.strokeStyle = c('#4a8a32'); ctx.lineWidth = 1.2 * s;
      for (let i = -1; i <= 1; i++) {
        const fx = x + i * 3 * s, bend = i * 1.8;
        ctx.beginPath(); ctx.moveTo(fx, y); ctx.quadraticCurveTo(fx + bend * 0.4 * s, y - 10 * s, fx + bend, y - 18 * s); ctx.stroke();
      }
      ctx.fillStyle = c(v % 2 === 0 ? '#f2d06b' : '#e8748c');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 6.284;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2.2 * s, y - 18 * s + Math.sin(a) * 2.2 * s, 1.6 * s, 0, 6.284); ctx.fill();
      }
      ctx.fillStyle = c('#e0a040'); ctx.beginPath(); ctx.arc(x, y - 18 * s, 0.9 * s, 0, 6.284); ctx.fill();
      break;
    }
    case 'bush': {
      ctx.fillStyle = c('rgba(20,35,15,0.18)'); ctx.beginPath(); ctx.ellipse(x, y, 8 * s, 3 * s, 0, 0, 6.284); ctx.fill();
      const layers = ['#38742e', '#408435', '#489040'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = c(layers[i]);
        ctx.beginPath(); ctx.arc(x + (i - 1) * 6 * s, y - 5 * s - (i % 2) * 2 * s, (6 - i) * s, 0, 6.284); ctx.fill();
      }
      break;
    }
    case 'tallgrass': {
      const blades = 4 + (v % 3);
      for (let i = 0; i < blades; i++) {
        const bx = x + (i - blades / 2) * 2.2 * s;
        const lean = (((v + i) % 5) - 2) * 1.5 * s;
        const h2 = 5 * s + ((v + i) % 4) * 1.5 * s;
        ctx.strokeStyle = c((v + i) % 3 === 0 ? '#5a9a38' : (v + i) % 3 === 1 ? '#4a8830' : '#6aaa42');
        ctx.lineWidth = 0.8 * s;
        ctx.beginPath(); ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx + lean * 0.4, y - h2 * 0.5, bx + lean, y - h2); ctx.stroke();
      }
      break;
    }
    case 'fern': {
      ctx.strokeStyle = c(v % 2 === 0 ? '#3d8a2e' : '#4a9a38'); ctx.lineWidth = 0.9 * s;
      const fronds = 4 + (v % 3);
      for (let i = 0; i < fronds; i++) {
        const angle = (i / fronds) * 3.14 - 1.57 + (v % 7) * 0.15;
        const len = 6 * s + (i % 3) * 2 * s;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(angle) * len * 0.5, y - len * 0.3, x + Math.cos(angle) * len, y - len * 0.7); ctx.stroke();
      }
      break;
    }
    case 'berries': {
      ctx.fillStyle = c('#3a7828');
      ctx.beginPath(); ctx.arc(x, y - 3 * s, 4 * s, 0, 6.284); ctx.arc(x + 3 * s, y - 2 * s, 3 * s, 0, 6.284); ctx.fill();
      ctx.fillStyle = c(v % 3 === 0 ? '#c83030' : v % 3 === 1 ? '#3040b0' : '#8828a0');
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(x - 2 * s + ((v + i * 7) % 6) * s, y - 4 * s + ((v + i * 3) % 4) * s, 1.2 * s, 0, 6.284); ctx.fill();
      }
      break;
    }
    case 'mushroom': {
      ctx.fillStyle = c('#c4a873'); ctx.fillRect(x - 1.1 * s, y - 2.8 * s, 2.2 * s, 3 * s);
      ctx.fillStyle = c(v % 3 === 0 ? '#c24a3a' : v % 3 === 1 ? '#d4a040' : '#e8c868');
      ctx.beginPath(); ctx.arc(x, y - 3.5 * s, 3.2 * s, Math.PI, 0); ctx.fill();
      break;
    }
    case 'log': {
      const len = 12 * s, th = 2.8 * s;
      ctx.save(); ctx.translate(x, y); ctx.rotate((v % 6) * 0.5);
      ctx.fillStyle = c('#6b5030'); ctx.beginPath(); ctx.roundRect(-len / 2, -th, len, th * 2, th); ctx.fill();
      ctx.fillStyle = c('#5a4228'); ctx.beginPath(); ctx.ellipse(-len / 2, 0, th, th, 0, 0, 6.284); ctx.fill();
      ctx.restore();
      break;
    }
    case 'reed':
      ctx.strokeStyle = c('#5d7a3c'); ctx.lineWidth = 1.2 * s; ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.moveTo(x + i * 2.2 * s, y); ctx.quadraticCurveTo(x + i * 2.8 * s, y - 4.5 * s, x + i * 4 * s, y - 9 * s); }
      ctx.stroke();
      break;
    case 'cattail': {
      ctx.strokeStyle = c('#5d7a3c'); ctx.lineWidth = 1 * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s, y - 8 * s, x + 2 * s, y - 14 * s); ctx.stroke();
      ctx.fillStyle = c('#7a5830'); ctx.beginPath(); ctx.roundRect(x + s, y - 14 * s, 2.2 * s, 5 * s, 1.1 * s); ctx.fill();
      break;
    }
    case 'scrub': {
      const twigs = 3 + v % 3;
      ctx.strokeStyle = c('#7a7060'); ctx.lineWidth = 0.7 * s;
      for (let i = 0; i < twigs; i++) {
        const tx = x + (i - twigs / 2) * 3 * s;
        const angle = ((v + i * 3) % 7 - 3) * 0.3;
        const h2 = 4 * s + (v + i) % 3 * 2 * s;
        ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + Math.sin(angle) * h2 * 0.4, y - h2); ctx.stroke();
      }
      break;
    }
    case 'lilypad': {
      ctx.fillStyle = c('rgba(60,120,55,0.75)');
      ctx.beginPath(); ctx.arc(x, y, 4 * s, 0.3 + v * 0.1, 5.9 + v * 0.1); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      break;
    }
    case 'bones': {
      ctx.strokeStyle = c('#d8d0c0'); ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 2 * s); ctx.lineTo(x + 4 * s, y + 2 * s);
      ctx.moveTo(x + 4 * s, y - 2 * s); ctx.lineTo(x - 4 * s, y + 2 * s); ctx.stroke();
      break;
    }
    case 'driftwood': {
      ctx.strokeStyle = c('#9a8868'); ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 5 * s, y); ctx.quadraticCurveTo(x, y - 2 * s, x + 5 * s, y + s); ctx.stroke();
      break;
    }
    case 'cactus': {
      ctx.fillStyle = c('#4e8a4a'); ctx.beginPath(); ctx.roundRect(x - 2.2 * s, y - 13 * s, 4.4 * s, 13 * s, 2.2 * s); ctx.fill();
      ctx.beginPath(); ctx.roundRect(x + 2 * s, y - 10 * s, 3.5 * s, 2.5 * s, 1.2 * s); ctx.roundRect(x + 4.5 * s, y - 10.5 * s, 2.5 * s, 5.5 * s, 1.2 * s); ctx.fill();
      break;
    }
    case 'dirt_patch': {
      ctx.save(); ctx.translate(x, y); ctx.rotate((v % 5) * 0.6);
      ctx.fillStyle = c('rgba(140,115,75,0.35)');
      ctx.beginPath(); ctx.ellipse(0, 0, 8 * s, 4 * s, 0, 0, 6.284); ctx.fill();
      ctx.restore();
      break;
    }
    default: break;
  }
  ctx.restore();
}

/** World px of one bucket in {@link decorIndexFor} — the ground chunk edge, so a chunk's props are one
 *  bucket lookup plus its eight neighbours. */
const DECOR_INDEX_CELL = 256;

/**
 * The props, bucketed by the ground-chunk cell they stand in, **built once per map**.
 *
 * The bake is per viewport chunk now (see {@link bakeDecorInRect}), and walking all 6,220 props on a
 * Medium map — 36,110 on Huge, and hundreds of thousands at the spec sizes — for every one of the
 * ~50 chunks a viewport holds would put the per-frame prop cost straight back. A `WeakMap` keyed on the
 * map means a new game or a loaded save drops its index with the world it belongs to.
 */
const decorIndexCache = new WeakMap<WorldMap, Map<string, TerrainDecoration[]>>();

function decorIndexFor(map: WorldMap): Map<string, TerrainDecoration[]> {
  const cached = decorIndexCache.get(map);
  if (cached) return cached;
  const index = new Map<string, TerrainDecoration[]>();
  for (const d of map.decorations ?? []) {
    const key = `${Math.floor(d.x / DECOR_INDEX_CELL)},${Math.floor(d.y / DECOR_INDEX_CELL)}`;
    const bucket = index.get(key);
    if (bucket) bucket.push(d);
    else index.set(key, [d]);
  }
  decorIndexCache.set(map, index);
  return index;
}

/**
 * Bake one chunk's decor — the river courses then the L3 props standing in `rect` — into `ctx`.
 *
 * `rect` is the chunk's world rect **already widened by the overhang margin**, and `ctx` maps that rect
 * at `scale` canvas px per world px, so a prop translated to `(d.x - rect.x) * scale` lands exactly
 * where the world puts it. The margin is the point: a prop's art reaches ~24 world px from its origin,
 * and drawing it into a canvas that stopped at the chunk edge would slice it along a visible grid.
 *
 * The props are static for the life of a world — `terragen.placeDecorations` writes them at generation
 * and nothing mutates them since — so this runs once per chunk, not once per frame. Drawing them per
 * frame was the largest single cost in the frame: a CPU profile of one built session (drag pan, dev
 * build) put `drawProp`, `tinted` and the transforms plus most of the `stroke`/`fill`/`arc`/`ellipse`
 * time at **~35 % of main-thread work**. Returns how many props were baked.
 */
export function bakeDecorInRect(
  ctx: CanvasRenderingContext2D,
  map: WorldMap,
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
): number {
  if (scale <= 0) return 0;

  // River courses. Stroked per chunk rather than onto one full-map surface — the canvas clips them to
  // the chunk, so only the part that belongs here is painted, and the bounding-box test keeps a river
  // that does not come near this chunk from being walked at all.
  for (const river of map.rivers ?? []) {
    if (river.length < 2) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of river) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (maxX < rect.x || maxY < rect.y || minX > rect.x + rect.width || minY > rect.y + rect.height) continue;
    ctx.save();
    ctx.strokeStyle = 'rgba(24, 54, 86, 0.16)';
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo((river[0].x - rect.x) * scale, (river[0].y - rect.y) * scale);
    for (let i = 1; i < river.length; i++) {
      ctx.lineTo((river[i].x - rect.x) * scale, (river[i].y - rect.y) * scale);
    }
    ctx.stroke();
    ctx.restore();
  }

  const decorations = map.decorations;
  if (!decorations || decorations.length === 0) return 0;
  const index = decorIndexFor(map);
  const firstCellX = Math.floor(rect.x / DECOR_INDEX_CELL);
  const firstCellY = Math.floor(rect.y / DECOR_INDEX_CELL);
  const lastCellX = Math.floor((rect.x + rect.width) / DECOR_INDEX_CELL);
  const lastCellY = Math.floor((rect.y + rect.height) / DECOR_INDEX_CELL);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  let baked = 0;
  for (let cy = firstCellY; cy <= lastCellY; cy++) {
    for (let cx = firstCellX; cx <= lastCellX; cx++) {
      const bucket = index.get(`${cx},${cy}`);
      if (!bucket) continue;
      for (const d of bucket) {
        // The prop's **origin** decides which chunk paints it (the margin above is what keeps its art
        // whole), so it is drawn exactly once even though neighbouring rects overlap.
        if (d.x < rect.x || d.y < rect.y || d.x >= right || d.y >= bottom) continue;
        ctx.save();
        // Same shape as the live draw this replaces — translate to the prop, scale the canvas, draw
        // around the origin — so a scale of 1 bakes the art the frame used to draw directly.
        ctx.translate((d.x - rect.x) * scale, (d.y - rect.y) * scale);
        ctx.scale(scale, scale);
        drawProp(ctx, d, d.scale, d.variant, d.flipX);
        ctx.restore();
        baked++;
      }
    }
  }
  return baked;
}
