/**
 * Regression: rivers were invisible on the main canvas but visible on the
 * minimap. The minimap colors River tiles directly (blue), while the main
 * canvas bakes the painted terrain atlas. The atlas "all water" tile (id 61,
 * used for river channel interiors) and edge tiles 62/84/85/96 were painted
 * murky green-teal — nearly the same hue family as grass — so rivers read as
 * land. A first fix (e2ed5df) repainted only 60/72/73/74/97. This test pins
 * that every atlas water tile stays blue-dominant (blue channel > green), and
 * that the ocean texture rivers stamp is saturated enough to stay blue under
 * the season wash (which tints land green but must not change water).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ATLAS_PATH = fileURLToPath(new URL('../public/sprites/tileset_grass.png', import.meta.url));
const OCEAN_PATH = fileURLToPath(new URL('../public/sprites/ocean.png', import.meta.url));
const TS = 16;
const COLS = 12;

/** Water-family tiles used by ATLAS_TILES (all-water + shore transitions). */
const WATER_TILE_IDS = [60, 61, 62, 72, 73, 74, 84, 85, 96, 97];

/** Decode any RGBA PNG into raw pixel bytes (zlib only, no deps). */
function decodePng(path: string): Buffer {
  const buf = readFileSync(path);
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (colorType !== 6) throw new Error(`${path}: expected RGBA, got colorType ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
      }
      out[x] = v;
    }
    prev = out;
  }
  return pixels;
}

/** Average RGBA over a rectangular tile region (skips transparent pixels). */
function tileAvgChannels(
  pixels: Buffer,
  width: number,
  sx: number,
  sy: number,
  size: number,
): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = sy; y < sy + size; y++) {
    for (let x = sx; x < sx + size; x++) {
      const i = y * width * 4 + x * 4;
      if (pixels[i + 3] < 40) continue; // skip transparent
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      n++;
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

describe('terrain atlas water tile colors', () => {
  it('every water tile is blue-dominant (blue > green) so rivers read as water', () => {
    const pixels = decodePng(ATLAS_PATH);
    const width = 192; // 12 cols × 16px
    for (const id of WATER_TILE_IDS) {
      const sx = (id % COLS) * TS;
      const sy = Math.floor(id / COLS) * TS;
      const { r, g, b } = tileAvgChannels(pixels, width, sx, sy, TS);
      // Water must be blue-family. Grass tiles sit at g≈151–159; fixed water
      // tiles sit at b≈102–126 with g≈76–90.
      expect(b, `tile ${id}: expected blue-dominant water (b=${b.toFixed(0)} g=${g.toFixed(0)})`)
        .toBeGreaterThan(g);
      expect(r, `tile ${id}: expected blue-dominant water (b=${b.toFixed(0)} r=${r.toFixed(0)})`)
        .toBeLessThan(b);
    }
  });

  it('water tiles are clearly separated from the grass palette', () => {
    const pixels = decodePng(ATLAS_PATH);
    const width = 192;
    const grassAvg = tileAvgChannels(pixels, width, TS, 0, TS); // a plain grass base
    for (const id of WATER_TILE_IDS) {
      const sx = (id % COLS) * TS;
      const sy = Math.floor(id / COLS) * TS;
      const { b } = tileAvgChannels(pixels, width, sx, sy, TS);
      expect(b, `tile ${id}: water blue must exceed grass blue (${b.toFixed(0)} vs ${grassAvg.b.toFixed(0)})`)
        .toBeGreaterThan(grassAvg.b + 20);
    }
  });
});

describe('ocean water texture', () => {
  it('is saturated blue (b - g > 50) so rivers stay blue in every season', () => {
    // Regression: rivers invisible on the main canvas. The light-cyan shallow
    // fill (b−g≈17) turned green under the spring wash (which adds ~30 green),
    // so river tiles read as land. ocean.png is the azure texture river and
    // shallow-water tiles stamp; it must stay strongly blue-dominant so the
    // season wash (which now skips water anyway) can never turn rivers green.
    const pixels = decodePng(OCEAN_PATH);
    const { r, g, b } = tileAvgChannels(pixels, 128, 0, 0, 128);
    expect(b - g, `ocean must be saturated blue (b=${b.toFixed(0)} g=${g.toFixed(0)})`)
      .toBeGreaterThan(50);
    expect(b - r, `ocean must be blue over red (b=${b.toFixed(0)} r=${r.toFixed(0)})`)
      .toBeGreaterThan(50);
  });
});
