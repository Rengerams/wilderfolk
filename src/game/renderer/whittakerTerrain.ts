/**
 * Per-pixel Whittaker ground bake, ported from Teraforge `render.ts` and adapted
 * to Wilderfolk's season-aware renderer.
 *
 * Fed by the continuous fields on `WorldMap` (`elevation` / `moisture` /
 * `temperature` / `riverDist` / `terrain`), this produces the smooth, hillshaded,
 * texture-detailed ground Teraforge renders — no tile seams. Returns `null` for a
 * legacy map that lacks those fields, so the caller keeps the old tile bake.
 *
 * **The height axis is the classifier's.** Land colour is computed from
 * `hn = (e − seaLevel) / (1 − seaLevel)` and its bands come from `LAND_BANDS`,
 * which `terrainGrid.classifyTile` owns. Colouring on absolute elevation above sea
 * instead (as the first version did) puts the whole alpine half of the ramp out of
 * reach on any preset with `seaLevel ≥ 0.12` — measured, **0.0 % of a scandinavia
 * map's land could paint snow** while 1.0 % of its tiles were `Snow`, and its
 * `Rocky` / `Mountains` tiles were painted lawn green.
 */
import type { Season, WorldMap } from '../gameTypes';
import { Season as SeasonEnum } from '../gameTypes';
import { clamp, valueNoise } from '../terrain/noise';
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
 * Full 1:1 bake up to this many pixels; a larger **whole-map** region drops to a world step of 2
 * (2 world px per canvas px) and is stretched across the world rect, which reads as a soft,
 * 2×-magnified ground.
 *
 * This only governs a bake that covers a whole map — the probes, the tests and the legacy call shape.
 * The shipping renderer bakes one small chunk per visible viewport (`renderer/terrain.ts`) and tells
 * the baker its world step from the camera zoom (`groundWorldStepForZoom`), so the budget is not on
 * the play path at all.
 *
 * Measured whole-map, per spec map size (2026-09-24, seed 12345, continental):
 *
 * | world | Mpx | surface at budget 13 M | bake |
 * |---|---|---|---|
 * | Medium 2560×1920 | 4.9 | 2560×1920 (1:1) | 3.2–3.4 s |
 * | Large 4096×3072 | 12.6 | 4096×3072 (1:1) | 7.7–8.0 s |
 * | Huge 6144×4608 | 28.3 | 3072×2304 (1:2) | 4.1 s |
 *
 * **Large used to fall on the wrong side of this line by 4.6 %** — 12,582,912 against a 12 M budget —
 * so the *larger* map baked at 1:2 and rendered softer than Medium, at *half* Medium's bake cost. The
 * budget now clears Large; Huge still does not, because 1:1 there is a 113 MB surface.
 */
const FULL_BAKE_PIXEL_BUDGET = 13_000_000;

type Rgb = [number, number, number];

/**
 * Depth at which water is fully deep — **derived from the map**, not a fixed constant.
 *
 * The ramp used to saturate at a hard `0.11`, which is a fraction of the depth range the generator
 * actually produces: measured, `islands` bottoms out **0.588** below sea level, `coastal` **0.490**
 * and `scandinavia` **0.380**, so **81 % / 78 % / 71 %** of their water sat at the deepest ramp colour.
 * That is what made the sea a featureless field — water local contrast measured
 * **0.55–1.82** against the land's **4.0–5.1**. Spanning the map's own
 * {@link DEEP_WATER_DEPTH_PERCENTILE} of water depth uses the whole gradient on every preset, so a
 * soundings chart reads as depth instead of a navy plate. This is the water twin of
 * `terragen.spreadHeights`, which fixed the same saturation for the land.
 */
