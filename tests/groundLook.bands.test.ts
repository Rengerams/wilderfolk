/**
 * The ground bake has to paint the landscape the classifier describes.
 *
 * `terrainGrid.classifyTile` is the owner of where the hills, rock, mountains and snow begin, and it
 * measures height as a fraction of the **land range** (`(e - seaLevel) / (1 - seaLevel)`). The bake
 * coloured land on **absolute** elevation above sea instead, which on any preset with
 * `seaLevel ≥ 0.12` puts the whole alpine half of its ramp out of reach: measured on a 2560×1920
 * scandinavia map the field tops out at 1.077 while the old ramp only turned white at 1.176, so
 * **0.0 % of its land could paint snow** while 1.0 % of its tiles were `Snow` — and its `Rocky` /
 * `Mountains` tiles were painted lawn green.
 *
 * The bake only ever calls `createImageData` / `putImageData`, so a capture stub is enough here — no
 * canvas dependency, no browser.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { patchTile, tileAt } from '../src/game/terrain/terrainGrid';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { MapPreset, MapSize, TerrainType, type WorldMap } from '../src/game/gameTypes';

interface CapturedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const contexts: { captured: CapturedImage | null } = { captured: null };
const realDocument = (globalThis as { document?: unknown }).document;

beforeAll(() => {
  const ctx = {
    createImageData: (w: number, h: number): CapturedImage => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: (img: CapturedImage) => { contexts.captured = img; },
    fillRect: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = realDocument;
});

const WORLD_W = 1280;
const WORLD_H = 960;
const SEED = 12345;

/** Bake a map and hand back the pixels the bake wrote. */
async function bakeMap(
  map: WorldMap,
  view?: { x: number; y: number; width: number; height: number },
  worldStep?: number,
): Promise<CapturedImage> {
  const { bakeWhittakerGround } = await import('../src/game/renderer/whittakerTerrain');
  contexts.captured = null;
  bakeWhittakerGround(map, WORLD_W, WORLD_H, map.seaLevel ?? 0.24, map.moistureBias ?? 0, view, undefined, worldStep);
  if (!contexts.captured) throw new Error('the bake produced no image data');
  return contexts.captured;
}

/** Generate a preset and bake it. */
async function bake(preset: MapPreset, view?: { x: number; y: number; width: number; height: number }): Promise<{ map: WorldMap; img: CapturedImage }> {
  const map = generateRawTerrain(WORLD_W, WORLD_H, SEED, MapSize.Medium, preset);
  return { map, img: await bakeMap(map, view) };
}

/** FNV-1a over the pixels — cheap equality for a 1280×960 surface. */
function hashPixels(d: Uint8ClampedArray): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
  return h;
}

