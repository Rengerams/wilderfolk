/**
 * Repaint the remaining green-teal atlas water tiles to the blue water family.
 *
 * Background (bug: rivers invisible on the main canvas, visible on the minimap):
 * The terrain bake stamps atlas water tiles for River/ShallowWater/DeepWater.
 * A full river channel interior is "all water" corners -> ATLAS_TILES[0b1111] =
 * tile id 61, which was a flat green-teal rgb(83,120,111) — nearly the same hue
 * family as the grass tiles, so rivers read as land while the minimap (which
 * colors River tiles #3b82a8 directly) showed blue rivers.
 *
 * An earlier fix (e2ed5df) repainted tiles 60/72/73/74/97 but missed 61/62/84/85/96.
 * This script finishes the job with the same per-color swap, preserving the
 * shading structure and the sand/grass shore pixels:
 *
 *   rgb(83,120,111) -> rgb(73,85,126)   base water
 *   rgb(54,99,101)  -> rgb(39,50,106)   darker water
 *   rgb(42,78,79)   -> rgb(30,39,82)    darkest water
 *   rgb(94,143,121) -> rgb(42,104,154)  teal shimmer -> blue shimmer
 *
 * Usage: node scripts/repaint-atlas-water.mjs
 * (PNG decode/re-encode is zlib-only, no dependencies.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const PATH = 'public/sprites/tileset_grass.png';
const TILES = new Set([61, 62, 84, 85, 96]);
const TS = 16;
const COLS = 12;

/** Color swap table — green-teal water shades -> blue water family. */
const SWAP = new Map([
  ['83,120,111', [73, 85, 126]],
  ['54,99,101', [39, 50, 106]],
  ['42,78,79', [30, 39, 82]],
  ['94,143,121', [42, 104, 154]],
]);

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// --- decode ---
const buf = readFileSync(PATH);
let off = 8;
let width = 0, height = 0, bitDepth = 0, colorType = 0;
const idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === 'IDAT') {
    idat.push(data);
  } else if (type === 'IEND') break;
  off += 12 + len;
}
if (colorType !== 6 || bitDepth !== 8) {
  console.error(`unexpected format: colorType=${colorType} bitDepth=${bitDepth}`);
  process.exit(1);
}
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
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
        break;
      }
    }
    out[x] = v;
  }
  prev = out;
}

// --- swap colors only inside the target tile regions ---
let swapped = 0;
for (const id of TILES) {
  const sx = (id % COLS) * TS;
  const sy = Math.floor(id / COLS) * TS;
  for (let y = sy; y < sy + TS; y++) {
    for (let x = sx; x < sx + TS; x++) {
      const i = y * stride + x * 4;
      const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
      const to = SWAP.get(key);
      if (to && pixels[i + 3] === 255) {
        pixels[i] = to[0];
        pixels[i + 1] = to[1];
        pixels[i + 2] = to[2];
        swapped++;
      }
    }
  }
}
console.log(`swapped ${swapped} pixels across tiles ${[...TILES].join(', ')}`);
if (swapped === 0) {
  console.error('no pixels swapped — aborting, nothing written');
  process.exit(1);
}

// --- re-encode (filter 0 scanlines, lossless) ---
const filtered = Buffer.alloc(height * (stride + 1));
for (let y = 0; y < height; y++) {
  filtered[y * (stride + 1)] = 0; // None filter
  pixels.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
}
const idatData = zlib.deflateSync(filtered, { level: 9 });
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace
const out = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idatData),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(PATH, out);
console.log(`wrote ${PATH} (${out.length} bytes)`);