const DEEP_WATER_DEPTH_PERCENTILE = 0.98;
/** Far-end depth used when a map has too little water to measure (an oasis lake, a river-only map). */
const DEEP_WATER_DEPTH_FALLBACK = 0.11;
/** Water cells needed before the map's own depth is trusted over {@link DEEP_WATER_DEPTH_FALLBACK}. */
const MIN_WATER_CELLS_FOR_DEPTH = 64;
/**
 * Deepening tints, shallow → deep — the bathymetric ramp.
 *
 * **Discrete bands, not a continuous gradient.** A smooth ramp spread across a 0.59-deep ocean changes
 * too little per pixel to see (measured: water local contrast **0.55–1.82** against the land's
 * **4.0–5.1**), which is why the sea read as one plate. Banded tints are how depth is actually drawn —
 * on charts per [IHO S-4](https://iho.int/uploads/user/pubs/standards/s-4/S4_V4-9-0_March_2021.pdf),
 * and in `gdaldem color-relief -exact_color_entry` for a DEM: flat within a band, a readable edge
 * between bands, and the band count carrying depth at a glance. The ramp spans the map's own deep
 * depth (see {@link DEEP_WATER_DEPTH_PERCENTILE}), so the bands are used on every preset.
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
/**
 * The floor's own grain, in 0–255 units, so a band is a surface rather than a flat fill. This is the
 * cheap half of the seabed rugosity that `gdaldem TRI -alg Wilson` documents as "recommended for
 * bathymetric use cases": the bands carry the depth, the grain carries the floor.
 */
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
/** Where winter snow begins to settle, as a fraction of the land range. */
const WINTER_SNOW_LINE = 0.3;
/** Height of the lowland band — everything below reads as plain rather than as slope. */
const LOWLAND_OF_LAND_RANGE = 0.35;
/**
 * Hillshade gain, against a slope expressed as elevation change per cell. Sized so a typical
 * mountainside reaches full light/shade and a plain stays flat.
 */
const SHADE_GAIN = 30;
/** Per-cell slope above which a slope change starts to read as a rim, and how dark the rim goes. */
const RIM_SLOPE = 0.045;
const RIM_STRENGTH = 0.12;

/**
 * The heading **toward the light**, in cell steps: up and to the left.
 *
 * This is the one source of truth for the light. The hillshade reads it as a dot product against the
 * surface normal (`light = −(sx·x + sy·y) · SHADE_GAIN`), and the shadow trace walks *along* it to
 * find the ground standing between a cell and the sun. Both used to carry their own copy, and the
 * trace's copy had the **opposite sign** — so the cast shadow was painted onto the flank the
 * hillshade was busy lighting (measured: the cells the shadow field darkened came out **42–48 luma
 * brighter** than the rest, because a slope rising away from the light is the *lit* one).
 */
const LIGHT_TOWARD_X = -0.6;
const LIGHT_TOWARD_Y = -0.8;

/**
 * Lights for the **hillshade**, as unit vectors toward the light (screen space: x right, y down).
 *
 * Four lights, not one. The established "multidirectional" hillshade — USGS Open-File 92-422, which
 * GDAL exposes as `gdaldem hillshade -multidirectional` with azimuths 225/270/315/360 — exists because
 * a single azimuth renders any slope face parallel to it flat. On this terrain that is exactly what
 * happened: whole mountain flanks came out as one featureless grey blob (measured on 1:1 crops of
 * `highland`). The primary entry is the same sun the shadow trace walks toward ({@link LIGHT_TOWARD_X},
 * ~322°), so the map still reads as lit from the upper left — the cartographic default — while a face
 * at any other heading is lit by one of the other three instead of going flat.
 */
const SHADE_LIGHTS: readonly (readonly [number, number])[] = [
  [LIGHT_TOWARD_X, LIGHT_TOWARD_Y], // primary — the sun the cast-shadow trace walks toward
  [-0.7071, 0.7071],                // 225° — south-west
  [-1, 0],                          // 270° — west
  [0, -1],                          // 360° — north
];
/**
 * Weight of the primary light against each of the other three. Averaging four equal lights would wash
 * the north-west reading out; dividing the weighted sum by this value leaves a slope facing the
 * primary with exactly the shade it had when there was only one light.
 */
const SHADE_PRIMARY_WEIGHT = 2;

