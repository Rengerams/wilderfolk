/**
 * Per-pixel Whittaker ground bake, ported from Teraforge `render.ts`: continuous map fields in,
 * smooth hillshaded ground out. Returns null for a legacy map, so the caller keeps the tile bake.
 */
import { TerrainType, PATH_CELL, type WorldMap } from '../gameTypes';
import { clamp, valueNoise } from '../terrain/noise';
import { grassDetailAt, loadedGrassTextures, loadedTerrainMaterials, loadedDirtTextures, sampleTerrainMaterial } from './grassTextures';
// The cell edges, the relief bands and the moisture cuts are the classifier's; the bake must sample
// the same grid and break the landscape at the same heights and the same dryness it does.
import {
  BEACH_BAND_OF_LAND_RANGE,
  COLD_TEMPERATURE,
  DEFAULT_MOISTURE_FOREST,
  DEFAULT_SEA_LEVEL,
  LAND_BANDS,
  MOISTURE_DRY_BELOW_FOREST,
  TERRAIN_CELL,
  WATER_CELL,
} from '../terrain/terrainGrid';

/**
 * Full 1:1 bake up to this many pixels; a larger whole-map region drops to a world step of 2.
 * Only whole-map bakes use it — the shipping renderer bakes viewport chunks at step 1.
 */
const FULL_BAKE_PIXEL_BUDGET = 13_000_000;

type Rgb = [number, number, number];

/**
 * Depth at which water is fully deep, derived per map (see {@link DEEP_WATER_DEPTH_PERCENTILE}) so
 * the bathymetric ramp spans the preset's own depth range.
 */
const DEEP_WATER_DEPTH_PERCENTILE = 0.98;
/** Far-end depth used when a map has too little water to measure (an oasis lake, a river-only map). */
const DEEP_WATER_DEPTH_FALLBACK = 0.11;
/** Water cells needed before the map's own depth is trusted over {@link DEEP_WATER_DEPTH_FALLBACK}. */
const MIN_WATER_CELLS_FOR_DEPTH = 64;
/**
 * Deepening tints, shallow → deep — the bathymetric ramp. Discrete bands with a soft edge, not a
 * continuous gradient, so depth reads at a glance.
 */
const BATHYMETRY_TINTS: readonly Rgb[] = [
  [104, 182, 206],
  [72, 154, 190],
  [48, 122, 168],
  [30, 92, 142],
  [19, 66, 114],
  [13, 46, 88],
];
/** Share of a band's span over which it blends into the next — a soft edge, not a hard step. */
const BATHYMETRY_EDGE_BLEND = 0.18;
/** The floor's own grain, in 0–255 units, so a band is a surface rather than a flat fill. */
const BATHYMETRY_GRAIN = 11;
/** Wet-sand line half-width, as a fraction of the land range. */
const WET_LINE_OF_LAND_RANGE = 0.012;
/** How far above the waterline the shoreline jitter has faded to nothing, in elevation units. */
const SHORE_JITTER_FADE = 0.05;
/** Shoreline displacement, in elevation units (≈ 5–10 px at a typical coastal gradient). */
const SHORE_JITTER_ELEVATION = 0.008;
/** River-bank displacement, in river-coverage units — the same jitter, the other lattice. */
const RIVER_EDGE_JITTER = 0.05;
/** Temperature window either side of {@link COLD_TEMPERATURE} over which crest snow fades in. */
const SNOW_TEMPERATURE_FADE = 0.08;
/** Height above the snow line over which a crest goes from rock to full snow, in land-range units. */
const SNOW_BAND_OF_LAND_RANGE = 0.1;
/** Height of the lowland band — everything below reads as plain rather than as slope. */
const LOWLAND_OF_LAND_RANGE = 0.35;
/** Land-range threshold and width for exposed upland rock. */
const ROCK_UPLAND_START = 0.30;
const ROCK_UPLAND_SPAN = 0.32;
/** River-coverage window in which dry exposed faces receive material shading. */
const ROCK_RIVER_MAX = 0.25;
const ROCK_RIVER_FADE = 0.2;
/** Slope in elevation units per terrain cell that exposes stone. */
const ROCK_SLOPE_START = 0.035;
const ROCK_SLOPE_SPAN = 0.115;
const ROCK_EXPOSURE_MIN = 0.001;
const ROCK_BLEND_MAX = 0.76;
/** World-space sampling frequencies and colour amplitudes for strata. */
const ROCK_STRATA_X_FREQ = 0.075;
const ROCK_STRATA_DIAGONAL_FREQ = 0.02;
const ROCK_STRATA_Y_FREQ = 0.065;
const ROCK_STRATA_NOISE_GAIN = 32;
const ROCK_STRATA_ELEVATION_FREQ = 130;
const ROCK_STRATA_ELEVATION_GAIN = 5;
/** Terrain relief thresholds and spans, in normalized elevation units. */
const RIDGE_RELIEF_START = 0.008;
const RIDGE_RELIEF_SPAN = 0.052;
const VALLEY_RELIEF_START = 0.007;
const VALLEY_RELIEF_SPAN = 0.050;
const RIDGE_COLOR_GAIN: Readonly<Rgb> = [13, 12, 9];
const VALLEY_COLOR_DARKEN: Readonly<Rgb> = [0.18, 0.16, 0.12];

/**
 * Hillshade gain, against a slope expressed as elevation change per cell. Sized so a typical
 * mountainside reaches full light/shade and a plain stays flat.
 */
const SHADE_GAIN = 30;
/** Per-cell slope above which a slope change starts to read as a rim, and how dark the rim goes. */
const RIM_SLOPE = 0.045;
const RIM_STRENGTH = 0.12;

/**
 * The heading toward the light, in cell steps: up and to the left. One source of truth — the
 * hillshade dots it and the shadow trace walks along it, so the two can never disagree in sign.
 */
const LIGHT_TOWARD_X = -0.6;
const LIGHT_TOWARD_Y = -0.8;

/**
 * Lights for the hillshade, as unit vectors toward the light (screen x right, y down): the primary
 * sun the shadow trace follows, plus 225°, 270° and 360°, so no slope face is left flat.
 */
const SHADE_LIGHTS: readonly (readonly [number, number])[] = [
  [LIGHT_TOWARD_X, LIGHT_TOWARD_Y], // primary — the sun the cast-shadow trace walks toward
  [-0.7071, 0.7071],                // 225° — south-west
  [-1, 0],                          // 270° — west
  [0, -1],                          // 360° — north
];
/**
 * Weight of the primary light against each of the other three; dividing the weighted sum by it
 * leaves a slope facing the primary shaded as it was under one light.
 */
const SHADE_PRIMARY_WEIGHT = 2;

/** How far the shadow trace looks for a blocker, in cells — a ridge shadows further than 6 cells. */
const SHADOW_TRACE_STEPS = 14;
/**
 * The sun's inclination, as a rise per cell of distance: a blocker shadows a cell only when the
 * ground toward the light climbs faster than this, keeping cast shadows local.
 */
const SHADOW_SUN_SLOPE = 0.035;
/** How far past the sun's inclination the ground has to climb for a full-strength shadow. */
const SHADOW_OVER_GAIN = 22;
/** How much a distant blocker's shadow weakens per cell of distance. */
const SHADOW_DISTANCE_FALLOFF = 0.35;
/** How far a fully blocked cell is darkened, and how much less its blue is damped (shadow is cool). */
const SHADOW_STRENGTH = 0.24;

/**
 * Altitude relief (Imhof): gain applied to a cell's height above its own neighbourhood, and the
 * height over which that cue fades in above the lowland band.
 */
const RELIEF_GAIN = 26;
const RELIEF_FADE_OF_LAND_RANGE = 0.25;
/** The neighbourhood a cell's relief is measured against, in cells (16 world px each). */
const RELIEF_NEIGHBOURHOOD_CELLS = 6;

/**
 * The band of ground detail the eye reads as surface roughness, in canvas px per cycle — Padilla
 * (2008) fits a 1.53–4.58 cycles/degree pass band, ≈13–39 px here.
 */
export const ROUGHNESS_BAND_PX = { fine: 13, coarse: 39 } as const;

