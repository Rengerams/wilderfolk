/**
 * Generate the axis-aligned medieval stone wall segments (our own art, no external assets).
 *
 * WHY THESE EXIST. A wall run is **axis-aligned** — `BuildingRotation` is `0 | 90` and the world→screen
 * transform is a plain scale+translate with no isometric skew (`viewState.worldToScreen`) — but the old
 * art (`wall_isometric.png`) is a 45° isometric face, so drawing it once per 60 px piece produced a
 * sawtooth and the procedural palisade that replaced it read as a flat blue bar. A wall needs *height*
 * (or it is indistinguishable from `road.png`, which is a flat cobble band) and it needs masonry.
 *
 * So: a real ashlar wall in the same 3/4 "camera looking from the south, slightly above" view as
 * `house.png`, drawn in the direction the run actually goes.
 *
 *   wall_h.png  east–west run: crenellated battlement over staggered ashlar courses.
 *               Tiles seamlessly left↔right — every pattern period divides the width and no border
 *               is drawn on the left/right edges, so N pieces read as one wall.
 *   wall_v.png  north–south run: the same wall seen edge-on down the run. Tiles seamlessly top↕bottom.
 *
 * The renderer draws these at exactly the strip pitch (`along` = 60 world px) so consecutive pieces
 * abut, anchored on the wall's BASE so the height rises off the footprint.
 *
 * Run: node scripts/generate-wall-sprites.mjs
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

// ── Mineral palette: cold grey ashlar with a warm-lit coping, like `wall_corner.png`. ──────────────
const MORTAR = [58, 62, 72];
const FACE_DARK = [96, 102, 114];
const FACE_LIGHT = [138, 145, 158];
const COPING_LIT = [176, 183, 194];
const COPING_MID = [142, 149, 161];
const MERLON_LIT = [186, 193, 203];
const MERLON_SIDE = [128, 135, 148];
const SHADOW = [34, 37, 44];

function makeCanvas(W, H) {
  const px = Buffer.alloc(W * H * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    px[i] = Math.max(0, Math.min(255, Math.round(r)));
    px[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    px[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    px[i + 3] = a;
  };
  const get = (x, y) => {
    const i = (y * W + x) * 4;
    return [px[i], px[i + 1], px[i + 2], px[i + 3]];
  };
  const fill = (x0, y0, w, h, c, a = 255) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c[0], c[1], c[2], a);
  };
  return { px, set, get, fill };
}

function encodePng(W, H, px) {
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** One ashlar block: lit top edge, shaded bottom, per-block tone and speckle. */
function ashlar(c, x0, y0, w, h, rnd, toneShift = 0) {
  const t = (rnd() - 0.5) * 26 + toneShift;
  const base = [
    (FACE_DARK[0] + FACE_LIGHT[0]) / 2 + t,
    (FACE_DARK[1] + FACE_LIGHT[1]) / 2 + t,
    (FACE_DARK[2] + FACE_LIGHT[2]) / 2 + t,
  ];
  for (let y = y0; y < y0 + h; y++) {
    // vertical falloff: lit at the top of the block, darker toward its base
    const f = 1 - ((y - y0) / Math.max(1, h)) * 0.22;
    for (let x = x0; x < x0 + w; x++) {
      const speckle = rnd() < 0.10 ? -14 : rnd() < 0.08 ? 10 : 0;
      c.set(x, y, (base[0] + speckle) * f, (base[1] + speckle) * f, (base[2] + speckle) * f);
    }
  }
  // 1px mortar on the block's right and bottom, drawn inside the block
  for (let y = y0; y < y0 + h; y++) c.set(x0 + w - 1, y, MORTAR[0], MORTAR[1], MORTAR[2]);
  for (let x = x0; x < x0 + w; x++) c.set(x, y0 + h - 1, MORTAR[0], MORTAR[1], MORTAR[2]);
  // sunlit top rim
  for (let x = x0 + 1; x < x0 + w - 1; x++) {
    c.set(x, y0, base[0] * 1.18, base[1] * 1.18, base[2] * 1.18);
  }
}

/**
 * East–west wall segment. `W` is the tile width, so every period must divide it for a seamless run.
 * Layout: [transparent] · merlons · coping (top surface) · masonry face · plinth.
 */
