/**
 * Sprite-sheet cutter/analyser for Wilderfolk character sets.
 *
 * Reads a full-body character sheet, finds each figure as a connected blob of
 * non-transparent pixels, reports transparency/geometry, and (in `--write` mode)
 * writes one tightly cropped RGBA PNG per figure, in reading order.
 *
 * Verified against the art this repo actually ships:
 *   - public/sprites/new_female_set_v2/Spritesheet_Females.png  (10 females)
 *   - public/sprites/new_male_set/V2/Spritesheet_V2_10_males.png (10 males)
 *
 * Usage:
 *   node scripts/cut-sprite-sheet.mjs <sheet.png> [--analyze] [--write <dir> --names a,b,c]
 *   node scripts/cut-sprite-sheet.mjs <sheet.png> --compare <dir>
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import path from 'node:path';

/* ------------------------------------------------------------------ */
/* Minimal PNG reader — 8-bit, non-interlaced, colour type 2/6        */
/* (matches scripts/browser-smoke.mjs decodePng)                      */
/* ------------------------------------------------------------------ */
function decodePng(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('Interlaced PNGs are not supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const dst = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? dst[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= channels ? prior[i - channels] : 0;
      const x = src[i];
      switch (filter) {
        case 0: dst[i] = x; break;
        case 1: dst[i] = (x + a) & 0xff; break;
        case 2: dst[i] = (x + b) & 0xff; break;
        case 3: dst[i] = (x + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          dst[i] = (x + pred) & 0xff;
          break;
        }
        default: throw new Error(`Unknown PNG filter ${filter} on row ${y}`);
      }
    }
  }

  return { width, height, channels, data: out };
}

/** Reads a PNG as RGBA regardless of source channels. */
function readRgba(file) {
  const img = decodePng(file);
  if (img.channels === 4) return { width: img.width, height: img.height, data: img.data };
  const data = Buffer.alloc(img.width * img.height * 4);
  for (let i = 0, j = 0; i < img.width * img.height; i++, j += 3) {
    data[i * 4] = img.data[j];
    data[i * 4 + 1] = img.data[j + 1];
    data[i * 4 + 2] = img.data[j + 2];
    data[i * 4 + 3] = 255;
  }
  return { width: img.width, height: img.height, data };
}

/* ------------------------------------------------------------------ */
/* Minimal PNG writer (matches scripts/generate-water-sprites.mjs)     */
/* ------------------------------------------------------------------ */
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
  ihdr[9] = 6;
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

/* ------------------------------------------------------------------ */
/* Sheet analysis                                                      */
/* ------------------------------------------------------------------ */
const ALPHA_CUTOFF = 8;
/** Blobs closer than this are treated as one figure (hats, tools, detached hair). */
const MERGE_GAP = 14;
const MIN_BLOB_PX = 300;

function alphaStats(img) {
  let zero = 0;
  let full = 0;
  let partial = 0;
  const borderColors = new Map();
  const bump = (key) => borderColors.set(key, (borderColors.get(key) ?? 0) + 1);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4 + 3;
      const a = img.data[i];
      if (a === 0) zero++;
      else if (a === 255) full++;
      else partial++;
      const border = x === 0 || y === 0 || x === img.width - 1 || y === img.height - 1;
      if (border) {
        const p = (y * img.width + x) * 4;
        bump(`${img.data[p]},${img.data[p + 1]},${img.data[p + 2]},${a}`);
      }
    }
  }
  const top = [...borderColors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return { zero, full, partial, top };
}

/**
 * Figures on these sheets are laid out loosely in columns (5) and rows (2); the art is
 * not aligned to a pixel grid, and one column's two figures can sit within a few pixels
 * of each other. Detection therefore uses projection profiles: maximal runs of columns
 * that contain any opaque pixel are column bands, and within each band maximal runs of
 * rows that contain any opaque pixel are the figures. That is stable even when a hat or
 * a tool is detached, and it splits vertically close neighbours a bounding-box merge
 * would fuse.
 */