/** How far the shadow trace looks for a blocker, in cells — a ridge shadows further than 6 cells. */
const SHADOW_TRACE_STEPS = 14;
/**
 * The sun's inclination, as a rise per cell of distance. A blocker only shadows a cell when the
 * ground toward the light climbs **faster than this**, which is what keeps a cast shadow a local
 * feature: with a flat minimum rise and no distance term, 45 % of highland's land came out fully
 * shadowed (measured) and the whole map just went dim. Measured up-light rise per cell: p50
 * 0.007–0.021, p75 0.025–0.045, p90 0.048–0.074 across highland / scandinavia / continental, so a
 * sun at 0.035 puts the shadow on the steepest quarter of the land.
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
 *
 * The hillshade alone cannot show it: a valley floor is *flat*, so its slope is zero and it comes out
 * exactly as bright as a plain. Measured before this term, the mean luma of the highest quartile of
 * hilly ground was **0.5 luma** from the lowest quartile on scandinavia (highland −9.3, and that is
 * mostly snow) — height barely read as light at all.
 */
const RELIEF_GAIN = 26;
const RELIEF_FADE_OF_LAND_RANGE = 0.25;
/** The neighbourhood a cell's relief is measured against, in cells (16 world px each). */
const RELIEF_NEIGHBOURHOOD_CELLS = 6;

/**
 * The band of ground detail the eye reads as **surface roughness**, in canvas px per cycle.
 *
 * Padilla (2008), *Mathematical models for perceived roughness of three-dimensional surface
 * textures*, fits a band-pass over the psychophysical data for 1/f^β noise surfaces and lands on an
 * optimised pass band of **1.53–4.58 cycles per degree** (§7.3.1). Detail outside that band barely
 * moves perceived roughness, so grain finer than its lower edge is close to free of effect: it reads
 * as fizz instead of as a rougher material. The calibration display resolved 60 px per degree
 * (0.255 mm pixel pitch at 87.7 cm), putting the band at **≈13–39 px per cycle** here.
 *
 * The material detail below is built on both halves of that: each material carries a roughness
 * octave *inside* this band ({@link ROUGHNESS_OCTAVE_PX}), and the sub-pixel octaves that used to
 * dominate the mix are trimmed to the share material identity needs.
 */
export const ROUGHNESS_BAND_PX = { fine: 13, coarse: 39 } as const;

/**
 * The canvas-px period of each material's roughness octave — one period per octave, all inside
 * {@link ROUGHNESS_BAND_PX}. This is the octave that decides how rough the material reads.
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
 * One detail octave whose period is fixed in **canvas** px, so it stays inside the roughness band at
 * every bake step: at a world step of 2 the same structure is sampled at half the world frequency
 * instead of being pushed out of the band. Returns ±0.5, like the raw `valueNoise` it wraps.
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
 * Whittaker biome colours — the **Ricklefs palette**, the published scheme used to draw Whittaker
 * diagrams in ecology, positioned on the diagram's own axes: mean annual temperature (0–1 after the
 * generator's mapping) and annual precipitation (0–1, the `moisture` field).
 *
 * The land ramp used to be keyed on **height** with climate as sub-branches, which is why an arid
 * preset painted green: every inland stop on the ramp was a shade of green, so `arabia` (hot + dry,
 * moisture 0.12) could never reach a sand or ochre colour. Reading the colour off the chart the
 * classifier is modelled on fixes that at the source, and it is the same one-chart rule the tile and
 * the ground art are supposed to share.
 *
 * Anchors are read from the **colours and their positions**, not the printed region numbers: the
 * figure's numbering and its legend disagree (figure region 9 = dark green = legend "Tropical rain
 * forest" 5; figure region 2 = pale yellow = legend "Temperate grassland/desert" 8).
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
 * The diagram as a lookup table, built **once** and sampled per pixel.
 *
 * Evaluating a nine-anchor climate chart per pixel would be the most expensive thing in the bake, and
 * the chart does not depend on the map or the seed, so it is a constant. Red Blob Games gives exactly
 * this prescription for biome lookup: "The square is easier to use in a lookup table or GPU texture
 * lookup."
 *
 * Blending is Shepard inverse-distance weighting over the anchors, which turns the diagram from nine
 * hard regions into a continuous surface. That is the documented answer to this project's own open
 * item — roadmap Theme 1: *"biome colour still steps where the classification steps … the documented
 * technique is per-biome weights blended into the colour rather than one label per cell."*
 */
const WHITTAKER_LUT_SIZE = 65;
/**
 * Shepard exponent for the chart blend. Lower is smoother — the roadmap wants the *colour* continuous
 * across a biome boundary rather than stepping on it, so this stays low. (Tried raising it to 7 to see
 * whether a cold swatch was bleeding into warm ground: it changed nothing, because the cyan on a hot
 * preset's edges is the temperature field's own polar cooling, not a blend artefact.)
 */