/**
 * The canvas-px period of each material's roughness octave, all inside {@link ROUGHNESS_BAND_PX}.
 */
export const ROUGHNESS_OCTAVE_PX = {
  grass: [15],
  dirt: [26],
  rock: [22, 15],
  snow: [30],
  sand: [16],
} as const satisfies Record<string, readonly number[]>;

const WATER_FOAM: Rgb = [156, 206, 218];
const RIVER_EDGE: Rgb = [86, 168, 196];
const RIVER_CORE: Rgb = [34, 98, 148];
const SAND_DRY: Rgb = [214, 200, 156];
const SAND_WET: Rgb = [166, 150, 112];
const SNOW_HIGH: Rgb = [226, 231, 238];

function lc(a: Rgb, b: Rgb, t: number): Rgb {
  return [(a[0] + (b[0] - a[0]) * t) | 0, (a[1] + (b[1] - a[1]) * t) | 0, (a[2] + (b[2] - a[2]) * t) | 0];
}

/**
 * One detail octave whose period is fixed in canvas px, so it stays inside the roughness band at
 * every bake step. Returns ±0.5, like the raw `valueNoise` it wraps.
 */
export function bandDetail(
  wx: number,
  wy: number,
  seed: number,
  periodPx: number,
  pxStep: number,
): number {
  const f = 1 / (periodPx * pxStep);
  return valueNoise(wx * f, wy * f, seed) - 0.5;
}

function darken(c: Rgb, factor: number): Rgb {
  const grey = (c[0] + c[1] + c[2]) / 3;
  const f = factor * 0.5;
  return [
    (c[0] * (1 - f) + grey * f * 0.8) | 0,
    (c[1] * (1 - f) + grey * f * 0.85) | 0,
    (c[2] * (1 - f) + grey * f * 0.8) | 0,
  ];
}

/**
 * Whittaker biome colours — the Ricklefs palette, keyed on the diagram's own axes: mean annual
 * temperature and annual precipitation (`moisture`), both 0–1 after the generator's mapping.
 */
const WHITTAKER_BIOMES: readonly { color: Rgb; te: number; mo: number }[] = [
  { color: [193, 225, 221], te: 0.25, mo: 0.075 },  // Tundra
  { color: [165, 199, 144], te: 0.30, mo: 0.275 },  // Boreal forest
  { color: [151, 182, 105], te: 0.575, mo: 0.40 },  // Temperate seasonal forest
  { color: [117, 169, 94], te: 0.70, mo: 0.55 },    // Temperate rain forest
  { color: [49, 122, 34], te: 0.825, mo: 0.80 },    // Tropical rain forest
  { color: [160, 151, 0], te: 0.75, mo: 0.375 },    // Tropical seasonal forest / savanna
  { color: [220, 187, 80], te: 0.875, mo: 0.15 },   // Subtropical desert
  { color: [252, 213, 122], te: 0.525, mo: 0.075 }, // Temperate grassland / desert
  { color: [209, 110, 63], te: 0.675, mo: 0.175 },  // Woodland / shrubland
];

/**
 * The diagram as a lookup table, built once and sampled per pixel: fixed anchors, Shepard
 * inverse-distance blending, so biome colour stays continuous across a boundary.
 */
const WHITTAKER_LUT_SIZE = 65;
/** Shepard exponent for the chart blend; lower is smoother, keeping colour continuous across biomes. */
const WHITTAKER_IDW_POWER = 4;
/**
 * How much of each published swatch survives as ground albedo: the categorical palette is blended
 * toward its own grey so hillshading reads through it.
 */
const WHITTAKER_ALBEDO_SATURATION = 0.6;
let whittakerLut: Uint8Array | null = null;

function buildWhittakerLut(): Uint8Array {
  const n = WHITTAKER_LUT_SIZE;
  const lut = new Uint8Array(n * n * 3);
  for (let y = 0; y < n; y++) {
    const mo = y / (n - 1);
    for (let x = 0; x < n; x++) {
      const te = x / (n - 1);
      let wr = 0;
      let wg = 0;
      let wb = 0;
      let ws = 0;
      for (const b of WHITTAKER_BIOMES) {
        const dte = te - b.te;
        const dmo = mo - b.mo;
        const d2 = dte * dte + dmo * dmo;
        // On an anchor the weight saturates so the table reproduces the published colour exactly.
        const w = d2 < 1e-9 ? 1e9 : 1 / Math.pow(d2, WHITTAKER_IDW_POWER / 2);
        wr += b.color[0] * w;
        wg += b.color[1] * w;
        wb += b.color[2] * w;
        ws += w;
      }
      const o = (y * n + x) * 3;
      // Harmonise the swatch for use as ground albedo (see WHITTAKER_ALBEDO_SATURATION).
      const r = wr / ws;
      const g = wg / ws;
      const b = wb / ws;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      lut[o] = lum + (r - lum) * WHITTAKER_ALBEDO_SATURATION;
      lut[o + 1] = lum + (g - lum) * WHITTAKER_ALBEDO_SATURATION;
      lut[o + 2] = lum + (b - lum) * WHITTAKER_ALBEDO_SATURATION;
    }
  }
  return lut;
}

/** Scratch for {@link whittakerColor}: the bake samples the chart per pixel and must not allocate. */
const WHITTAKER_SCRATCH: Rgb = [0, 0, 0];

/** Bilinear sample of the biome chart at (temperature, moisture). Both axes are 0–1.
 *  Returns the shared {@link WHITTAKER_SCRATCH} — read it before the next call, never hold it. */
function whittakerColor(te: number, mo: number): Rgb {
  const lut = (whittakerLut ??= buildWhittakerLut());
  const n = WHITTAKER_LUT_SIZE;
  const fx = clamp(te, 0, 1) * (n - 1);
  const fy = clamp(mo, 0, 1) * (n - 1);
  const x0 = Math.min(n - 2, Math.floor(fx));
  const y0 = Math.min(n - 2, Math.floor(fy));
  const tx = fx - x0;
  const ty = fy - y0;
  const row0 = (y0 * n + x0) * 3;
  const row1 = row0 + n * 3;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  const out = WHITTAKER_SCRATCH;
  out[0] = lut[row0] * w00 + lut[row0 + 3] * w10 + lut[row1] * w01 + lut[row1 + 3] * w11;
  out[1] = lut[row0 + 1] * w00 + lut[row0 + 4] * w10 + lut[row1 + 1] * w01 + lut[row1 + 4] * w11;
  out[2] = lut[row0 + 2] * w00 + lut[row0 + 5] * w10 + lut[row1 + 2] * w01 + lut[row1 + 5] * w11;
  return out;
}

/**
 * The ground colour at one pixel. `shorePush` shifts only the painted waterline; `deepWaterDepth`
 * is the map's own far end for the water ramp.
 */
function groundColor(
  e: number,
  sea: number,
  landRange: number,
  mo: number,
  te: number,
  dv: number,
  nearWater: number,
  shorePush: number,
  deepWaterDepth: number,
): Rgb {
  const aboveSea = e - sea;
  const hn = aboveSea / landRange;
  // Faded out well before the first land band, so nothing above the immediate shore moves.
  const jitterFade = clamp(1 - Math.abs(aboveSea) / SHORE_JITTER_FADE, 0, 1);
  const hShore = aboveSea + shorePush * jitterFade;

  // OCEAN — banded depth tints, normalised to this map's deep depth; the band count carries depth.
  if (hShore < 0) {
    const depth = -hShore;
    const dn = clamp(depth / deepWaterDepth, 0, 1);
    const pos = dn * (BATHYMETRY_TINTS.length - 1);
    const idx = Math.min(BATHYMETRY_TINTS.length - 2, Math.floor(pos));
    // Blend over the tail of each band only, so an interior is flat and the edge is soft, not stepped.
    const edge = clamp((pos - idx - (1 - BATHYMETRY_EDGE_BLEND)) / BATHYMETRY_EDGE_BLEND, 0, 1);
    const base = lc(BATHYMETRY_TINTS[idx], BATHYMETRY_TINTS[idx + 1], edge);
    // Foam: a pale line right at the waterline, where the eye expects water to break.
    const foam = clamp(1 - depth / (WET_LINE_OF_LAND_RANGE * landRange), 0, 1) ** 1.5;
    return foam > 0.01 ? lc(base, WATER_FOAM, foam * 0.55) : base;
  }

  // SHORE — wet sand at the waterline drying inland, ending exactly where the `Beach` tile ends.
  const inland = getInlandColor(hn, mo, te, dv);
  const wetT = clamp(hn / WET_LINE_OF_LAND_RANGE, 0, 1);
  const sand = lc(SAND_WET, [SAND_DRY[0] + dv * 12, SAND_DRY[1] + dv * 10, SAND_DRY[2] + dv * 12], wetT);
  const beachT = clamp(hn / BEACH_BAND_OF_LAND_RANGE, 0, 1);
  // Inland water (a lake, a river) gets a damp verge too — but only right at the waterline, so a
  // lakeside hill does not get a sand skirt.
  const sandProx = nearWater * 0.35 * clamp(1 - hn / 0.12, 0, 1);
  const sandStrength = Math.max(1 - beachT, sandProx);
  return sandStrength > 0.01 ? lc(inland, sand, sandStrength) : inland;
}