function findFigures(img) {
  const { width: W, height: H, data } = img;
  const opaque = (x, y) => data[(y * W + x) * 4 + 3] > ALPHA_CUTOFF;

  const columnHasInk = new Uint8Array(W);
  const rowHasInk = new Uint8Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > ALPHA_CUTOFF) {
        columnHasInk[x] = 1;
        rowHasInk[y] = 1;
      }
    }
  }

  const runs = (flags, minLength) => {
    const out = [];
    let start = -1;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i]) {
        if (start === -1) start = i;
      } else if (start !== -1) {
        if (i - start >= minLength) out.push([start, i - 1]);
        start = -1;
      }
    }
    if (start !== -1 && flags.length - start >= minLength) out.push([start, flags.length - 1]);
    return out;
  };

  const MIN_COLUMN_INK = 4;
  const MIN_ROW_INK = 4;
  const columns = runs(columnHasInk, MIN_COLUMN_INK);
  const figures = [];
  for (const [cx0, cx1] of columns) {
    const bandRows = new Uint8Array(H);
    let ink = 0;
    for (let y = 0; y < H; y++) {
      for (let x = cx0; x <= cx1; x++) {
        if (opaque(x, y)) {
          bandRows[y] = 1;
          ink++;
        }
      }
    }
    if (ink === 0) continue;
    for (const [ry0, ry1] of runs(bandRows, MIN_ROW_INK)) {
      const box = { minX: W, minY: H, maxX: -1, maxY: -1, count: 0 };
      for (let y = ry0; y <= ry1; y++) {
        for (let x = cx0; x <= cx1; x++) {
          if (!opaque(x, y)) continue;
          box.count++;
          if (x < box.minX) box.minX = x;
          if (y < box.minY) box.minY = y;
          if (x > box.maxX) box.maxX = x;
          if (y > box.maxY) box.maxY = y;
        }
      }
      if (box.count >= MIN_BLOB_PX) figures.push(box);
    }
  }
  return figures;
}

/** Row-major reading order over the detected figures. */
function inReadingOrder(figures) {
  const sorted = [...figures].sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  const rows = [];
  for (const blob of sorted) {
    const row = rows.find((r) => blob.minY < r.maxY);
    if (row) {
      row.blobs.push(blob);
      row.maxY = Math.max(row.maxY, blob.maxY);
    } else {
      rows.push({ maxY: blob.maxY, blobs: [blob] });
    }
  }
  const out = [];
  for (const row of rows) {
    row.blobs.sort((a, b) => a.minX - b.minX);
    out.push(...row.blobs);
  }
  return out;
}

/** 16x32 alpha silhouette signature for shape matching. */
function silhouette(img, box) {
  const gw = 16;
  const gh = 32;
  const sig = new Float64Array(gw * gh);
  const w = box.maxX - box.minX + 1;
  const h = box.maxY - box.minY + 1;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0;
      let n = 0;
      const x0 = box.minX + Math.floor((gx * w) / gw);
      const x1 = box.minX + Math.max(Math.floor(((gx + 1) * w) / gw), Math.floor((gx * w) / gw) + 1);
      const y0 = box.minY + Math.floor((gy * h) / gh);
      const y1 = box.minY + Math.max(Math.floor(((gy + 1) * h) / gh), Math.floor((gy * h) / gh) + 1);
      for (let y = y0; y < Math.min(y1, box.maxY + 1); y++) {
        for (let x = x0; x < Math.min(x1, box.maxX + 1); x++) {
          sum += img.data[(y * img.width + x) * 4 + 3] / 255;
          n++;
        }
      }
      sig[gy * gw + gx] = n > 0 ? sum / n : 0;
    }
  }
  return sig;
}

function silhouetteDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

function cropToBuffer(img, box) {
  const w = box.maxX - box.minX + 1;
  const h = box.maxY - box.minY + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((box.minY + y) * img.width + box.minX) * 4;
    img.data.copy(out, y * w * 4, src, src + w * 4);
  }
  return { width: w, height: h, data: out };
}

