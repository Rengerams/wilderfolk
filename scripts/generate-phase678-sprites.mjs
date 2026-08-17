/**
 * Generate Phase 6 building sprites — our own art, no external assets.
 *   fishingspot.png       52×40 — wooden dock on water, fishing rod + bobber
 *   wildlife_preserve.png 64×64 — fenced wild grove (trees inside a fence)
 * Run: node scripts/generate-phase678-sprites.mjs
 */
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

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

// ── raw PNG writer ────────────────────────────────────────────────────────
function writePng(file, w, h, rgba) {
  // rows: filter byte 0 + RGBA scanline
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
  console.log('wrote', file, `${w}×${h}`);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

// ── helpers ───────────────────────────────────────────────────────────────
function makeCanvas(w, h) {
  return { w, h, px: new Uint8ClampedArray(w * h * 4) };
}
function set(c, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4;
  const na = a / 255;
  c.px[i] = Math.round(r * na + c.px[i] * (1 - na));
  c.px[i + 1] = Math.round(g * na + c.px[i + 1] * (1 - na));
  c.px[i + 2] = Math.round(b * na + c.px[i + 2] * (1 - na));
  c.px[i + 3] = Math.min(255, c.px[i + 3] + a);
}
function rect(c, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(c, x, y, r, g, b, a);
}
function ellipse(c, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) set(c, x, y, r, g, b, a);
    }
  }
}
function circle(c, cx, cy, rad, r, g, b, a = 255) { ellipse(c, cx, cy, rad, rad, r, g, b, a); }

// ── 1. Fishing Spot 52×40 ─────────────────────────────────────────────────
{
  const W = 52, H = 40;
  const c = makeCanvas(W, H);
  const rnd = mulberry32(20260817);
  // Water under the dock
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(c, x, y, 14, 80, 130, 255);
  // gentle water ripples
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
    circle(c, x, y, 1 + rnd() * 1.5, 56, 130, 190, 90);
  }
  // Dock planks (vertical, dry wood) spanning most of the sprite
  for (let x = 6; x <= 44; x++) {
    const shade = 0.82 + rnd() * 0.18;
    for (let y = 20; y <= 33; y++) set(c, x, y, 120 * shade, 82 * shade, 46 * shade, 255);
  }
  // plank gaps
  for (let x = 6; x <= 44; x += 4) for (let y = 20; y <= 33; y++) set(c, x, y, 66, 44, 24, 255);
  // dock edge highlight
  rect(c, 6, 19, 44, 19, 150, 108, 66, 255);
  // posts into the water
  for (const px of [8, 22, 36, 43]) { rect(c, px - 1, 18, px + 1, 33, 84, 56, 30, 255); }
  // fisherman: simple figure on the dock (body + head)
  ellipse(c, 26, 14, 4, 5, 40, 40, 48, 255);      // torso
  circle(c, 26, 7, 3, 235, 190, 150, 255);        // head
  rect(c, 24, 6, 28, 6, 60, 40, 20, 255);         // hat brim
  // rod: long line from hand to the right, over the water
  rect(c, 30, 10, 47, 9, 120, 96, 64, 255);       // rod
  rect(c, 47, 7, 48, 10, 120, 96, 64, 255);
  // line down + bobber
  rect(c, 47, 10, 47, 20, 210, 225, 235, 200);
  circle(c, 47, 22, 2, 235, 90, 40, 255);         // bobber
  writePng('public/sprites/fishingspot.png', W, H, c.px);
}

// ── 2. Wildlife Preserve 64×64 ────────────────────────────────────────────
{
  const W = 64, H = 64;
  const c = makeCanvas(W, H);
  const rnd = mulberry32(20260818);
  // grassy ground
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = 40 + rnd() * 26;
    set(c, x, y, 22, g, 14, 255);
  }
  // scatter flowers/light grass tufts
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(4 + rnd() * (W - 8)), y = Math.floor(4 + rnd() * (H - 8));
    circle(c, x, y, 1, 170 + rnd() * 60, 190, 90, 140);
  }
  // trees inside (trunk + canopy), avoiding the fence band
  const trees = [[18, 18], [44, 20], [30, 38], [16, 44], [46, 44]];
  for (const [tx, ty] of trees) {
    const tr = 7 + rnd() * 2;
    rect(c, tx - 1, ty, tx + 1, ty + 6, 78, 52, 28, 255);
    circle(c, tx, ty - 4, tr, 26, 96, 38, 255);
    circle(c, tx - 4, ty - 1, tr * 0.7, 30, 108, 42, 255);
    circle(c, tx + 4, ty - 1, tr * 0.7, 22, 88, 32, 255);
  }
  // fence (wood posts + rails) around the edge
  for (let x = 3; x <= W - 4; x++) {
    set(c, x, 4, 132, 96, 54, 255); set(c, x, 5, 132, 96, 54, 255);
    set(c, x, H - 5, 132, 96, 54, 255); set(c, x, H - 6, 132, 96, 54, 255);
  }
  for (let y = 3; y <= H - 4; y++) {
    set(c, 4, y, 132, 96, 54, 255); set(c, 5, y, 132, 96, 54, 255);
    set(c, W - 5, y, 132, 96, 54, 255); set(c, W - 6, y, 132, 96, 54, 255);
  }
  // fence posts at intervals
  for (let x = 3; x <= W - 4; x += 8) { rect(c, x - 1, 2, x + 1, 8, 96, 66, 34, 255); rect(c, x - 1, H - 9, x + 1, H - 3, 96, 66, 34, 255); }
  for (let y = 3; y <= H - 4; y += 8) { rect(c, 2, y - 1, 8, y + 1, 96, 66, 34, 255); rect(c, W - 9, y - 1, W - 3, y + 1, 96, 66, 34, 255); }
  // a small pond
  ellipse(c, 32, 56, 8, 4, 30, 110, 160, 200);
  writePng('public/sprites/wildlife_preserve.png', W, H, c.px);
}
