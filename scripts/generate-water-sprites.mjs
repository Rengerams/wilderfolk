/**
 * Generate our own seamless water fill sprites (no external art):
 *   water_shallow_fill.png — light teal-blue, gentle wave bands + sparkles
 *   water_deep_fill.png   — deeper blue, stronger current bands, fewer sparkles
 *
 * Both are 128×128 seamless: horizontal sine wave bands with wavelengths that
 * divide the tile size (and phase-aligned at the wrap), so the baker's per-tile
 * hash-offset stamping keeps the whole map looking like one body of water.
 *
 * Run: node scripts/generate-water-sprites.mjs
 */
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const SIZE = 128;

// mulberry32 — deterministic grain/flecks.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTile(seed, base, bandCount, bandStrength, fleckCount, fleckAlpha) {
  const rnd = mulberry32(seed);
  const px = Buffer.alloc(SIZE * SIZE * 4);

  // Deterministic per-pixel grain (coordinate-hashed → seamless at wrap).
  const grain = (x, y, salt) => {
    let h = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Wave height: sum of `bandCount` sine bands. Wavelengths divide SIZE so
      // both axes wrap seamlessly (bands run horizontally).
      let wave = 0;
      for (let b = 0; b < bandCount; b++) {
        const len = SIZE / (b * 2 + 2); // 64, 32, 16...
        const phase = b * 1.7 + seed * 0.01;
        wave += Math.sin(((y + Math.sin(x / 24 + phase) * 3) / len) * Math.PI * 2 + phase) * (1 / (b + 1));
      }
      wave /= bandCount;

      const g = grain(x, y, seed) - 0.5;
      let r = base[0] + wave * bandStrength + g * 6;
      let gg = base[1] + wave * bandStrength * 0.85 + g * 6;
      let b = base[2] + wave * bandStrength * 1.15 + g * 6;
      r = Math.max(0, Math.min(255, r));
      gg = Math.max(0, Math.min(255, gg));
      b = Math.max(0, Math.min(255, b));

      const i = (y * SIZE + x) * 4;
      px[i] = r;
      px[i + 1] = gg;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }

  // Sparkle flecks — coordinate-hashed so they tile.
  for (let n = 0; n < fleckCount; n++) {
    const x = Math.floor(rnd() * SIZE);
    const y = Math.floor(rnd() * SIZE);
    const w = 1 + (rnd() < 0.3 ? 1 : 0);
    for (let dy = 0; dy < w; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const xx = (x + dx) % SIZE;
        const yy = (y + dy) % SIZE;
        const i = (yy * SIZE + xx) * 4;
        px[i] = Math.min(255, px[i] + 60);
        px[i + 1] = Math.min(255, px[i + 1] + 60);
        px[i + 2] = Math.min(255, px[i + 2] + 70);
      }
    }
  }

  // Soft sparkle glints as tiny bright dots (alpha via fleckAlpha).
  for (let n = 0; n < fleckCount * 2; n++) {
    const x = Math.floor(rnd() * SIZE);
    const y = Math.floor(rnd() * SIZE);
    const i = (y * SIZE + x) * 4;
    const lift = Math.min(120, 40 + rnd() * 60);
    px[i] = Math.min(255, px[i] + lift);
    px[i + 1] = Math.min(255, px[i + 1] + lift);
    px[i + 2] = Math.min(255, px[i + 2] + lift * 1.2);
    void fleckAlpha;
  }

  return px;
}

// --- Minimal PNG encoder (RGBA, no external deps) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(W, H, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const shallow = buildTile(11, [126, 200, 217], 3, 9, 6, 0.2);
const deep = buildTile(23, [63, 127, 166], 4, 13, 3, 0.15);

writeFileSync('public/sprites/terrain/water_shallow_fill.png', encodePng(SIZE, SIZE, shallow));
writeFileSync('public/sprites/terrain/water_deep_fill.png', encodePng(SIZE, SIZE, deep));
console.log('wrote water_shallow_fill.png + water_deep_fill.png (128x128 each)');
