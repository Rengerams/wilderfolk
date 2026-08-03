/**
 * Generate a seamless top-down wooden bridge deck sprite (our own art, no
 * external assets): 96×32, 3:1 — matches the Bridge building footprint
 * (64×22 drawn at 1.05×) so 'contain' fills the segment exactly.
 *
 * Design: vertical deck planks (perpendicular to travel) + railing with posts
 * on the two long edges. Vertical plank pattern → left/right edges are
 * naturally seamless, so a chain of bridge segments reads as one bridge.
 *
 * Run: node scripts/generate-bridge-sprite.mjs
 */
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const W = 96;
const H = 32;

// mulberry32 — deterministic grain so the deck looks consistent.
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

const rnd = mulberry32(20260803);
const px = Buffer.alloc(W * H * 4);

function set(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

// Plank palette — 4 vertical planks of 8px across the 32px short side.
const PLANKS = [
  { base: [148, 112, 72], drift: 16 },
  { base: [138, 104, 66], drift: 18 },
  { base: [154, 118, 76], drift: 14 },
  { base: [142, 107, 68], drift: 17 },
];

const RAIL = [88, 66, 40];
const RAIL_TOP = [120, 92, 58];
const GAP = [60, 42, 24];
const POST = [132, 102, 66];
const SHADOW = [40, 28, 16];

// Deck planks + grain.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const plank = PLANKS[Math.floor(x / 8) % PLANKS.length];
    const grain = (rnd() - 0.5) * plank.drift;
    let r = plank.base[0] + grain;
    let g = plank.base[1] + grain;
    let b = plank.base[2] + grain * 0.7;
    // Age streaks every so often.
    if (rnd() < 0.06) {
      r *= 0.92;
      g *= 0.92;
      b *= 0.92;
    }
    set(x, y, r, g, b);
  }
}

// Plank gaps — 1px dark lines at plank boundaries (every 8px, including the
// x=0 seam so chained segments keep the same rhythm across the wrap).
for (let x = 0; x < W; x += 8) {
  for (let y = 0; y < H; y++) {
    set(x, y, GAP[0], GAP[1], GAP[2]);
    // Subtle light edge on the west side of each gap (sunlit plank edge).
    set(x + 1, y, Math.min(255, 255 * 0.9), Math.min(255, 190 * 0.9), Math.min(255, 130 * 0.9));
  }
}

// Railings: dark runner on the two long edges + posts every 16px.
function drawRailing(edgeY, postOffset) {
  for (let x = 0; x < W; x++) {
    for (let d = 0; d < 3; d++) {
      const y = edgeY + d;
      set(x, y, RAIL[0], RAIL[1], RAIL[2]);
      set(x, y, RAIL_TOP[0], RAIL_TOP[1], RAIL_TOP[2]); // top-lit
    }
  }
  // Post shadows cast onto the deck.
  for (let x = 2; x < W - 2; x += 16) {
    const postEdgeY = edgeY + 3;
    for (let d = 0; d < 4; d++) {
      set(x + 1, postEdgeY + d, SHADOW[0], SHADOW[1], SHADOW[2]);
      set(x + 2, postEdgeY + d, SHADOW[0], SHADOW[1], SHADOW[2]);
    }
  }
  // Posts.
  for (let x = 1; x < W; x += 16) {
    for (let d = 0; d < 5; d++) {
      set(x, edgeY - 1 + d, POST[0], POST[1], POST[2]);
    }
  }
}
drawRailing(0, 0);
drawRailing(H - 3, 0);

// Plank-end shading where planks meet the railings (worn ends).
for (let x = 0; x < W; x++) {
  for (let y = 3; y < 6; y++) set(x, y, Math.max(0, px[(y * W + x) * 4] - 24), Math.max(0, px[(y * W + x) * 4 + 1] - 20), Math.max(0, px[(y * W + x) * 4 + 2] - 14));
  for (let y = H - 6; y < H - 3; y++) set(x, y, Math.max(0, px[(y * W + x) * 4] - 24), Math.max(0, px[(y * W + x) * 4 + 1] - 20), Math.max(0, px[(y * W + x) * 4 + 2] - 14));
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

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// Raw scanlines with filter byte 0.
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync('public/sprites/bridge.png', png);
console.log(`wrote public/sprites/bridge.png (${W}x${H}, ${png.length} bytes)`);