const WHITTAKER_IDW_POWER = 4;
/**
 * How much of each published swatch survives as **ground albedo**.
 *
 * The Ricklefs palette is a *categorical* scheme: nine fills chosen to be told apart in a diagram, not
 * to look like a landscape. Painted raw on terrain it reads as a lurid patchwork, and its Tundra swatch
 * (`#C1E1DD`) is a pale cyan that reads as shallow water when it sits beside sand. Blending each swatch
 * this far toward its own grey keeps the biome identity — yellow steppe, green forest, rust shrubland —
 * while letting the relief shading carry the form. That is the standard cartographic move: a
 * hypsometric ramp is deliberately low-saturation so the hillshading reads through it.
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
 * The ground colour at one pixel.
 *
 * `shorePush` is the pixel's share of the coastline jitter (see the bake loop): it moves the
 * waterline and nothing else, so a coast is a curve rather than a run of 16 px lattice steps while
 * the classification that decides what a settler may cross stays exactly where it was.
 *
 * `deepWaterDepth` is the map's own far end for the water ramp (see {@link WhittakerFields}), so the
 * shallow→shelf→deep gradient spans the depth this map actually has instead of a fixed 0.11.
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

  // OCEAN — banded depth tints. The first version had two smooth arms that did not meet at the shelf
  // edge (`[12,45,90]` against `[34,83,134]`), which drew a hard dark ring inside every shelf; that
  // was fixed into one continuous ramp — and a continuous ramp across a 0.59-deep ocean then changed
  // too little per pixel to read at all. Discrete bands are the established answer (IHO S-4 charts;
  // `gdaldem color-relief -exact_color_entry`): the band count carries the depth at a glance and each
  // band edge is a contour line for free. Bands are normalised to this map's own deep depth, so a
  // shallow lake and a deep ocean both use the full set.
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
  // An absolute sand ramp (the first version's `SEA + 0.04`-style band) bled its pale strip onto
  // the first grass tiles of every shore.
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

  // BELOW THE ALPINE LINE, CLIMATE DECIDES THE COLOUR — read straight off the Whittaker diagram, the
  // chart `classifyTile` is modelled on, so the ground cannot disagree with the tile beneath it. `dv`
  // is the four-octave albedo variation; altitude desaturates a little as the ground rises.
  const climate = whittakerColor(te, mo);

  if (hn < LAND_BANDS.hills) {
    const t = clamp((hn - LOWLAND_OF_LAND_RANGE) / (LAND_BANDS.hills - LOWLAND_OF_LAND_RANGE), 0, 1);
    return darken(
      [climate[0] + dv * 24, climate[1] + dv * 22, climate[2] + dv * 18],
      elevDarken + t * 0.12,
    );
  }

  // ALPINE — scrub gives way to rock, rock to scree, and cold crests take snow. The bands are the
  // classifier's own, and snow is gated on the same temperature, so a `Mountains` tile the air is
  // too warm to cap stays bare stone instead of being painted white.
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
 * Sample a cell field at fractional cell coordinates.
 *
 * **Smoothstep, not linear.** Bilinear interpolation is only C0 — its derivative jumps at every
 * cell edge — so a band edge, a hillshade and a rim all carry a faint lattice kink. Smoothstep
 * weights make the sample C1. (This is not on its own what removed the 16 px mosaic: that was the
 * shading's *input*, a raw-cell difference that is constant across a cell. See `slopeX`/`slopeY`.)
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
 * How much of a season shift a pixel takes, 0–1.
 *
 * The seasons repaint what *grows*, not stone, sand or water: a flat shift turned rock brown in
 * summer and washed the whole map grey in winter.
 */
function vegetationWeight(hn: number, beachStrength: number): number {
  let v: number;
  if (hn < LAND_BANDS.hills) v = 0.95;
  else if (hn < LAND_BANDS.rocky) v = 0.5;
  else if (hn < LAND_BANDS.mountains) v = 0.18;
  else v = 0.06;
  return v * (1 - clamp(beachStrength, 0, 1) * 0.7);
}