/** How cold the air is, 0–1 — the classifier's `te < COLD_TEMPERATURE` gate as a smooth ramp. */
function coldGroundAt(te: number): number {
  return clamp((COLD_TEMPERATURE + SNOW_TEMPERATURE_FADE - te) / (SNOW_TEMPERATURE_FADE * 2), 0, 1);
}

/** How much of the crest is snow: height above the snow line, gated on cold air. One definition,
 *  read by the colour ramp and by the material pick below. */
function snowAmountAt(hn: number, te: number): number {
  return clamp((hn - LAND_BANDS.snow) / SNOW_BAND_OF_LAND_RANGE, 0, 1) * coldGroundAt(te);
}

/** The land colour, from the waterline (`hn = 0`) to the highest crest (`hn ≈ 1`). */
function getInlandColor(hn: number, mo: number, te: number, dv: number): Rgb {
  // Gentler than the first version's `h / 0.8`: a flat 50 % pull toward grey at the top of the
  // range is what made the mid-altitude band read as olive mud instead of as forest.
  const elevDarken = clamp(hn / 0.95, 0, 1) * 0.55;

  // Below the alpine line climate decides the colour, read off the same Whittaker chart
  // `classifyTile` is modelled on.
  const climate = whittakerColor(te, mo);

  if (hn < LAND_BANDS.hills) {
    const t = clamp((hn - LOWLAND_OF_LAND_RANGE) / (LAND_BANDS.hills - LOWLAND_OF_LAND_RANGE), 0, 1);
    return darken(
      [climate[0] + dv * 24, climate[1] + dv * 22, climate[2] + dv * 18],
      elevDarken + t * 0.12,
    );
  }

  // ALPINE — scrub gives way to rock, then scree; snow is gated on the same temperature
  // as the classifier, so a warm `Mountains` tile stays bare stone.
  const scrub: Rgb = [98 + dv * 15, 108 + dv * 12, 80 + dv * 12];
  const rock1: Rgb = [122 + dv * 18, 120 + dv * 16, 114 + dv * 16];
  const rock2: Rgb = [136 + dv * 20, 133 + dv * 18, 128 + dv * 18];
  const snow: Rgb = [SNOW_HIGH[0] + dv * 14, SNOW_HIGH[1] + dv * 12, SNOW_HIGH[2] + dv * 8];
  let base: Rgb;
  if (hn < LAND_BANDS.rocky) {
    // Start from the climate colour, so a hot range greys out of sand rather than snapping to a
    // green-grey that belongs to no climate on the chart.
    const t = (hn - LAND_BANDS.hills) / (LAND_BANDS.rocky - LAND_BANDS.hills);
    base = t < 0.5 ? lc(climate, scrub, t * 2) : lc(scrub, rock1, (t - 0.5) * 2);
  } else if (hn < LAND_BANDS.mountains) {
    base = lc(rock1, rock2, (hn - LAND_BANDS.rocky) / (LAND_BANDS.mountains - LAND_BANDS.rocky));
  } else {
    base = rock2;
  }
  return lc(base, snow, snowAmountAt(hn, te));
}

/**
 * Sample a cell field at fractional cell coordinates. Smoothstep weights, not linear ones: bilinear
 * interpolation is only C0, so band edges, hillshade and rims would carry a lattice kink.
 */
function sampleF(f: Float32Array, cols: number, rows: number, fx: number, fy: number): number {
  const x0 = clamp(Math.floor(fx), 0, cols - 1), y0 = clamp(Math.floor(fy), 0, rows - 1);
  const x1 = Math.min(x0 + 1, cols - 1), y1 = Math.min(y0 + 1, rows - 1);
  const tx = clamp(fx - x0, 0, 1), ty = clamp(fy - y0, 0, 1);
  const ux = tx * tx * (3 - 2 * tx);
  const uy = ty * ty * (3 - 2 * ty);
  return (f[y0 * cols + x0] * (1 - ux) + f[y0 * cols + x1] * ux) * (1 - uy)
    + (f[y1 * cols + x0] * (1 - ux) + f[y1 * cols + x1] * ux) * uy;
}

/**
 * Interpolate along-stream phase only over assigned flow cells; unassigned bank cells carry zero
 * phase and would otherwise pull long-river distances toward zero.
 */
export function sampleRiverPhase(
  phase: Float32Array,
  mask: Float32Array,
  cols: number,
  rows: number,
  fx: number,
  fy: number,
): number | null {
  const assigned = sampleF(mask, cols, rows, fx, fy);
  if (assigned <= 0.5) return null;
  return sampleF(phase, cols, rows, fx, fy) / assigned;
}

/**
 * Whole-map fields the bake needs, at cell resolution, so they are cheap to hold while the
 * per-pixel loop runs over one viewport at a time.
 */
/**
 * Render-only river paint derived from the saved drainage lines: nearest segment per fine water
 * cell once per map, plus waterfall riffle intensity. Neither field affects movement or saves.
 */
function buildRiverSurfaceFields(map: WorldMap): {
  riverPhase: Float32Array;
  riverFlowMask: Float32Array;
  riverRapids: Float32Array;
} {
  const cols = map.waterCols ?? map.cols ?? 0;
  const rows = map.waterRows ?? map.rows ?? 0;
  const n = cols * rows;
  const riverPhase = new Float32Array(n);
  const riverFlowMask = new Float32Array(n);
  const riverRapids = new Float32Array(n);
  const coverage = map.riverDist;
  if ((map.generationVersion ?? 1) < 3 || !coverage || !cols || !rows) {
    return { riverPhase, riverFlowMask, riverRapids };
  }

  const nearest = new Float32Array(n);
  nearest.fill(Infinity);
  const reach = WATER_CELL * 3;
  for (const path of map.rivers ?? []) {
    let distanceAlong = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const lengthSquared = vx * vx + vy * vy;
      if (lengthSquared < 1e-6) continue;
      const length = Math.sqrt(lengthSquared);
      const left = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach) / WATER_CELL));
      const right = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x) + reach) / WATER_CELL));
      const top = Math.max(0, Math.floor((Math.min(a.y, b.y) - reach) / WATER_CELL));
      const bottom = Math.min(rows - 1, Math.ceil((Math.max(a.y, b.y) + reach) / WATER_CELL));
      for (let y = top; y <= bottom; y++) {
        const wy = (y + 0.5) * WATER_CELL;
        for (let x = left; x <= right; x++) {
          const idx = y * cols + x;
          if (coverage[idx] <= 0.32) continue;
          const wx = (x + 0.5) * WATER_CELL;
          const t = clamp(((wx - a.x) * vx + (wy - a.y) * vy) / lengthSquared, 0, 1);
          const dx = wx - a.x - t * vx;
          const dy = wy - a.y - t * vy;
          const distSq = dx * dx + dy * dy;
          if (distSq >= nearest[idx] || distSq > reach * reach) continue;
          nearest[idx] = distSq;
          // Arc length keeps the wave phase continuous around bends. A dot-product with an
          // interpolated direction and absolute world position would shear at every curve.
          riverPhase[idx] = distanceAlong + t * length;
          riverFlowMask[idx] = 1;
        }
      }
      distanceAlong += length;
    }
  }

  for (const fall of map.waterfalls ?? []) {
    const strength = clamp((fall.drop - 0.02) / 0.12, 0, 1);
    if (strength <= 0) continue;
    const radius = Math.max(24, Math.min(100, fall.w * 4 + 16));
    const left = Math.max(0, Math.floor((fall.x - radius) / WATER_CELL));
    const right = Math.min(cols - 1, Math.ceil((fall.x + radius) / WATER_CELL));
    const top = Math.max(0, Math.floor((fall.y - radius) / WATER_CELL));
    const bottom = Math.min(rows - 1, Math.ceil((fall.y + radius) / WATER_CELL));
    for (let y = top; y <= bottom; y++) {
      const dy = (y + 0.5) * WATER_CELL - fall.y;
      for (let x = left; x <= right; x++) {
        const idx = y * cols + x;
        if (coverage[idx] <= 0.32) continue;
        const dx = (x + 0.5) * WATER_CELL - fall.x;
        const falloff = Math.max(0, 1 - Math.hypot(dx, dy) / radius);
        const foam = strength * falloff * falloff;
        if (foam > riverRapids[idx]) riverRapids[idx] = foam;
      }
    }
  }

  return { riverPhase, riverFlowMask, riverRapids };
}