function describe(file, sheet) {
  const img = readRgba(file);
  const stats = alphaStats(img);
  const figures = inReadingOrder(findFigures(img));
  console.log(`\n### ${file}`);
  console.log(
    `sheet ${img.width}x${img.height} · alpha: ${stats.zero} transparent / ${stats.partial} partial / ${stats.full} opaque px` +
      ` (${((stats.zero / (img.width * img.height)) * 100).toFixed(1)}% transparent)`,
  );
  console.log(`border colours (px, rgba): ${stats.top.map(([k, n]) => `${k} x${n}`).join(' | ')}`);
  console.log(`figures found: ${figures.length}`);
  figures.forEach((f, i) => {
    const w = f.maxX - f.minX + 1;
    const h = f.maxY - f.minY + 1;
    console.log(
      `  #${String(i).padStart(2)} bbox ${String(f.minX).padStart(4)},${String(f.minY).padStart(4)} ${String(w).padStart(4)}x${String(h).padStart(4)}` +
        ` px=${String(f.count).padStart(6)} aspect=${(w / h).toFixed(3)}`,
    );
  });
  sheet.figures = figures;
  sheet.img = img;
  return sheet;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */
const args = process.argv.slice(2);
const sheetPath = args[0];
if (!sheetPath) {
  console.error('usage: node scripts/cut-sprite-sheet.mjs <sheet.png> [--analyze] [--write <dir> --names a,b,c] [--compare <dir>]');
  process.exit(2);
}
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const sheet = describe(sheetPath, {});

const inspect = flag('--inspect');
if (inspect) {
  for (const file of inspect.split(',')) {
    const img = readRgba(file.trim());
    const stats = alphaStats(img);
    let maxAlpha = 0;
    let coreSum = 0;
    let coreCount = 0;
    for (let p = 0; p < img.width * img.height; p++) {
      const a = img.data[p * 4 + 3];
      if (a > maxAlpha) maxAlpha = a;
      if (a > 32) {
        coreSum += a;
        coreCount++;
      }
    }
    console.log(
      `${file.trim()} ${img.width}x${img.height} · transparent ${((stats.zero / (img.width * img.height)) * 100).toFixed(1)}%` +
        ` opaque ${stats.full} · maxAlpha ${maxAlpha} meanBody ${(coreSum / Math.max(1, coreCount)).toFixed(1)}` +
        ` · corners [${[3, (img.width - 1) * 4 + 3, (img.height - 1) * img.width * 4 + 3, ((img.height - 1) * img.width + img.width - 1) * 4 + 3]
          .map((i) => img.data[i])
          .join(',')}]`,
    );
  }
}

const compareDir = flag('--compare');
if (compareDir) {
  const refs = readdirSync(compareDir).filter((f) => f.endsWith('.png'));
  for (const name of refs) {
    const refImg = readRgba(path.join(compareDir, name));
    const refBox = { minX: 0, minY: 0, maxX: refImg.width - 1, maxY: refImg.height - 1 };
    const refSig = silhouette(refImg, refBox);
    const scored = sheet.figures.map((f, i) => ({
      i,
      d: silhouetteDistance(refSig, silhouette(sheet.img, f)),
    })).sort((a, b) => a.d - b.d);
    console.log(
      `match ${name} (${refImg.width}x${refImg.height}): best #${scored[0].i} d=${scored[0].d.toFixed(4)}` +
        ` · 2nd #${scored[1]?.i} d=${scored[1]?.d.toFixed(4)} · 3rd #${scored[2]?.i} d=${scored[2]?.d.toFixed(4)}`,
    );
  }
}

const outDir = flag('--write');
const names = flag('--names');
/** The shipped female cuts are the tight bbox plus 6 px on every side — match it. */
const pad = Number(flag('--pad') ?? 6);
if (outDir) {
  if (!names) throw new Error('--write requires --names a,b,c,...');
  const list = names.split(',');
  if (list.length !== sheet.figures.length) {
    throw new Error(`--names has ${list.length} entries but the sheet has ${sheet.figures.length} figures`);
  }
  mkdirSync(outDir, { recursive: true });
  sheet.figures.forEach((box, i) => {
    const padded = {
      minX: Math.max(0, box.minX - pad),
      minY: Math.max(0, box.minY - pad),
      maxX: Math.min(sheet.img.width - 1, box.maxX + pad),
      maxY: Math.min(sheet.img.height - 1, box.maxY + pad),
    };
    const crop = cropToBuffer(sheet.img, padded);
    const target = path.join(outDir, `${list[i].trim()}.png`);
    writeFileSync(target, encodePng(crop.width, crop.height, crop.data));

    // Per-sprite transparency report: the art must ship with clean alpha.
    let transparent = 0;
    let opaque = 0;
    let partial = 0;
    let maxAlpha = 0;
    let coreSum = 0;
    let coreCount = 0;
    for (let p = 0; p < crop.width * crop.height; p++) {
      const a = crop.data[p * 4 + 3];
      if (a === 0) transparent++;
      else if (a === 255) opaque++;
      else partial++;
      if (a > maxAlpha) maxAlpha = a;
      if (a > 32) {
        coreSum += a;
        coreCount++;
      }
    }
    const corners = [
      3,
      (crop.width - 1) * 4 + 3,
      ((crop.height - 1) * crop.width) * 4 + 3,
      ((crop.height - 1) * crop.width + crop.width - 1) * 4 + 3,
    ].map((i) => crop.data[i]);
    console.log(
      `wrote ${target} ${crop.width}x${crop.height} · transparent ${((transparent / (crop.width * crop.height)) * 100).toFixed(1)}%` +
        ` partial ${partial} opaque ${opaque} · maxAlpha ${maxAlpha} meanBody ${(coreSum / Math.max(1, coreCount)).toFixed(1)}` +
        ` · corner alpha [${corners.join(',')}]`,
    );
  });
}