/**
 * Whole-map fields the bake needs. They are **cell-resolution** — 160 × 120 at the current
 * constants on a 2560 × 1920 map — so they are cheap to hold for the whole world while the
 * per-pixel loop runs over one viewport at a time.
 */
export interface WhittakerFields {
  cols: number;
  rows: number;
  /**
   * The height the **ground art** reads: `map.elevation` after one 3×3 pass.
   *
   * The generator's river carve writes whole-cell plates — a channel at `seaLevel - 0.01` and its
   * banks at `seaLevel + 0.04` — so the raw field steps by a whole cell and the waterline lands hard
   * on the lattice. Classification keeps reading the raw field (walkability must not move); the
   * colour ramp, the waterline and the light all read this one instead, which turns a one-cell step
   * into a smooth bank and is what removed the terraces around every carved pool.
   */
  shade: Float32Array;
  /**
   * Terrain slope per cell, x and y — the shading's input.
   *
   * The hillshade and the slope rim read these **sampled** fields rather than differencing elevation
   * cells directly: a raw difference is constant across one cell, so it paints the shading as a
   * mosaic of 16 px squares (measured on a 1:1 crop of a scandinavia bake). Precomputing the
   * gradient once per map costs one pass over the cells and leaves the per-pixel loop two smooth
   * samples instead of four.
   */
  slopeX: Float32Array;
  slopeY: Float32Array;
  /**
   * How much higher (or lower) this cell stands than the ground around it, in elevation units —
   * negative in a valley, positive on a ridge. This is the altitude half of the relief: the slope
   * fields describe the *tilt* of a cell, this describes where the cell sits on the mountain.
   */
  relief: Float32Array;
  /** How much of the sun's path from the light to this cell is blocked, 0–1. */
  shadowMap: Float32Array;
  /** How close each cell is to water — the damp verge along every shore. */
  waterProx: Float32Array;
  /**
   * Depth at which this map's water is fully deep — the far end of the water ramp, in elevation
   * units. Derived per map (see {@link DEEP_WATER_DEPTH_PERCENTILE}) so the shallow→shelf→deep
   * gradient spans the depth the map actually has; a fixed far end saturated 68–81 % of the sea on
   * the ocean presets into one flat colour.
   */
  deepWaterDepth: number;
}

/**
 * The slope, relief, cast-shadow and water-proximity fields for a map.
 *
 * O(cells), not O(pixels): the shadow trace is 14 steps per cell, the relief blur 169 samples and the
 * proximity probe 9, so this stays negligible at every map size the spec names — which is why a
 * chunked baker can afford to hold it for the whole world and reuse it across chunks.
 */
export function buildWhittakerFields(map: WorldMap): WhittakerFields | null {
  const { cols, rows, elevation, terrain } = map;
  if (!cols || !rows || !elevation || !terrain) return null;

  // One 3×3 pass over the height, and the ground art reads *this* field rather than `map.elevation`.
  // The generator's river carve writes whole-cell plates — a channel at `seaLevel - 0.01` and its
  // banks at `seaLevel + 0.04` — so the raw field steps by a whole cell: the waterline landed hard
  // on the lattice and every carved pool rendered as a staircase. Classification keeps reading the
  // raw field (walkability must not move), and a 3×3 average turns that one-cell step into a bank.
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

  // Altitude relief: each cell's height against a blurred copy of the whole field. Plain loops, not a
  // sliding window — the cell grid is a few thousand entries even on Huge, so the extra pass is free
  // next to the per-pixel bake and there is no edge case to get wrong.
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
      // of it. This used to walk the other way, which is why the shadow landed on the lit flank.
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

  const waterProx = new Float32Array(cols * rows);
  const sea = map.seaLevel ?? DEFAULT_SEA_LEVEL;
  // The water ramp's far end, from this map's own depth distribution. A high percentile rather than
  // the maximum, so a single trench cell cannot compress the whole shelf into a few pixels; the
  // fallback keeps a map with almost no water (an oasis lake, a river-only map) on the constant the
  // ramp was originally tuned with rather than over-stretching a handful of shallow cells.
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
      // Water is read from the elevation field rather than from the biome *label*: the classifier's
      // water is exactly `e < seaLevel`, so this is the same water, and it keeps the one renderer
      // field-driven — no cell label reaches the ground art.
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

  return { cols, rows, shade, slopeX, slopeY, relief, shadowMap, waterProx, deepWaterDepth };
}