export interface WhittakerFields {
  cols: number;
  rows: number;
  /**
   * The height the ground art reads: `map.elevation` after one 3×3 pass. Classification keeps the
   * raw field, so walkability does not move.
   */
  shade: Float32Array;
  /**
   * Terrain slope per cell, x and y — the shading's input, sampled so shading does not paint the
   * raw-cell difference as 16 px squares.
   */
  slopeX: Float32Array;
  slopeY: Float32Array;
  /**
   * How much higher (or lower) this cell stands than the ground around it, in elevation units —
   * negative in a valley, positive on a ridge.
   */
  relief: Float32Array;
  /** How much of the sun's path from the light to this cell is blocked, 0–1. */
  shadowMap: Float32Array;
  /** Horizon occlusion adds heightmap-based depth without moving gameplay coordinates. */
  skyOcclusion: Float32Array;
  /** How close each cell is to water — the damp verge along every shore. */
  waterProx: Float32Array;
  /** Smoothed view of authoritative grassland edits on the 10px path grid. */
  clearingMask?: Float32Array;
  /** Fine, render-only along-stream distance, active channel mask and localized rapids. */
  riverPhase: Float32Array;
  riverFlowMask: Float32Array;
  riverRapids: Float32Array;
  /**
   * Depth at which this map's water is fully deep, in elevation units — the far end of the water
   * ramp, derived per map.
   */
  deepWaterDepth: number;
}

/**
 * The slope, relief, cast-shadow and water-proximity fields for a map. O(cells), so a chunked baker
 * can hold it for the whole world and reuse it across chunks.
 */
export function buildWhittakerFields(map: WorldMap): WhittakerFields | null {
  const { cols, rows, elevation, terrain } = map;
  if (!cols || !rows || !elevation || !terrain) return null;

  // One 3×3 pass over the height, and the ground art reads this field rather than `map.elevation`:
  // the generator's carved river plates would otherwise land the waterline hard on the lattice.
  const shade = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      let n = 0;
      for (let j = -1; j <= 1; j++) {
        const ny = y + j;
        if (ny < 0 || ny >= rows) continue;
        for (let k = -1; k <= 1; k++) {
          const nx = x + k;
          if (nx < 0 || nx >= cols) continue;
          sum += elevation[ny * cols + nx];
          n++;
        }
      }
      shade[y * cols + x] = sum / n;
    }
  }

  const slopeX = new Float32Array(cols * rows);
  const slopeY = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const xm = Math.max(0, x - 1);
      const xp = Math.min(cols - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(rows - 1, y + 1);
      slopeX[i] = (shade[y * cols + xp] - shade[y * cols + xm]) * 0.5;
      slopeY[i] = (shade[yp * cols + x] - shade[ym * cols + x]) * 0.5;
    }
  }

  // Altitude relief: each cell's height against a blurred copy of the whole field. Plain loops, not
  // a sliding window — the cell grid is small next to the per-pixel bake.
  const relief = new Float32Array(cols * rows);
  {
    const radius = RELIEF_NEIGHBOURHOOD_CELLS;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let sum = 0;
        let n = 0;
        for (let j = -radius; j <= radius; j++) {
          const ny = clamp(y + j, 0, rows - 1);
          for (let k = -radius; k <= radius; k++) {
            sum += shade[ny * cols + clamp(x + k, 0, cols - 1)];
            n++;
          }
        }
        relief[y * cols + x] = shade[y * cols + x] - sum / n;
      }
    }
  }

  const shadowMap = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const myElev = shade[i];
      let maxShadow = 0;
      // Walk **toward** the light: the ground that can stand between this cell and the sun is up-light
      // of it, so only terrain on that side can cast the shadow.
      for (let step = 1; step <= SHADOW_TRACE_STEPS; step++) {
        const sx = x + LIGHT_TOWARD_X * step;
        const sy = y + LIGHT_TOWARD_Y * step;
        if (sx < 0 || sy < 0) break;
        const otherElev = shade[clamp(Math.round(sy), 0, rows - 1) * cols + clamp(Math.round(sx), 0, cols - 1)];
        // How fast the ground climbs toward the light, per cell of distance — compared against the
        // sun, not against zero, so only ground that out-slopes the sun blocks it.
        const over = (otherElev - myElev) / step - SHADOW_SUN_SLOPE;
        if (over <= 0) continue;
        // A blocker one cell away shadows harder than one fourteen cells away.
        const shadow = clamp((over * SHADOW_OVER_GAIN) / (1 + step * SHADOW_DISTANCE_FALLOFF), 0, 1);
        if (shadow > maxShadow) maxShadow = shadow;
      }
      shadowMap[i] = maxShadow;
    }
  }

  // Precompute a local horizon term once; no extra noise or ray marching in the pixel shader.
  const skyOcclusion = new Float32Array(cols * rows);
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const center = shade[y * cols + x]!;
      let occlusion = 0;
      for (const [dx, dy] of directions) {
        let horizon = 0;
        for (const radius of [1, 2, 4, 7]) {
          const nx = clamp(x + dx * radius, 0, cols - 1);
          const ny = clamp(y + dy * radius, 0, rows - 1);
          const rise = (shade[ny * cols + nx]! - center) / (radius * Math.hypot(dx, dy));
          horizon = Math.max(horizon, rise);
        }
        occlusion += clamp((horizon - 0.008) * 10, 0, 1);
      }
      skyOcclusion[y * cols + x] = occlusion / directions.length;
    }
  }

  const waterProx = new Float32Array(cols * rows);
  const sea = map.seaLevel ?? DEFAULT_SEA_LEVEL;
  // The water ramp's far end from this map's own depth distribution: a high percentile, so one
  // trench cell cannot compress the shelf; the fallback covers a map with almost no water.
  const waterDepths: number[] = [];
  for (let i = 0; i < elevation.length; i++) {
    if (elevation[i] < sea) waterDepths.push(sea - elevation[i]);
  }
  let deepWaterDepth = DEEP_WATER_DEPTH_FALLBACK;
  if (waterDepths.length >= MIN_WATER_CELLS_FOR_DEPTH) {
    waterDepths.sort((a, b) => a - b);
    const at = waterDepths[Math.min(
      waterDepths.length - 1,
      Math.max(0, Math.round((waterDepths.length - 1) * DEEP_WATER_DEPTH_PERCENTILE)),
    )];
    if (at > 1e-3) deepWaterDepth = at;
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Water is `e < seaLevel` in the elevation field, not a biome label — keeps the renderer
      // field-driven.
      if (elevation[y * cols + x] < sea) continue;
      let minDist = 99;
      for (let j = -1; j <= 1; j++) {
        for (let k = -1; k <= 1; k++) {
          const nx = x + k;
          const ny = y + j;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (elevation[ny * cols + nx] < sea) {
            const dist = Math.sqrt(k * k + j * j);
            if (dist < minDist) minDist = dist;
          }
        }
      }
      if (minDist < 99) waterProx[y * cols + x] = clamp(1 - minDist / 1.5, 0, 1);
    }
  }

  let clearingMask: Float32Array | undefined;
  for (const [index, tile] of map.overrides ?? []) {
    if (tile.type !== TerrainType.Grassland || tile.reinforced) continue;
    if (!clearingMask) clearingMask = new Float32Array(map.width * map.height);
    clearingMask[index] = 1;
  }

  const riverSurface = buildRiverSurfaceFields(map);
  return { cols, rows, shade, slopeX, slopeY, relief, shadowMap, skyOcclusion, waterProx, clearingMask,
    ...riverSurface, deepWaterDepth };
}