function buildHorizontal() {
  const W = 144; // 2.4× the 60 world-px pitch, matching house.png's density
  const H = 132;
  const c = makeCanvas(W, H);
  const rnd = mulberry32(20260929);

  const MERLON_TOP = 14;
  const MERLON_BOTTOM = 40; // merlons sit on the coping
  const COPING_TOP = 40;
  const COPING_BOTTOM = 58;
  const FACE_TOP = 58;
  const FACE_BOTTOM = 122;
  const PLINTH_BOTTOM = 130;

  // Crenellations. Period divides 144 (48) → 3 merlons per tile, flush at both edges.
  const PERIOD = 48;
  const MERLON_W = 28;
  for (let x = 0; x < W; x++) {
    const phase = x % PERIOD;
    const isMerlon = phase < MERLON_W;
    if (!isMerlon) continue;
    for (let y = MERLON_TOP; y < MERLON_BOTTOM; y++) {
      const edge = phase < 2 || phase >= MERLON_W - 2;
      const top = y < MERLON_TOP + 4;
      if (top) c.set(x, y, MERLON_LIT[0], MERLON_LIT[1], MERLON_LIT[2]);
      else if (edge) c.set(x, y, MERLON_SIDE[0], MERLON_SIDE[1], MERLON_SIDE[2]);
      else {
        const n = (rnd() - 0.5) * 16;
        c.set(x, y, MERLON_LIT[0] * 0.86 + n, MERLON_LIT[1] * 0.86 + n, MERLON_LIT[2] * 0.86 + n);
      }
    }
    // merlon shadow falling on the coping
    for (let d = 0; d < 3; d++) {
      c.set(x, MERLON_BOTTOM + d, SHADOW[0] + d * 6, SHADOW[1] + d * 6, SHADOW[2] + d * 6);
    }
  }

  // Coping / wall walk: the top surface, lit from the north, with crenel gaps darker.
  for (let y = COPING_TOP; y < COPING_BOTTOM; y++) {
    const f = 1 - ((y - COPING_TOP) / (COPING_BOTTOM - COPING_TOP)) * 0.18;
    for (let x = 0; x < W; x++) {
      const inCrenel = x % PERIOD >= MERLON_W;
      const base = inCrenel ? COPING_MID : COPING_LIT;
      const n = (rnd() - 0.5) * 10;
      c.set(x, y, (base[0] + n) * f, (base[1] + n) * f, (base[2] + n) * f);
    }
  }

  // Ashlar face: 4 courses; alternate courses offset by half a block so it reads as masonry.
  const COURSE_H = Math.floor((FACE_BOTTOM - FACE_TOP) / 4); // 16
  const BLOCK_W = 36; // divides 144 → 4 blocks per course, flush at both edges
  for (let course = 0; course < 4; course++) {
    const y0 = FACE_TOP + course * COURSE_H;
    const offset = course % 2 === 0 ? 0 : Math.floor(BLOCK_W / 2);
    for (let bx = -BLOCK_W; bx < W + BLOCK_W; bx += BLOCK_W) {
      ashlar(c, bx + offset, y0, BLOCK_W, COURSE_H, rnd, course === 3 ? -10 : 0);
    }
  }

  // Plinth and ground shadow along the base.
  c.fill(0, FACE_BOTTOM, W, PLINTH_BOTTOM - FACE_BOTTOM, [104, 110, 122]);
  for (let y = PLINTH_BOTTOM; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = Math.round(150 * (1 - (y - PLINTH_BOTTOM) / Math.max(1, H - PLINTH_BOTTOM)));
      c.set(x, y, SHADOW[0], SHADOW[1], SHADOW[2], a);
    }
  }
  return { W, H, px: c.px };
}

/** North–south wall: a narrow strip down the run. Tiles seamlessly top↕bottom. */
function buildVertical() {
  const W = 58; // the wall's thickness, 2.4× a ~24 world-px thickness
  const H = 144; // the run length = 2.4× the 60 world-px pitch
  const c = makeCanvas(W, H);
  const rnd = mulberry32(20260930);

  const COPING_L = 4;
  const COPING_R = W - 4;
  const FACE_L = 8;
  const FACE_R = W - 8;

  // Top surface of the wall walk, running the whole length: lit centre, darker to the sides.
  for (let y = 0; y < H; y++) {
    for (let x = COPING_L; x < COPING_R; x++) {
      const t = Math.abs(x - W / 2) / (W / 2);
      const f = 1 - t * 0.34;
      const n = (rnd() - 0.5) * 9;
      c.set(x, y, COPING_LIT[0] * f + n, COPING_LIT[1] * f + n, COPING_LIT[2] * f + n);
    }
  }

  // Crenellations along the run: raised merlons with gaps, period divides 144 (48).
  const PERIOD = 48;
  for (let y = 0; y < H; y++) {
    if (y % PERIOD >= 30) continue;
    for (let x = COPING_L; x < COPING_R; x++) {
      const edge = x < COPING_L + 2 || x >= COPING_R - 2;
      const v = edge ? MERLON_SIDE : MERLON_LIT;
      c.set(x, y, v[0], v[1], v[2]);
    }
    for (let x = COPING_L; x < COPING_R; x++) {
      c.set(x, (y + 30) % H, MERLON_SIDE[0] * 0.8, MERLON_SIDE[1] * 0.8, MERLON_SIDE[2] * 0.8);
    }
  }

  // Flank faces: the sunlit west face and the shadowed east face, in short ashlar courses.
  const COURSE_H = 18;
  for (let y = 0; y < H; y += COURSE_H) {
    for (let x = FACE_L; x < COPING_L; x++) {
      const t = (x - FACE_L) / Math.max(1, COPING_L - FACE_L);
      const v = 1 - (1 - t) * 0.35;
      const n = (rnd() - 0.5) * 12;
      c.set(x, y, FACE_LIGHT[0] * v + n, FACE_LIGHT[1] * v + n, FACE_LIGHT[2] * v + n);
    }
    for (let x = COPING_R; x < FACE_R; x++) {
      const n = (rnd() - 0.5) * 10;
      c.set(x, y, FACE_DARK[0] * 0.72 + n, FACE_DARK[1] * 0.72 + n, FACE_DARK[2] * 0.72 + n);
    }
    // horizontal mortar at each course base, full width
    for (let x = FACE_L; x < FACE_R; x++) {
      c.set(x, (y + COURSE_H - 1) % H, MORTAR[0], MORTAR[1], MORTAR[2]);
    }
  }
  return { W, H, px: c.px };
}

for (const [name, build] of [['wall_h', buildHorizontal], ['wall_v', buildVertical]]) {
  const { W, H, px } = build();
  const png = encodePng(W, H, px);
  writeFileSync(`public/sprites/${name}.png`, png);
  console.log(`wrote public/sprites/${name}.png (${W}x${H}, ${png.length} bytes)`);
}