/** The world rectangle one bake covers. Omit to bake the whole map. */
export interface WhittakerViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * World pixels per canvas pixel the ground should be baked at for a camera zoom.
 *
 * Screen px per world px **is** the zoom, so baking at `1 / zoom` world px per canvas px makes the
 * canvas match what the monitor can show; anything finer is work nobody can see, and anything coarser
 * is a visible blur. Rounded to a power of two because the loop advances in whole canvas pixels, and
 * floored at 1 — a chunk is never baked sharper than the field lattice it samples.
 *
 * Measured before this existed: at the 0.5× overview the renderer still baked **28.3 Mpx** for a
 * 1600×900 window (17.4 s for one frame on a Huge map) because every chunk was 1:1. At 2 it is 7.1 Mpx.
 */
export function groundWorldStepForZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return clamp(2 ** Math.round(Math.log2(1 / zoom)), 1, 4);
}

/**
 * Bake a per-pixel Whittaker ground surface.
 *
 * Returns null when the map has no continuous fields (a legacy map). `seaLevel` / `moistureBias`
 * come from the map's stored generation settings, so no per-preset table is needed.
 *
 * **`viewRect` is what bounds the cost.** Every colour term is a function of the *world*
 * coordinate only — the noise, the field samples, the hillshade and the shadow trace all read
 * absolute positions — so a viewport bake is pixel-identical to the matching crop of a whole-map
 * bake, with no seam. That is what lets the renderer bake just what the camera can see: without
 * it this loop is the one cost that scales with map area, and it measured **5.4 s** at
 * 6144×4608, which is why the Teraforge spec map sizes could not ship.
 *
 * `worldStep` is world pixels per canvas pixel; `null`/omitted keeps the whole-map default (1, or 2
 * once the baked area passes {@link FULL_BAKE_PIXEL_BUDGET}). A caller that knows the camera zoom
 * should pass `groundWorldStepForZoom(zoom)`. Whatever the caller passes, the canvas is pixel-aligned
 * to the world grid — the chunk origin is a multiple of the step — so neighbouring chunks never seam.
 */