/** The world rectangle one bake covers. Omit to bake the whole map. */
export interface WhittakerViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bake a per-pixel Whittaker ground surface, null for a legacy map. Colour reads only the world
 * coordinate, so a `viewRect` crop matches the whole map; `worldStep` is world px per canvas px.
 */
export function bakeWhittakerGround(
  map: WorldMap,
  worldW: number,
  worldH: number,
  seaLevel: number,
  moistureBias: number,
  viewRect?: WhittakerViewport,
  precomputedFields?: WhittakerFields,
  worldStep?: number,
): HTMLCanvasElement | null {
  const elevation = map.elevation;
  const moisture = map.moisture;
  const temperature = map.temperature;
  const terrain = map.terrain;
  const riverDist = map.riverDist;
  const cols = map.cols;
  const rows = map.rows;
  if (!elevation || !moisture || !temperature || !terrain || !riverDist || !cols || !rows) return null;

  // Water is sampled on its own, finer lattice, so a river edge and a coastline are curves
  // rather than cell-sized steps.
  const waterCols = map.waterCols ?? cols;
  const waterRows = map.waterRows ?? rows;
  const seed = typeof map.seed === 'number' ? map.seed : 1;
  const sea = seaLevel;
  const landRange = Math.max(1e-6, 1 - sea);
  // Where dry ground begins, from the same cut the classifier uses — so grass-versus-dirt ground
  // detail changes where the `Grassland`/`Dirt` biomes change and nowhere else.
  const dryMoistureCut = (map.moistureForestThreshold ?? DEFAULT_MOISTURE_FOREST) - MOISTURE_DRY_BELOW_FOREST;

  // The region this bake covers, in whole world pixels, clamped to the map.
  const originX = viewRect ? clamp(Math.floor(viewRect.x), 0, Math.max(0, worldW - 1)) : 0;
  const originY = viewRect ? clamp(Math.floor(viewRect.y), 0, Math.max(0, worldH - 1)) : 0;
  const spanW = viewRect ? Math.max(1, Math.min(Math.ceil(viewRect.width), worldW - originX)) : worldW;
  const spanH = viewRect ? Math.max(1, Math.min(Math.ceil(viewRect.height), worldH - originY)) : worldH;

  // Sub-sampling: the caller's world step when it knows the camera zoom, else the whole-map default
  // (a chunk this small is always inside the budget, so the fallback is 1:1).
  const pxStep = worldStep && worldStep > 0
    ? worldStep
    : (spanW * spanH > FULL_BAKE_PIXEL_BUDGET ? 2 : 1);
  const W = Math.max(1, Math.ceil(spanW / pxStep));
  const H = Math.max(1, Math.ceil(spanH / pxStep));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const C = TERRAIN_CELL;

  // The map-wide fields are cell-resolution and independent of the viewport, so a chunked
  // caller builds them once and passes the same object to every chunk.
  const fields = precomputedFields ?? buildWhittakerFields(map);
  if (!fields) return null;
  const { shade, slopeX, slopeY, relief, shadowMap, skyOcclusion, waterProx, clearingMask,
    riverPhase, riverFlowMask, riverRapids, deepWaterDepth } = fields;

  const img = ctx.createImageData(W, H);
  const d = img.data;
  // Decode artist-authored CC0 grass once per loaded image, never inside the pixel loop.
  const grassTextures = map.generationVersion === 4 ? loadedGrassTextures() : null;
  const naturalMaterials = map.generationVersion === 4 ? loadedTerrainMaterials() : null;
  const dirtTextures = map.generationVersion === 4 ? loadedDirtTextures() : null;
  // Reuse both RGB scratch tuples across all pixels; do not allocate inside the bake loops.
  const grassDetail: [number, number, number] = [0, 0, 0];
  const materialDetail: [number, number, number] = [0, 0, 0];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const wx = originX + px * pxStep;
      const wy = originY + py * pxStep;
      const tcx = wx / C;
      const tcy = wy / C;
      // The height the ground art reads is the smoothed field, not the raw one — see `WhittakerFields.shade`.
      const visualHeight = sampleF(shade, cols, rows, tcx, tcy);
      const terrainHeight = sampleF(elevation, cols, rows, tcx, tcy);
      // Water must remain water wherever the canonical terrain tiles classify it as such.
      const e = terrainHeight < sea ? Math.min(visualHeight, terrainHeight - 0.001) : visualHeight;
      const mo = clamp(
        sampleF(moisture, cols, rows, tcx, tcy)
          + ((map.generationVersion ?? 1) >= 2 ? 0 : moistureBias),
        0, 1,
      );
      const visualMo = (map.generationVersion ?? 1) >= 2
        ? clamp(mo + DEFAULT_MOISTURE_FOREST
          - (map.moistureForestThreshold ?? DEFAULT_MOISTURE_FOREST), 0, 1)
        : mo;
      let te = sampleF(temperature, cols, rows, tcx, tcy);
      // Four octaves across four scales, collapsed to a 0-mean deviation (`dv`); every consumer
      // below multiplies it by a per-channel amplitude when adding it to a mean colour.
      const nv = valueNoise(wx * 0.032, wy * 0.032, seed + 7777) * 0.4
        + valueNoise(wx * 0.075, wy * 0.075, seed + 8888) * 0.3
        + valueNoise(wx * 0.17, wy * 0.17, seed + 9999) * 0.2
        + valueNoise(wx * 0.4, wy * 0.4, seed + 1111) * 0.1;
      const dv = nv - 0.5;
      const nearWater = sampleF(waterProx, cols, rows, tcx, tcy);

      // One coastline/bank jitter displaces the two water edges so both are curves — an ~8 px
      // wavelength, long enough to survive half-resolution sampling. Land bands are left alone.
      const edgeJit = (valueNoise(wx * 0.13, wy * 0.13, seed + 5150) - 0.5) * 2;

      const aboveSea = e - sea;
      let hn = aboveSea / landRange;
      let groundElevation = e;
      // Water comes from the pixel's own elevation, so the colour ramp, the hillshade damping and
      // the shadow guard all agree about where the waterline is.
      const coverage = sampleF(riverDist, waterCols, waterRows, wx / WATER_CELL, wy / WATER_CELL);
      const rd = (map.generationVersion ?? 0) >= 3 ? coverage : coverage - edgeJit * RIVER_EDGE_JITTER;
      const isWater = aboveSea < 0 || ((map.generationVersion ?? 0) >= 3 && rd > 0.55);
      if (!isWater && clearingMask) {
        const cleared = sampleF(clearingMask, map.width, map.height,
          wx / PATH_CELL - 0.5, wy / PATH_CELL - 0.5);
        hn += (Math.min(hn, LAND_BANDS.hills - 0.05) - hn) * cleared;
        te += (Math.max(te, COLD_TEMPERATURE + SNOW_TEMPERATURE_FADE) - te) * cleared;
        if (cleared > 0) groundElevation = sea + hn * landRange;
      }

      let [r, g, b] = groundColor(
        groundElevation, sea, landRange, visualMo, te, dv, nearWater,
        edgeJit * SHORE_JITTER_ELEVATION, deepWaterDepth,
      );

      // Seabed grain: the floor's own variation inside each tint band so a band is a surface; depth
      // itself is carried by the banded ramp in `groundColor`.
      if (isWater) {
        const grain = (valueNoise(wx * 0.03, wy * 0.03, seed + 4321) - 0.5)
          + (valueNoise(wx * 0.11, wy * 0.11, seed + 4322) - 0.5) * 0.6;
        const g2 = grain * BATHYMETRY_GRAIN;
        r = clamp(r + g2 * 0.5, 0, 255);
        g = clamp(g + g2 * 0.8, 0, 255);
        b = clamp(b + g2, 0, 255);
      }

      // Material detail: each material carries an octave inside the roughness band, and materials
      // are chosen from the smooth fields so edges land on shorelines, not the 16 px lattice.
      if (!isWater && map.generationVersion === 4) {
        const fade = (v: number): number => {
          const t = clamp(v, 0, 1);
          return t * t * (3 - 2 * t);
        };
        const snowW = fade(snowAmountAt(hn, te));
        const stoneW = (1 - snowW)
          * fade((hn - (LAND_BANDS.hills - 0.06)) / (LAND_BANDS.rocky - LAND_BANDS.hills + 0.14));
        const beachT = clamp(hn / BEACH_BAND_OF_LAND_RANGE, 0, 1);
        const sandStrength = Math.max(1 - beachT, nearWater * 0.35 * clamp(1 - hn / 0.12, 0, 1));
        const sandW = (1 - snowW - stoneW) * fade(sandStrength);
        const dryW = (1 - snowW - stoneW - sandW)
          * fade((dryMoistureCut + 0.085 - mo) / 0.17);
        const grassW = Math.max(0, 1 - snowW - stoneW - sandW - dryW);

        if (sandW > 0.005) {
          if (naturalMaterials) {
            sampleTerrainMaterial(naturalMaterials.sand, wx, wy, materialDetail);
            const k = sandW * 0.72;
            r += materialDetail[0] * k; g += materialDetail[1] * k; b += materialDetail[2] * k;
            // Underwater pebbles and wet shingle gently fade into sandy shoreline.
            const shingle = sandW * fade((nearWater - 0.22) / 0.65) * 0.30;
            if (shingle > 0.005) {
              sampleTerrainMaterial(naturalMaterials.pebbles, wx, wy, materialDetail);
              r += materialDetail[0] * shingle;
              g += materialDetail[1] * shingle;
              b += materialDetail[2] * shingle;
            }
          } else {
            const ripple = Math.sin(wx * 0.22 + valueNoise(wx * 0.06, wy * 0.06, seed + 6666) * 16);
            const dune = (valueNoise(wx * 0.03, wy * 0.03, seed + 6667) - 0.5) * 14;
            const m = (ripple * 5 + dune + bandDetail(wx, wy, seed + 6668, ROUGHNESS_OCTAVE_PX.sand[0], pxStep) * 9) * sandW;
            r += m; g += m * 0.8; b += m * 0.5;
          }
        }
        if (snowW > 0.005) {
          const drift = bandDetail(wx + wy * 0.25, wy - wx * 0.1, seed + 8882, ROUGHNESS_OCTAVE_PX.snow[0], pxStep);
          const sparkle = valueNoise(wx * 1.6, wy * 1.6, seed + 8880) > 0.88 ? 10 : 0;
          const m = (drift * 17 + sparkle) * snowW;
          r += m * 0.85; g += m * 0.9; b += m;
        }
        if (stoneW > 0.005) {
          if (naturalMaterials) {
            const cliff = fade((hn - LAND_BANDS.rocky) / Math.max(0.01, LAND_BANDS.mountains - LAND_BANDS.rocky));
            sampleTerrainMaterial(naturalMaterials.gravel, wx, wy, materialDetail);
            const k = stoneW * (1 - cliff) * 0.65;
            r += materialDetail[0] * k; g += materialDetail[1] * k; b += materialDetail[2] * k;
            if (cliff > 0.005) {
              sampleTerrainMaterial(naturalMaterials.rock, wx, wy, materialDetail);
              const ledge = stoneW * cliff * 0.76;
              r += materialDetail[0] * ledge;
              g += materialDetail[1] * ledge;
              b += materialDetail[2] * ledge;
            }
          } else {
            const crack = valueNoise(wx * 0.22 + wy * 0.08, wy * 0.3 - wx * 0.11, seed + 7770);
            const seam = Math.abs(crack - 0.5) < 0.035 ? -16 : 0;
            const strata = Math.sin(e * 150) * 4;
            const ledge = bandDetail(wx + wy * 0.5, wy - wx * 0.2, seed + 7772, ROUGHNESS_OCTAVE_PX.rock[0], pxStep) * 26;
            const m = (seam + strata + ledge) * stoneW;
            r += m; g += m * 0.98; b += m * 0.94;
          }
        }
        if (dryW > 0.005) {
          if (dirtTextures) {
            // The supplied CC0 dirt pack is painted for close top-down views: damp fine loam gives
            // way continuously to drier, stony dirt. The rutted image is deliberately not used.
            const wet = fade((mo - (dryMoistureCut - 0.10)) / 0.20);
            sampleTerrainMaterial(dirtTextures.loam, wx, wy, materialDetail);
            const loamK = dryW * wet * 0.76;
            r += materialDetail[0] * loamK;
            g += materialDetail[1] * loamK;
            b += materialDetail[2] * loamK;
            if (wet < 0.995) {
              sampleTerrainMaterial(dirtTextures.coarseSoil, wx, wy, materialDetail);
              const coarseK = dryW * (1 - wet) * 0.73;
              r += materialDetail[0] * coarseK;
              g += materialDetail[1] * coarseK;
              b += materialDetail[2] * coarseK;
            }
          } else if (naturalMaterials) {
            const dryFraction = fade((dryMoistureCut + 0.035 - mo) / 0.21);
            sampleTerrainMaterial(naturalMaterials.soil, wx, wy, materialDetail);
            const k = dryW * (1 - dryFraction) * 0.76;
            r += materialDetail[0] * k; g += materialDetail[1] * k; b += materialDetail[2] * k;
            if (dryFraction > 0.005) {
              sampleTerrainMaterial(naturalMaterials.drySoil, wx, wy, materialDetail);
              const dryK = dryW * dryFraction * 0.79;
              r += materialDetail[0] * dryK;
              g += materialDetail[1] * dryK;
              b += materialDetail[2] * dryK;
            }
          } else {
            const grain = (valueNoise(wx * 0.34, wy * 0.34, seed + 4444) - 0.5) * 40;
            const patch = bandDetail(wx, wy, seed + 4446, ROUGHNESS_OCTAVE_PX.dirt[0], pxStep) * 44;
            const m = (grain + patch) * dryW;
            r += m; g += m * 0.8; b += m * 0.6;
          }
        }
        if (grassW > 0.005) {
          if (grassTextures) {
            // Four tileable 512px albedos by Cethiel: open grass, meadow, forest floor, dense leaves.
            // Moisture controls their proportions, never the tile label.
            grassDetailAt(
              grassTextures, wx, wy, mo,
              map.moistureForestThreshold ?? DEFAULT_MOISTURE_FOREST,
              map.moistureDarkForestThreshold
                ?? (map.moistureForestThreshold ?? DEFAULT_MOISTURE_FOREST) + 0.12,
              map.preset, grassDetail,
            );
            const textureStrength = grassW * 0.86;
            r += grassDetail[0] * textureStrength;
            g += grassDetail[1] * textureStrength;
            b += grassDetail[2] * textureStrength;
            // Dense forests carry leaf litter: blend the artist's brown foliage texture rather than
            // stamping isolated vector leaves or sharp forest tiles.
            if (dirtTextures) {
              const forestCut = map.moistureForestThreshold ?? DEFAULT_MOISTURE_FOREST;
              const litter = grassW * fade((mo - (forestCut - 0.12)) / 0.30)
                * (1 - fade((hn - (LAND_BANDS.hills - 0.05)) / 0.20))
                * 0.42;
              if (litter > 0.005) {
                sampleTerrainMaterial(dirtTextures.leafLitter, wx, wy, materialDetail);
                r += materialDetail[0] * litter;
                g += materialDetail[1] * litter;
                b += materialDetail[2] * litter;
              }
            }
            // Dry meadow margins get straw instead of a hard grass/dirt cutoff.
            const dryStraw = naturalMaterials
              ? grassW * fade((dryMoistureCut + 0.07 - mo) / 0.21)
                * fade((te - 0.42) / 0.25) * 0.38
              : 0;
            if (dryStraw > 0.005 && naturalMaterials) {
              sampleTerrainMaterial(naturalMaterials.straw, wx, wy, materialDetail);
              r += materialDetail[0] * dryStraw;
              g += materialDetail[1] * dryStraw;
              b += materialDetail[2] * dryStraw;
            }
          } else {
            // Headless tests and an asset that failed to preload retain safe
            // deterministic procedural detail instead of leaving blank ground.
            const clump = (valueNoise(wx * 0.048 + wy * 0.012, wy * 0.041 - wx * 0.009, seed + 2222) - 0.5) * (60 + mo * 44);
            const patch = (valueNoise(wx * 0.035, wy * 0.035, seed + 2345) - 0.5) * (52 + mo * 36);
            const streak = (valueNoise(wx * 0.17 + wy * 0.05, wy * 0.14 - wx * 0.03, seed + 2223) - 0.5) * 34;
            const m = (clump + patch + streak) * grassW;
            r += m * 0.32; g += m * 0.85; b += m * 0.2;
          }
        }
        r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
      } else if (!isWater) {
        const beachT = clamp(hn / BEACH_BAND_OF_LAND_RANGE, 0, 1);
        const sandStrength = Math.max(1 - beachT, nearWater * 0.35 * clamp(1 - hn / 0.12, 0, 1));
        const rockT = clamp((hn - LAND_BANDS.hills) / (LAND_BANDS.rocky - LAND_BANDS.hills), 0, 1);
        if (sandStrength > 0.5) {
          const ripple = Math.sin(wx * 0.22 + valueNoise(wx * 0.06, wy * 0.06, seed + 6666) * 16);
          const dune = (valueNoise(wx * 0.03, wy * 0.03, seed + 6667) - 0.5) * 14;
          // The 4.5 px ripple is below the band, so sand keeps it weak and gets its roughness from a
          // wind ripple instead — sand is meant to read smoother than stone and dirt, not dead.
          const wind = bandDetail(wx, wy, seed + 6668, ROUGHNESS_OCTAVE_PX.sand[0], pxStep) * 9;
          const rv = ripple * 5 + dune + wind;
          r = clamp(r + rv, 0, 255); g = clamp(g + rv * 0.8, 0, 255); b = clamp(b + rv * 0.5, 0, 255);
        } else if (snowAmountAt(hn, te) > 0.5) {
          const sparkle = valueNoise(wx * 1.6, wy * 1.6, seed + 8880);
          if (sparkle > 0.88) { r = Math.min(255, r + 12); g = Math.min(255, g + 12); b = Math.min(255, b + 14); }
          // Cold dips in the drifts — a touch more blue where the surface sags.
          const dip = valueNoise(wx * 0.28, wy * 0.28, seed + 8881);
          if (dip < 0.3) { r = r * 0.95; b = Math.min(255, b + 6); }
          // Wind-worked drift, in the band: snow was the one material with nothing at all inside it,
          // which is why a snowfield read as flat white rather than as a surface.
          const drift = bandDetail(wx + wy * 0.25, wy - wx * 0.1, seed + 8882, ROUGHNESS_OCTAVE_PX.snow[0], pxStep) * 17;
          r = clamp(r + drift * 0.85, 0, 255);
          g = clamp(g + drift * 0.9, 0, 255);
          b = clamp(b + drift, 0, 255);
        } else if (rockT > 0.35) {
          // Two fracture sets at different scales plus elevation-following strata: stone reads from
          // ledges, and the bedding and rubble sit in the roughness band.
          const crack = valueNoise(wx * 0.22 + wy * 0.08, wy * 0.3 - wx * 0.11, seed + 7770);
          const crack2 = valueNoise(wx * 0.62, wy * 0.5, seed + 7771);
          const seam = Math.abs(crack - 0.5) < 0.035 ? -16 : 0;
          const grain2 = (crack2 - 0.5) * 8;
          const strata = Math.sin(e * 150) * 4;
          const ledge = bandDetail(wx + wy * 0.5, wy - wx * 0.2, seed + 7772, ROUGHNESS_OCTAVE_PX.rock[0], pxStep) * 26;
          const rubble = bandDetail(wx - wy * 0.35, wy + wx * 0.15, seed + 7773, ROUGHNESS_OCTAVE_PX.rock[1], pxStep) * 13;
          const m = (seam + grain2 + strata + ledge + rubble) * rockT;
          r = clamp(r + m, 0, 255); g = clamp(g + m * 0.98, 0, 255); b = clamp(b + m * 0.94, 0, 255);
        } else if (mo < dryMoistureCut) {
          const grain = (valueNoise(wx * 0.34, wy * 0.34, seed + 4444) - 0.5) * 40;
          const fine = (valueNoise(wx * 1.2, wy * 1.2, seed + 4445) - 0.5) * 12;
          const patch = bandDetail(wx, wy, seed + 4446, ROUGHNESS_OCTAVE_PX.dirt[0], pxStep) * 44;
          const sp = grain + fine + patch;
          r = clamp(r + sp, 0, 255); g = clamp(g + sp * 0.8, 0, 255); b = clamp(b + sp * 0.6, 0, 255);
          // Pebble highlight at a pebble's scale, so dirt reads as stones in soil rather than as grain.
          if (valueNoise(wx * 1.8, wy * 1.8, seed + 5556) > 0.88) {
            r = Math.min(255, r + 24); g = Math.min(255, g + 22); b = Math.min(255, b + 18);
          }
        } else {
          // Grass detail is structured, not random: directional blade streaks, coarse mottling and
          // discrete dark flecks for soil, all in the roughness band.
          const clump = (valueNoise(wx * 0.048 + wy * 0.012, wy * 0.041 - wx * 0.009, seed + 2222) - 0.5) * (60 + mo * 44);
          const patch = (valueNoise(wx * 0.035, wy * 0.035, seed + 2345) - 0.5) * (52 + mo * 36);
          const streak = (valueNoise(wx * 0.17 + wy * 0.05, wy * 0.14 - wx * 0.03, seed + 2223) - 0.5) * 34;
          const blades = (valueNoise(wx * 0.8 + wy * 0.3, wy * 0.6 - wx * 0.15, seed + 3333) - 0.5) * 30;
          const tussock = bandDetail(wx + wy * 0.3, wy - wx * 0.2, seed + 3334, ROUGHNESS_OCTAVE_PX.grass[0], pxStep) * 22;
          const m = clump + patch + streak + blades + tussock;
          r = clamp(r + m * 0.32, 0, 255);
          g = clamp(g + m * 0.85, 0, 255);
          b = clamp(b + m * 0.2, 0, 255);
          // Soil showing through: a discrete fleck, not a gradient — the one part of this mix the eye
          // reads as *objects on* the grass rather than as variation in it.
          if (valueNoise(wx * 2.5, wy * 2.5, seed + 5555) > 0.82) {
            r = clamp(r * 0.85, 0, 255); g = clamp(g * 0.88, 0, 255); b = clamp(b * 0.82, 0, 255);
          }
        }
      }

      // Read rock material and ridge light from existing fields; leave snowy crests exposed.
      const sx = sampleF(slopeX, cols, rows, tcx, tcy);
      const sy = sampleF(slopeY, cols, rows, tcx, tcy);
      const rl = sampleF(relief, cols, rows, tcx, tcy);
      if (!isWater && rd < ROCK_RIVER_MAX && hn > ROCK_UPLAND_START) {
        const upland = clamp((hn - ROCK_UPLAND_START) / ROCK_UPLAND_SPAN, 0, 1);
        const slope = Math.hypot(sx, sy);
        // Keep half-covered snow as a transition, but never tint a majority-snow crest
        // grey or warm it with rock/valley colour. The snow ramp owns that surface.
        const exposedUpland = upland * clamp(1 - snowAmountAt(hn, te) * 2, 0, 1);
        const stoneExposure = clamp((slope - ROCK_SLOPE_START) / ROCK_SLOPE_SPAN, 0, 1)
          * exposedUpland * clamp((ROCK_RIVER_MAX - rd) / ROCK_RIVER_FADE, 0, 1);
        if (stoneExposure > ROCK_EXPOSURE_MIN) {
          const strata = (valueNoise(
            wx * ROCK_STRATA_X_FREQ + wy * ROCK_STRATA_DIAGONAL_FREQ,
            wy * ROCK_STRATA_Y_FREQ, seed + 7017,
          ) - 0.5) * ROCK_STRATA_NOISE_GAIN
            + Math.sin(e * ROCK_STRATA_ELEVATION_FREQ) * ROCK_STRATA_ELEVATION_GAIN;
          const blend = stoneExposure * ROCK_BLEND_MAX;
          r += (115 + strata - r) * blend;
          g += (111 + strata * 0.9 - g) * blend;
          b += (105 + strata * 0.8 - b) * blend;
        }

        // Ridges lift ambient light; valleys retain shade.
        const ridge = clamp((rl - RIDGE_RELIEF_START) / RIDGE_RELIEF_SPAN, 0, 1) * exposedUpland;
        const valley = clamp((-rl - VALLEY_RELIEF_START) / VALLEY_RELIEF_SPAN, 0, 1) * exposedUpland;
        r = (r + ridge * RIDGE_COLOR_GAIN[0]) * (1 - valley * VALLEY_COLOR_DARKEN[0]);
        g = (g + ridge * RIDGE_COLOR_GAIN[1]) * (1 - valley * VALLEY_COLOR_DARKEN[1]);
        b = (b + ridge * RIDGE_COLOR_GAIN[2]) * (1 - valley * VALLEY_COLOR_DARKEN[2]);
      }

      // River. The distance field is smooth, so the blend is curved rather than clamped, and its
      // core is deeper and darker than its shoulder — a channel with banks, not a flat sticker.
      if ((map.generationVersion ?? 0) >= 3 && rd > 0.05) {
        // Exposed banks stay soil; the visible channel starts at the classifier's water threshold.
        const wetBank = clamp((rd - 0.05) / 0.28, 0, 1)
          * (1 - clamp((rd - 0.44) / 0.13, 0, 1));
        r *= 1 - wetBank * 0.22;
        g *= 1 - wetBank * 0.16;
        b *= 1 - wetBank * 0.11;
        // Deposition follows broad coherent patches, not a uniform brown border around the river.
        // Keep the silt underneath the 0.55 gameplay-water threshold.
        if (wetBank > 0) {
          const sediment = valueNoise(wx * 0.024, wy * 0.024, seed + 6030);
          const silt = wetBank * clamp((sediment - 0.43) * 1.7, 0, 1) * 0.28;
          r = r * (1 - silt) + SAND_WET[0] * silt;
          g = g * (1 - silt) + SAND_WET[1] * silt;
          b = b * (1 - silt) + SAND_WET[2] * silt;
        }
        if (rd > 0.47) {
          const waterBlend = clamp((rd - 0.47) / 0.08, 0, 1);
          const core = clamp((rd - 0.62) / 0.37, 0, 1);
          const river = lc(RIVER_EDGE, RIVER_CORE, core);
          const surface = (valueNoise(wx * 0.08 + wy * 0.018, wy * 0.09 - wx * 0.02, seed + 6060) - 0.5) * 9;
          r = r * (1 - waterBlend) + (river[0] + surface) * waterBlend;
          g = g * (1 - waterBlend) + (river[1] + surface * 1.1) * waterBlend;
          b = b * (1 - waterBlend) + (river[2] + surface * 1.4) * waterBlend;
          // Along-stream phase makes the bright wave fronts cross the stream, not run as a global
          // screen-aligned stripe. Stronger whitewater only appears near actual waterfall drops.
          if (rd > 0.55 && waterBlend > 0.5) {
            const distanceAlong = sampleRiverPhase(
              riverPhase, riverFlowMask, waterCols, waterRows, wx / WATER_CELL, wy / WATER_CELL,
            );
            if (distanceAlong !== null) {
              const rapid = sampleF(riverRapids, waterCols, waterRows, wx / WATER_CELL, wy / WATER_CELL);
              const phase = distanceAlong * 0.25
                + (valueNoise(wx * 0.045, wy * 0.045, seed + 6130) - 0.5) * 3.5;
              const crest = Math.max(0, Math.sin(phase)) ** 8;
              const highlight = crest * (0.065 + 0.58 * rapid) * waterBlend;
              r += (WATER_FOAM[0] - r) * highlight;
              g += (WATER_FOAM[1] - g) * highlight;
              b += (WATER_FOAM[2] - b) * highlight;
            }
          }
        }
      } else if ((map.generationVersion ?? 0) < 3 && rd > 0.03) {
        const str = clamp((rd - 0.03) / 0.55, 0, 1) ** 0.75;
        const core = clamp((rd - 0.42) / 0.5, 0, 1);
        const river = lc(RIVER_EDGE, RIVER_CORE, core);
        r = r * (1 - str) + (river[0] + dv * 12) * str;
        g = g * (1 - str) + (river[1] + dv * 16) * str;
        b = b * (1 - str) + (river[2] + dv * 12) * str;
      }

      // Hillshading, light from the upper-left, read from the precomputed slope field, plus the
      // altitude term a slope field cannot express: a flat valley floor still catches relief light.
      const reliefWeight = clamp((hn - LOWLAND_OF_LAND_RANGE) / RELIEF_FADE_OF_LAND_RANGE, 0, 1);
      // Multidirectional hillshade (see `SHADE_LIGHTS`): weighted sum of four azimuths, divided by
      // the primary's weight so a slope facing it keeps its single-light shade.
      let shadeSum = 0;
      for (let k = 0; k < SHADE_LIGHTS.length; k++) {
        const lightDir = SHADE_LIGHTS[k];
        const weight = k === 0 ? SHADE_PRIMARY_WEIGHT : 1;
        shadeSum += -(sx * lightDir[0] + sy * lightDir[1]) * SHADE_GAIN * weight;
      }
      let light = shadeSum / SHADE_PRIMARY_WEIGHT + rl * RELIEF_GAIN * reliefWeight;
      if (isWater) light *= 0.06;
      if (light > 0) {
        const a = clamp(light, 0, 1) * 0.34;
        r = r + (252 - r) * a; g = g + (246 - g) * a; b = b + (226 - b) * a;
      } else {
        const a = clamp(-light, 0, 1) * 0.4;
        r = r * (1 - a); g = g * (1 - a * 0.97); b = b * (1 - a * 0.9);
      }

      // Cast shadow, cooled and softened. Water is skipped: a carved river cell sits far below its
      // banks, so the trace would paint the channel dark.
      if (!isWater) {
        const ao = sampleF(skyOcclusion, cols, rows, tcx, tcy);
        const ambientShade = ao * 0.32;
        r *= 1 - ambientShade;
        g *= 1 - ambientShade * 0.97;
        b *= 1 - ambientShade * 0.90;
        const sh = sampleF(shadowMap, cols, rows, tcx, tcy);
        if (sh > 0.01) {
          const a = sh * SHADOW_STRENGTH;
          r = r * (1 - a); g = g * (1 - a * 0.95); b = b * (1 - a * 0.82);
        }
      }

      // Slope edge — a sharp slope change darkens into a rim, so a ridgeline reads as one rather
      // than as a colour change. Kept off water, beaches and riverbanks.
      const maxSlope = Math.max(Math.abs(sx), Math.abs(sy));
      if (maxSlope > RIM_SLOPE && !isWater && rd <= 0.01 && hn > BEACH_BAND_OF_LAND_RANGE) {
        const edgeStrength = clamp((maxSlope - RIM_SLOPE) * 8, 0, 1) * RIM_STRENGTH;
        r = r * (1 - edgeStrength);
        g = g * (1 - edgeStrength);
        b = b * (1 - edgeStrength);
      }

      // Snow is strongly reflective even on a shaded mountainside: keep the silhouette and cast
      // shadows, but lift north-facing snowfields out of the grey rock palette.
      if (!isWater) {
        const brightSnow = clamp((snowAmountAt(hn, te) - 0.78) / 0.22, 0, 1);
        const bounce = brightSnow * 0.65;
        r += (215 - r) * bounce;
        g += (225 - g) * bounce;
        b += (237 - b) * bounce;
      }

      const off = (py * W + px) * 4;
      d[off] = r;
      d[off + 1] = g;
      d[off + 2] = b;
      d[off + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