describe('the ground bake paints the classification it is drawn under', () => {
  it('paints alpine tiles as stone, not as lawn', async () => {
    const alpine = new Set<TerrainType>([TerrainType.Mountains, TerrainType.Rocky, TerrainType.Snow]);
    for (const preset of [MapPreset.Scandinavia, MapPreset.Highland, MapPreset.Continental]) {
      const { map, img } = await bake(preset);
      let sampled = 0;
      let sumGreenMinusRed = 0;
      let lawn = 0;
      // Sample each **tile** at its own centre rather than each pixel at its nearest tile. The two are
      // only equivalent on flat ground: a carved river valley steps sharply in elevation, and the bake's
      // colour ramp (16 px cells) is smoother than the tile grid (10 px), so a per-pixel match reads the
      // far side of a valley wall while the tile it names sits on the near side. That produced a
      // measurement *of the seam*, not of the paint — which is why the number moved when the river
      // network changed even though the colour ramp did not. Sampling the tile's own footprint measures
      // what this case exists for: is the ground under an alpine tile painted as stone or as lawn.
      const TILE = 10;
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const type = tileAt(map, tx, ty)?.type;
          if (!type || !alpine.has(type)) continue;
          const x0 = tx * TILE, y0 = ty * TILE;
          let greenSum = 0, n = 0;
          for (let py = y0; py < Math.min(y0 + TILE, img.height); py++) {
            for (let px = x0; px < Math.min(x0 + TILE, img.width); px++) {
              const off = (py * img.width + px) * 4;
              greenSum += img.data[off + 1] - img.data[off];
              n++;
            }
          }
          if (!n) continue;
          sampled++;
          const green = greenSum / n;
          sumGreenMinusRed += green;
          // Lawn is green-dominant by ~45 (the woodland ramp's `[54,104,40]`); stone, scree, tundra
          // and snow sit at ~0 or below.
          if (green > 45) lawn++;
        }
      }
      expect(sampled, `${preset}: alpine pixels sampled`).toBeGreaterThan(500);
      // Before the fix this mean was ~45 for every preset: the alpine half of the ramp was
      // unreachable, so a `Rocky` tile was painted with the `h < 0.58` woodland band. Measured now:
      // 0.58 / 1.03 / 0.79 for scandinavia / highland / continental.
      const mean = sumGreenMinusRed / sampled;
      expect(mean, `${preset}: mean green-minus-red over alpine tiles`).toBeLessThan(12);
      // A carved river valley steps sharply in elevation, and the 10 px tile grid can sample the far side
      // of that step from the 16 px colour ramp — measured at 0.03–0.08 % of alpine pixels across these
      // presets before the hydrology carve and 0.28 % on highland after it, because that carve gives a
      // valley walls at up to `BANK_SLOPE_MAX` per cell and so widens the seam. The ceiling stays tight
      // enough that the defect this case exists for — alpine ground painted with the woodland ramp, which
      // measured ~100 % before the fix — cannot pass.
      expect(lawn / sampled, `${preset}: alpine pixels painted as lawn`).toBeLessThan(0.005);
    }
  });

  it('paints a cold crest as snow, which the absolute-height ramp could not reach', async () => {
    const { img } = await bake(MapPreset.Scandinavia);
    let snow = 0;
    let bright = 0;
    const total = img.width * img.height;
    for (let i = 0; i < total; i++) {
      const off = i * 4;
      const r = img.data[off];
      const g = img.data[off + 1];
      const b = img.data[off + 2];
      if (r > 165 && g > 165 && b > 165) bright++;
      // Snow is the only thing on the ground that is bright *and* cooler than it is warm: sand is
      // `[214,200,156]` (b << r) and foam tops out at `[156,206,218]` (r < 165).
      if (r > 165 && g > 165 && b > 175 && b >= r) snow++;
    }
    expect(bright, 'bright pixels').toBeGreaterThan(0);
    expect(snow / total, 'share of the bake that is snow').toBeGreaterThan(0.002);
  });

  it('is deterministic, and a viewport bake matches the same crop of the whole map', async () => {
    // Both claims are load-bearing: determinism is the terrain contract, and the viewport identity is
    // what the chunked bake builds on (`renderer/terrain.ts` bakes one canvas per visible 256 px
    // chunk, at the world step the camera zoom asks for).
    const whole = await bake(MapPreset.Continental);
    const again = await bake(MapPreset.Continental);
    expect(hashPixels(again.img.data)).toBe(hashPixels(whole.img.data));

    const view = { x: 300, y: 200, width: 320, height: 240 };
    const crop = await bake(MapPreset.Continental, view);
    expect(crop.img.width).toBe(320);
    expect(crop.img.height).toBe(240);
    let firstMismatch = '';
    let mismatches = 0;
    for (let py = 0; py < 240; py++) {
      for (let px = 0; px < 320; px++) {
        const a = (py * 320 + px) * 4;
        const b = ((py + view.y) * whole.img.width + px + view.x) * 4;
        if (
          crop.img.data[a] !== whole.img.data[b]
          || crop.img.data[a + 1] !== whole.img.data[b + 1]
          || crop.img.data[a + 2] !== whole.img.data[b + 2]
        ) {
          mismatches++;
          if (!firstMismatch) {
            firstMismatch = `(${px},${py}): [${crop.img.data[a]},${crop.img.data[a + 1]},${crop.img.data[a + 2]}]`
              + ` vs [${whole.img.data[b]},${whole.img.data[b + 1]},${whole.img.data[b + 2]}]`;
          }
        }
      }
    }
    expect(mismatches, `first mismatch ${firstMismatch}`).toBe(0);
  });

  it('keeps the map-wide fields origin-free and deterministic', async () => {
    // The cast-shadow and water-proximity fields are cell-resolution and do not depend on the
    // viewport, which is what lets the renderer build them once per map and share them across every
    // chunk. If that stopped being true, chunks baked with their own fields would show seams.
    // (Folded in from `whittakerTerrain.chunkEquivalence.test.ts`, whose other case is the
    // viewport-identity case above.)
    const { buildWhittakerFields } = await import('../src/game/renderer/whittakerTerrain');
    const map = generateRawTerrain(WORLD_W, WORLD_H, SEED, MapSize.Medium, MapPreset.Continental);
    const a = buildWhittakerFields(map);
    const b = buildWhittakerFields(map);
    expect(a).not.toBeNull();
    expect(Array.from(a!.shadowMap)).toEqual(Array.from(b!.shadowMap));
    expect(Array.from(a!.waterProx)).toEqual(Array.from(b!.waterProx));
    expect(a!.cols).toBe(map.cols);
    expect(a!.rows).toBe(map.rows);
  });

  it('ignores the sparse override layer — the invariant the chunk key rests on', async () => {
    // `renderer/terrain.ts` keys the ground chunks on seed/preset/dims and the bake step, and **not**
    // on `getTerrainRevision()`, because that counter is bumped when a building footprint is cleared
    // while the bake reads none of the arrays the clearing writes. If this ever becomes false, the
    // chunks go stale for a frame; if the key is "fixed" back, a routine build freezes every visible
    // chunk to produce a byte-identical image.
    const map = generateRawTerrain(WORLD_W, WORLD_H, SEED, MapSize.Medium, MapPreset.Continental);
    const before = await bakeMap(map);
    const beforeHash = hashPixels(before.data);

    // Clear a footprint the way `buildingPlacementActions` does: the tile type changes, the
    // generated fields do not.
    let cleared = 0;
    for (let ty = 0; ty < map.height && cleared < 40; ty++) {
      for (let tx = 0; tx < map.width && cleared < 40; tx++) {
        const type = tileAt(map, tx, ty)?.type;
        if (type !== TerrainType.Forest && type !== TerrainType.DarkForest) continue;
        patchTile(map, tx, ty, { type: TerrainType.Grassland });
        cleared++;
      }
    }
    expect(cleared, 'forest tiles cleared').toBe(40);

    const after = await bakeMap(map);
    expect(hashPixels(after.data)).toBe(beforeHash);
    // The tile projection did change — so the bake is ignoring a real edit, not a no-op.
    expect(map.overrides?.size).toBe(40);
  });

  it('tiles exactly from chunks at a coarser world step — the overview case', async () => {
    // `groundWorldStepForZoom` bakes 2 world px per canvas px at anything below 1× zoom, and the
    // renderer stitches 256 px chunks of it. Two things have to hold for that to be seamless: a chunk
    // must sample the same world lattice a whole-map bake would (so the chunk origins stay aligned to
    // the step), and it must be drawn at its *world* span rather than its canvas size. Both are
    // asserted here, because a seam or a half-size chunk is invisible in a unit test until it is.
    const map = generateRawTerrain(WORLD_W, WORLD_H, SEED, MapSize.Medium, MapPreset.Continental);
    const step = 2;
    const whole = await bakeMap(map, undefined, step);
    const CHUNK_WORLD = 256;

    let mismatches = 0;
    let firstMismatch = '';
    const canvasPerChunk = CHUNK_WORLD / step;
    for (const [cx, cy] of [[0, 0], [CHUNK_WORLD, 0], [0, CHUNK_WORLD], [CHUNK_WORLD, CHUNK_WORLD]] as const) {
      const chunk = await bakeMap(map, { x: cx, y: cy, width: CHUNK_WORLD, height: CHUNK_WORLD }, step);
      expect(chunk.width, `chunk at ${cx},${cy}: canvas px`).toBe(canvasPerChunk);
      for (let py = 0; py < canvasPerChunk; py++) {
        for (let px = 0; px < canvasPerChunk; px++) {
          const a = (py * canvasPerChunk + px) * 4;
          // The same world pixel in the whole-map bake: the canvas lattice is world / step.
          const b = ((cy / step + py) * whole.width + cx / step + px) * 4;
          if (
            chunk.data[a] !== whole.data[b]
            || chunk.data[a + 1] !== whole.data[b + 1]
            || chunk.data[a + 2] !== whole.data[b + 2]
          ) {
            mismatches++;
            if (!firstMismatch) {
              firstMismatch = `chunk ${cx},${cy} pixel (${px},${py})`;
            }
          }
        }
      }
    }
    expect(mismatches, `first mismatch ${firstMismatch}`).toBe(0);
  });

  it('carries each material\'s roughness in the band the eye reads it in', async () => {
    // Padilla (2008) fits an optimised band-pass over the psychophysics of 1/f^β noise surfaces and
    // lands on 1.53–4.58 cycles per degree; on the display that was calibrated for it (0.255 mm
    // pixel pitch at 87.7 cm, 60 px/degree) that is ~13–39 px per cycle. Detail finer than the band
    // barely changes perceived roughness, so an octave authored *below* it is wasted art budget —
    // before this the stone material had every octave below the band and a 1:1 crop of it was a
    // uniform grey speckle with no bedding in it. This guards the two halves of the fix: every
    // material owns at least one octave inside the band, and that octave is authored in canvas px so
    // a coarser bake step re-samples it instead of pushing it out of the band.
    const { ROUGHNESS_BAND_PX, ROUGHNESS_OCTAVE_PX, bandDetail } = await import(
      '../src/game/renderer/whittakerTerrain'
    );
    const materials = Object.keys(ROUGHNESS_OCTAVE_PX) as (keyof typeof ROUGHNESS_OCTAVE_PX)[];
    expect(materials.length).toBe(5);
    for (const material of materials) {
      const periods = ROUGHNESS_OCTAVE_PX[material];
      expect(periods.length, `${material}: roughness octaves`).toBeGreaterThan(0);
      for (const period of periods) {
        expect(period, `${material}: octave period`).toBeGreaterThanOrEqual(ROUGHNESS_BAND_PX.fine);
        expect(period, `${material}: octave period`).toBeLessThanOrEqual(ROUGHNESS_BAND_PX.coarse);
      }
    }

    // A detail octave authored in canvas px: doubling the world step doubles the world coordinate a
    // canvas pixel stands for, and the sampled value is unchanged — the octave keeps its period on
    // screen. (A world-fixed octave would halve its period instead, i.e. leave the band.)
    expect(bandDetail(202, 110, 7, 22, 2)).toBeCloseTo(bandDetail(101, 55, 7, 22, 1), 12);
  });
});