export function bakeWhittakerGround(
  map: WorldMap,
  worldW: number,
  worldH: number,
  season: Season,
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
  const { shade, slopeX, slopeY, relief, shadowMap, waterProx, deepWaterDepth } = fields;

  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const wx = originX + px * pxStep;
      const wy = originY + py * pxStep;
      const tcx = wx / C;
      const tcy = wy / C;
      // The height the ground art reads is the smoothed field, not the raw one — see `WhittakerFields.shade`.
      const e = sampleF(shade, cols, rows, tcx, tcy);
      const mo = clamp(sampleF(moisture, cols, rows, tcx, tcy) + moistureBias, 0, 1);
      const te = sampleF(temperature, cols, rows, tcx, tcy);
      // Four octaves across four scales, collapsed to a **0-mean deviation** (`dv`) because every
      // consumer below multiplies it by a per-channel amplitude while adding it to a mean colour.
      // Teraforge's source wrote these amplitudes into the base ramps themselves (`98 + nv * 22` on
      // grass, `54 + nv * 14` on woodland); Wilderfolk's ramps carry the mean explicitly, so the
      // variation arrives here instead. Same field, same scales, one place to read it from.
      const nv = valueNoise(wx * 0.032, wy * 0.032, seed + 7777) * 0.4
        + valueNoise(wx * 0.075, wy * 0.075, seed + 8888) * 0.3
        + valueNoise(wx * 0.17, wy * 0.17, seed + 9999) * 0.2
        + valueNoise(wx * 0.4, wy * 0.4, seed + 1111) * 0.1;
      const dv = nv - 0.5;
      const nearWater = sampleF(waterProx, cols, rows, tcx, tcy);

      // One coastline/bank jitter displaces the two *water* edges so both are curves instead of runs
      // of lattice steps. It is deliberately not applied to the land bands: those are the
      // classification, and they must stay where the classifier put it.
      //
      // **Wavelength matters more than amplitude.** At ~3 px the edge frays — the waterline moves by
      // `jitter / local gradient` pixels, so a short wavelength turns a coast into a torn, speckled
      // rim — and at a world step of 2 (any bake coarser than the screen) a 3 px wave is sampled under
      // Nyquist and aliases back into the steps it was added to remove. At ~8 px it reads as a
      // meander at 1:1, survives half-resolution sampling, and still breaks the 16 px lattice.
      const edgeJit = (valueNoise(wx * 0.13, wy * 0.13, seed + 5150) - 0.5) * 2;

      const aboveSea = e - sea;
      const hn = aboveSea / landRange;
      // Water comes from the pixel's own elevation, so the colour ramp, the hillshade damping and
      // the shadow guard all agree about where the waterline is.
      const isWater = aboveSea < 0;

      let [r, g, b] = groundColor(
        e, sea, landRange, mo, te, dv, nearWater, edgeJit * SHORE_JITTER_ELEVATION, deepWaterDepth,
      );

      // Seabed grain: the floor's own variation *inside* each tint band, so a band is a surface and not
      // a flat fill. Depth itself is carried by the banded ramp in `groundColor` — this adds no depth
      // cue, deliberately, so the band edges stay the readable contour. (The first version modulated
      // the whole bed with un-warped cloud noise at 26/255, which read as dirt rather than as depth.)
      //
      // A sine "contour" term used to live here. It was not a standard method and it did not work:
      // `sin(depth * 190) * 5` put ~10 bands in a 0.59-deep sea and one in a shallow lake, at a 2 %
      // swing — computed on every water pixel and invisible. Charts use discrete tints, not sine waves.
      if (isWater) {
        const grain = (valueNoise(wx * 0.03, wy * 0.03, seed + 4321) - 0.5)
          + (valueNoise(wx * 0.11, wy * 0.11, seed + 4322) - 0.5) * 0.6;
        const g2 = grain * BATHYMETRY_GRAIN;
        r = clamp(r + g2 * 0.5, 0, 255);
        g = clamp(g + g2 * 0.8, 0, 255);
        b = clamp(b + g2, 0, 255);
      }

      // Material detail. Each material now carries an octave **inside** the band the eye reads
      // roughness in (`ROUGHNESS_BAND_PX`) and authored in canvas px (`bandDetail`), because that is
      // the octave that decides how rough the material reads. The sub-pixel octaves that used to
      // dominate these mixes are trimmed to the share material identity still needs: past the band's
      // lower edge extra grain buys almost no perceived roughness — a 1:1 crop of stone was a uniform
      // grey speckle with no bedding in it at all, and a snowfield was flat white.
      //
      // The material is chosen from the **smooth** fields — height, moisture, proximity to water —
      // and not from the nearest cell's biome label. A per-cell label puts every biome boundary on
      // the 16 px lattice, and a 1:1 crop of a scandinavia bake showed exactly that: a checkerboard
      // of grass, dirt and stone squares between the ridges. The colour ramp was always continuous
      // in these fields; now the material is too, so a material edge lands on a shoreline or a
      // hillside instead of on the lattice.
      if (!isWater) {
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
          // Two fracture sets at different scales plus strata that follow the elevation, and a bedding
          // ledge plus rubble in the roughness band — stone is read from ledges, and the old mix put
          // every octave below the band.
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
          // Grass detail is ported from Teraforge `render.ts`'s high-frequency pass — the source this
          // renderer was derived from. It is *structured*, not random: directional streaks that read as
          // blades, coarse mottling so a field reads as varied, and **discrete** dark flecks standing in
          // for soil showing through. That structure is the whole point. An earlier attempt here raised
          // these amplitudes as plain per-pixel grain and looked like fizz, because independent noise at
          // every pixel has no blade, no patch and no fleck in it — it is texture with nothing in it to
          // read, which is exactly what the band-limit note above warns about, applied to the wrong
          // scale. Keep the structure, tune the amplitudes.
          //
          // `clump`/`streak` are the low-frequency halves and stay in the roughness band; the blade
          // streaks and flecks are deliberately finer, because that is how the source art reads at 1:1.
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

      // River. The distance field is smooth, so the blend is curved rather than clamped, and its
      // core is deeper and darker than its shoulder — a channel with banks, not a flat sticker.
      const rd = sampleF(riverDist, waterCols, waterRows, wx / WATER_CELL, wy / WATER_CELL) - edgeJit * RIVER_EDGE_JITTER;
      if (rd > 0.03) {
        const str = clamp((rd - 0.03) / 0.55, 0, 1) ** 0.75;
        const core = clamp((rd - 0.42) / 0.5, 0, 1);
        const river = lc(RIVER_EDGE, RIVER_CORE, core);
        r = r * (1 - str) + (river[0] + dv * 12) * str;
        g = g * (1 - str) + (river[1] + dv * 16) * str;
        b = b * (1 - str) + (river[2] + dv * 12) * str;
      }

      // Hillshading, light from the upper-left, read from the map's precomputed slope field — plus the
      // **altitude** term, which is the half a slope field cannot express: a valley floor is flat, so
      // its gradient is zero and it came out exactly as bright as a plain. Lit faces warm up and
      // shaded faces cool down — the first version only darkened, which reads as grime rather than as
      // light.
      const sx = sampleF(slopeX, cols, rows, tcx, tcy);
      const sy = sampleF(slopeY, cols, rows, tcx, tcy);
      const reliefWeight = clamp((hn - LOWLAND_OF_LAND_RANGE) / RELIEF_FADE_OF_LAND_RANGE, 0, 1);
      const rl = sampleF(relief, cols, rows, tcx, tcy);
      // Multidirectional hillshade (see `SHADE_LIGHTS`): the weighted sum of four azimuths, divided by
      // the primary's weight so a slope facing the primary keeps the shade a single-light model gave
      // it. One light left every face parallel to it flat — the grey-blob mountains.
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
      // banks, so the trace reads a large height difference there and paints the channel — and every
      // river bend's inside corner — dark. That is what drew the hard dark outlines around rivers.
      if (!isWater) {
        const sh = sampleF(shadowMap, cols, rows, tcx, tcy);
        if (sh > 0.01) {
          const a = sh * SHADOW_STRENGTH;
          r = r * (1 - a); g = g * (1 - a * 0.95); b = b * (1 - a * 0.82);
        }
      }

      // Slope edge — a sharp slope change darkens into a rim, which is what makes a ridgeline read
      // as a ridgeline rather than as a colour change. Kept off water, off beaches and along
      // riverbanks, where a rim would draw a hard line over ground meant to blend.
      const maxSlope = Math.max(Math.abs(sx), Math.abs(sy));
      if (maxSlope > RIM_SLOPE && !isWater && rd <= 0.01 && hn > BEACH_BAND_OF_LAND_RANGE) {
        const edgeStrength = clamp((maxSlope - RIM_SLOPE) * 8, 0, 1) * RIM_STRENGTH;
        r = r * (1 - edgeStrength);
        g = g * (1 - edgeStrength);
        b = b * (1 - edgeStrength);
      }

      // Season — applied inline to scalars: this runs once per pixel (4.9 M on a Medium map), where a
      // per-pixel tuple return is measurable. Vegetation-weighted, and in winter the snow settles
      // with height rather than the whole map going flat grey.
      const veg = vegetationWeight(hn, 1 - clamp(hn / BEACH_BAND_OF_LAND_RANGE, 0, 1));
      if (isWater) {
        if (season === SeasonEnum.Winter) { r += 8; g += 14; b += 24; }
        else if (season === SeasonEnum.Fall) { r += 4; g += 2; b -= 3; }
      } else if (season === SeasonEnum.Spring) {
        r -= 6 * veg; g += 16 * veg; b -= 4 * veg;
      } else if (season === SeasonEnum.Summer) {
        r += 18 * veg; g += 6 * veg; b -= 22 * veg;
      } else if (season === SeasonEnum.Fall) {
        r += 24 * veg; g -= 4 * veg; b -= 18 * veg;
      } else if (season === SeasonEnum.Winter) {
        const cover = clamp((hn - WINTER_SNOW_LINE) / (1 - WINTER_SNOW_LINE), 0, 1) * 0.8;
        const cool = 0.35 * veg + 0.15;
        r = r * (1 - cover) + SNOW_HIGH[0] * cover + 10 * cool;
        g = g * (1 - cover) + SNOW_HIGH[1] * cover + 12 * cool;
        b = b * (1 - cover) + SNOW_HIGH[2] * cover + 20 * cool;
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