describe('the ground bake reads relief from its fields', () => {
  /** A flat map, whose cells the cases below then raise or dig into. */
  function flatMap(): WorldMap {
    return testWorldMap({ tilesX: 90, tilesY: 70 });
  }

  it('casts the shadow away from the light instead of onto the lit flank', async () => {
    // The trace used to walk *down-light*, so the cell it darkened was the one the hillshade was
    // busy lighting: measured on a 1280×960 highland bake, the cells the shadow field darkened came
    // out 42.6 luma **brighter** than the rest (scandinavia 47.8). The light is up-and-left
    // (`LIGHT_TOWARD_X/Y`), so a north-south wall shadows the ground to its east and nothing else.
    const { buildWhittakerFields } = await import('../src/game/renderer/whittakerTerrain');
    const map = flatMap();
    const cols = map.cols!;
    const rows = map.rows!;
    const wallCell = Math.floor(cols / 2);
    for (let cy = 0; cy < rows; cy++) map.elevation![cy * cols + wallCell] = 0.75;
    // The probe row has to be far enough south that the trace stays on the map: it walks 0.8 cells
    // north per step for up to 14 steps.
    const row = Math.floor(rows * 0.75);
    const fields = buildWhittakerFields(map)!;
    expect(fields).not.toBeNull();

    const east = fields.shadowMap[row * cols + wallCell + 2];
    const west = fields.shadowMap[row * cols + wallCell - 2];
    expect(east, 'the down-light side is shadowed by the wall').toBeGreaterThan(0.5);
    expect(west, 'the up-light side is not').toBe(0);
  });

  it('measures a ridge as high ground and a hollow as low ground', async () => {
    // The slope fields describe a cell's *tilt*, which is zero on a valley floor: before this term a
    // flat hollow was exactly as bright as a flat plain, and the mean luma of the highest quartile of
    // hilly ground sat 0.5 luma from the lowest on scandinavia. `relief` is the height against a
    // blurred neighbourhood, so its sign is the cue the hillshade cannot carry.
    const { buildWhittakerFields } = await import('../src/game/renderer/whittakerTerrain');
    const map = flatMap();
    const cols = map.cols!;
    const rows = map.rows!;
    const ridgeCell = Math.floor(cols / 3);
    const hollowCell = Math.floor((cols * 2) / 3);
    const row = Math.floor(rows / 2);
    for (let cy = 0; cy < rows; cy++) {
      map.elevation![cy * cols + ridgeCell] = 0.8;
      map.elevation![cy * cols + hollowCell] = 0.18;
    }
    const fields = buildWhittakerFields(map)!;

    expect(fields.relief[row * cols + ridgeCell], 'a ridge stands proud of its neighbourhood').toBeGreaterThan(0);
    expect(fields.relief[row * cols + hollowCell], 'a hollow sits below its neighbourhood').toBeLessThan(0);
    // Away from both features the field is flat ground, so its relief is ~0 — the term must not turn
    // a plain into a landform.
    const flat = Math.floor((ridgeCell + hollowCell) / 2);
    expect(Math.abs(fields.relief[row * cols + flat])).toBeLessThan(0.01);
  });
});
