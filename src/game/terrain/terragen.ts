/**
 * Teraforge generation engine, ported for Wilderfolk.
 *
 * Runs the Teraforge pipeline (domain-warped fBm + ridged mountains, gradient-
 * walker rivers, Whittaker biomes) at 64px cells, then bakes it into Wilderfolk's
 * 10px `TerrainTile[][]` plus the additive continuous fields and the L0/L1
 * occupancy grids. Same numeric seed = identical world.
 *
 * `generateRawTerrain` intentionally does **not** clear a camp site; `terrainGen`
 * applies the camp clearing on top so the start area stays buildable.
 */
import {
  MapPreset,
  PATH_CELL,
  TerrainType,
  type TerrainDecoration,
  type WorldMap,
} from '../gameTypes';
import { computeFlow, fillDepressions, riverWidthAt } from './hydrology';
import { RAIN_SHADOW_MOISTURE_STRENGTH, rainShadowField } from './rainShadow';
import { isUnbuildableTerrainType } from './terrainTraits';
import { B, BIOME_BY_IDX, TREE_SPRITE_TYPES, type SpriteType } from './biomes';
import {
  BUILD_CELL,
  Buildability,
  TERRAIN_CELL,
  WATER_CELL,
  Walkability,
  classifyTile,
  sampleElev,
} from './terrainGrid';
import {
  clamp,
  fbm,
  hash2,
  hashString,
  lerp,
  mulberry32,
  ridged,
  ridgedMulti,
  smoothRange,
  warp,
} from './noise';

/**
 * The four-layer cell edges live in `terrainGrid` (the representation owner);
 * re-exported so the generator's importers keep one path to them.
 */
export { BUILD_CELL, TERRAIN_CELL } from './terrainGrid';

/** Global decor density multiplier (Teraforge `decorDensity` default). */
const DECOR_DENSITY = 1.2;

/**
 * Land relief contrast, expressed as percentiles of the raw height field.
 *
 * Teraforge normalises the height field by **min/max**, but the field it normalises is an fBm
 * sum — an average of octaves — so it clusters hard around its own mean. Min/max scaling then
 * stretches two outliers across the whole 0–1 range and leaves the bulk of the map inside a
 * narrow band: a measured continental map put 95 % of its land in `h ∈ [0.07, 0.32]`, where
 * `h` is the land height above sea level.
 *
 * The biome bands are absolute thresholds — `rock` starts at 75 % of the land range and `snow`
 * at 88 % — so with that distribution they were **unreachable**: the same map measured 0.1 %
 * rock and 0 % snow, and the valley rendered as an unbroken mid-tone plain with no ridgelines
 * to read at all.
 *
 * Spreading `[p0.5, p99.5]` across 0–1 restores the range the bands were designed against. It
 * is monotone (no terrain is reordered) and it is **water-preserving**: `newSeaLevel` is the
 * quantile that the old sea level sat at, so land keeps exactly the same share of the map. A
 * curve on top of min/max normalisation cannot do this — no monotone map can create range the
 * data does not have.
 */
const HEIGHT_SPREAD_LOW_PCT = 0.005;
const HEIGHT_SPREAD_HIGH_PCT = 0.995;

// The forest / dark-forest moisture cuts are derived in `moistureCuts` below, from the map's own
// distribution **and** the preset's own `forest` want — see the note there.

/**
 * Moisture field shape. `fbm` returns a mean-of-octaves, so it clusters near 0.5 within a
 * narrow band; remapping that by `* 1.06 + 0.06` (as Teraforge does) leaves almost every cell
 * between 0.49 and 0.83, which is a single climate, not a landscape: a measured map painted
 * 67 % of its land above the grass→forest cut and 0 % below the dry cut, so the arid presets
 * could never produce desert and every preset looked like one damp green field.
 *
 * `MOISTURE_SPREAD` amplifies the raw deviation into distinct wet and dry regions. The
 * warped 4-octave fBm it amplifies spans only about 0.42 → 0.65 at its quartiles (measured),
 * so the multiplier is sized against *that*, not against a 0–1 range: at 1.35 the field
 * covers roughly 0.29 → 0.77 over the 5th–95th percentile and still stops short of the clamp
 * on the wettest preset. Set to 1 for Teraforge's original narrow field.
 */
const MOISTURE_SPREAD = 1.35;
/** Field centre. `fbm`'s mean lands near 0.53 for this call (measured), so this is set below
 *  it to keep the land split between dry and wet regions rather than parked on the wet side. */
const MOISTURE_BASE = 0.42;
/** Drier ground with altitude, in moisture units per unit of elevation above sea level. */
const MOISTURE_ALTITUDE_PENALTY = 0.28;

/**
 * Latitude → biome parameterization.
 *
 * The map's **y axis is its latitude**, so the terrain is a pole-to-pole slice with the equator
 * on the map's middle row. This is the parameterization the paper uses to make biome placement
 * follow position rather than one per-map climate: the temperature offset is a **triangular
 * wave** — 0 at the equator, 1 at both poles — so the cool zones are symmetric about the middle
 * and every row's offset is a pure function of `row` and `rows`.
 *
 * Two properties matter. It is **additive**: latitude cools the air and never warms it, so the
 * equator row keeps exactly the temperature the preset was tuned for and a world is still
 * recognisably `arabia` or `scandinavia` rather than being shifted wholesale toward one pole.
 * And the **span** is the parameter: a wide span puts cold ground inside the map, a narrow one
 * keeps the whole map in one climate.
 *
 * The band edge is offset by coherent noise before it is read, for the reason the paper gives for
 * adding detail to otherwise smooth cell borders: a raw triangular wave draws perfectly straight
 * horizontal climate lines, which read as an artefact rather than a landscape. `hash2` is used
 * rather than a value-noise lattice so the offset has no lattice of its own to show through.
 *
 * **Not ported:** the paper's wrapping `mod(2S)` zone cycle (its infinite terrain has no pole, so
 * it revisits the same zones after the last one). Wilderfolk's maps are finite and bounded by
 * design — `WorldMap` is an explicit `width` × `height`, and `buildHeight` already fades an
 * island preset at the edge — so there is no "last zone" to wrap from, and a map that ended
 * tropical immediately after an arctic band would be the artefact the paper's own §5 warns about.
 */
/** Softness of the equator→pole transition: a triangular wave raised to this power, so the warm
 *  tropical band is wide and the cold bands widen across the middle latitudes. */
const LATITUDE_TAPER_POWER = 1.6;
/** Wavelength (in cells) of the noise that drifts the climate-band edge off a straight line —
 *  large enough to read as a wandering border rather than per-cell speckle. */
const LATITUDE_EDGE_FREQ = 0.03;
/** Independent noise stream for that edge. */
const LATITUDE_SEED_OFFSET = 15331;

/**
 * Latitude cooling at cell (`x`, `y`) of a `rows`-tall grid, in temperature units and always ≥ 0.
 *
 * `span` — the pole-to-equator drop — is **per preset**, because these presets are Age of Empires II
 * map archetypes and an AoE2 map is a **region**, not a hemisphere. Arabia is open semi-arid land,
 * Oasis is desert with a pool, Black Forest is a temperate tree wall: none of them has a cold rim,
 * because none of them is a pole-to-pole slice of a planet. One global span put cold edges on every
 * map, which is what grew tundra on `arabia` and turned `meadows` — a "flat European lowland" — into
 * 26 % taiga. Not every preset should contain every biome; the span says which ones vary with latitude
 * and which are one climate throughout.
 */
function latitudeCooling(x: number, y: number, rows: number, seed: number, span: number): number {
  if (span <= 0) return 0;
  // Pure function of the row, the dimensions and the seed, so it needs no stored field and two
  // maps of the same size and seed get identical climates.
  const ySpan = Math.max(1, (rows - 1) / 2);
  const edge = clamp(Math.abs(y - (rows - 1) / 2) / ySpan, 0, 1);
  const tri = Math.pow(edge, LATITUDE_TAPER_POWER);
  const wobble = (hash2(x, y, seed + LATITUDE_SEED_OFFSET) - 0.5) * 2;
  return clamp(tri + wobble * LATITUDE_EDGE_FREQ, 0, 1) * span;
}

/** Raw [0,1] heights → `spread` × [0,1], water line mapped to its own quantile. */
function spreadHeights(raw: Float32Array, seaLevel: number): { heights: Float32Array; seaLevel: number } {
  const sorted = Float32Array.from(raw).sort();
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
  const low = at(HEIGHT_SPREAD_LOW_PCT);
  const high = at(HEIGHT_SPREAD_HIGH_PCT);
  const span = high - low;
  if (!(span > 1e-6)) return { heights: raw, seaLevel };

  // Map the whole line through the same affine transform, so the sea level keeps its quantile
  // and so does every water cell below it.
  const scale = 1 / span;
  const heights = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) heights[i] = (raw[i] - low) * scale;
  return { heights, seaLevel: (seaLevel - low) * scale };
}

/**
 * The two biome cuts for a finished moisture field — from that map's own distribution **and the
 * preset's own forest want**.
 *
 * The cuts used to be two fixed quantiles (0.58 / 0.86) on *every* map, which forced one composition
 * on all ten presets: `arabia` (hot, semi-arid) and `oasis` (desert with a pool) each grew a third to
 * a half of their tiles as forest, and every map carried the same canopy share whatever its climate.
 * Meanwhile the L2 biome field, which reads the preset's `forest` directly, called the very same maps
 * `dirt 54 % / desert 36 %` — two classifiers disagreeing about the same ground. An AoE2 archetype is
 * the opposite of one-shape-fits-all: Arabia is open desert, Black Forest is a wall of trees, and
 * neither should contain the other.
 *
 * Which quantile is used still comes from the map's own moisture distribution, because an absolute
 * cut cannot work — the field runs 0.47 at p50 on one preset and 0.73 on the next, so a fixed number
 * paints one map solid grass and the next solid canopy. What follows the preset is **which** quantile:
 * `forest: 0.15` (oasis) means only the wettest ~17 % of the map can be woodland, `forest: 0.98`
 * (black forest) means all but the driest 5 % can.
 */
const MOISTURE_FOREST_QUANTILE_MIN = 0.05;
const MOISTURE_FOREST_QUANTILE_MAX = 0.97;
/** Where dark forest starts, as a share of the moisture range left above the forest cut. */
const MOISTURE_DARK_FOREST_SHARE = 0.55;

function moistureCuts(
  field: Float32Array,
  forestWant: number,
): { forest: number; darkForest: number } {
  const sorted = Float32Array.from(field).sort();
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
  const q = lerp(
    MOISTURE_FOREST_QUANTILE_MAX,
    MOISTURE_FOREST_QUANTILE_MIN,
    clamp(forestWant, 0, 1),
  );
  const forest = at(q);
  const darkForest = Math.max(forest + 0.04, at(q + (1 - q) * MOISTURE_DARK_FOREST_SHARE));
  return { forest, darkForest };
}

/** L0 path grid: only water blocks walking — land is climbable, however high. */
const PATH_WATER = new Set<TerrainType>([TerrainType.DeepWater, TerrainType.ShallowWater, TerrainType.River]);

/**
 * Per-preset Teraforge tuning — one fixed landscape recipe per Wilderfolk preset.
 *
 * `temperature` is the **equator's** air temperature, which is what the latitude parameterization
 * made it mean: `latitudeCooling` subtracts from this and never adds, so the middle row reads
 * exactly this value and both edges are colder. That makes it the knob that decides whether a
 * preset has any zonation at all, and it has to clear `COLD_TEMPERATURE` (0.3) *after* the
 * elevation penalty of 0.7 per unit above sea level — otherwise the classifier calls the entire
 * map cold, `classifyTile` returns dark forest in every direction, and latitude has no warm core
 * left to contrast against.
 *
 * Measured against that rule: `scandinavia` was tuned to 0.18 when temperature was a uniform
 * per-map constant, which put its whole map below the threshold (0 % grass, 0 % forest, 29–41 %
 * dark forest, and latitude changed nothing). The cool presets are therefore raised so their
 * equator is genuinely temperate — a boreal `scandinavia` keeps its cold character from the
 * latitude bands and its own `moisture`, not from being frozen at every row.
 */
interface TerrainSettings {
  seaLevel: number;
  mountains: number;
  roughness: number;
  moisture: number;
  temperature: number;
  /**
   * Pole-to-equator temperature drop for this preset, in temperature units. **0 means one climate
   * across the whole map** — which is what an AoE2 regional archetype wants — and is the default
   * intent; a positive value gives the map latitude zones. See {@link latitudeCooling}.
   */
  latitude: number;
  rivers: number;
  riverWidth: number;
  lakes: number;
  forest: number;
  islands: number;
}

const PRESET_SETTINGS: Record<MapPreset, TerrainSettings> = {
  // `latitude: 0` on every regional archetype. Arabia is open semi-arid land and Oasis is desert —
  // both are meant to be one climate edge to edge, so they take the whole map at the preset's own
  // temperature instead of freezing at their north and south rim.
  // `forest` is now the composition knob it reads as: it sets which moisture quantile becomes woodland,
  // so Arabia (desert, sparse woodlines) and Oasis (desert with a pool) are authored low rather than
  // inheriting a canopy share from every other map.
  arabia:       { seaLevel: 0.15, mountains: 0.15, roughness: 0.35, moisture: -0.12, temperature: 0.82, latitude: 0,   rivers: 1, riverWidth: 1.2, lakes: 0.1,  forest: 0.08, islands: 0 },
  black_forest: { seaLevel: 0.18, mountains: 0.3,  roughness: 0.45, moisture: 0.28,  temperature: 0.66, latitude: 0,   rivers: 2, riverWidth: 1.3, lakes: 0.2,  forest: 0.98, islands: 0 },
  coastal:      { seaLevel: 0.38, mountains: 0.4,  roughness: 0.45, moisture: 0.1,   temperature: 0.7,  latitude: 0,   rivers: 3, riverWidth: 1.5, lakes: 0.25, forest: 0.55, islands: 0.5 },
  islands:      { seaLevel: 0.52, mountains: 0.35, roughness: 0.35, moisture: 0.2,   temperature: 0.8,  latitude: 0,   rivers: 1, riverWidth: 1,   lakes: 0.15, forest: 0.6,  islands: 0.95 },
  highland:     { seaLevel: 0.2,  mountains: 0.7,  roughness: 0.6,  moisture: 0.12,  temperature: 0.62, latitude: 0,   rivers: 4, riverWidth: 1.8, lakes: 0.4,  forest: 0.6,  islands: 0 },
  // The two presets that *are* about a wide climate, and so the only two that keep a gradient:
  // `scandinavia` is the cold Nordic map, `continental` is the deliberately mixed one.
  scandinavia:  { seaLevel: 0.32, mountains: 0.5,  roughness: 0.5,  moisture: 0.15,  temperature: 0.56, latitude: 0.3, rivers: 3, riverWidth: 1.5, lakes: 0.55, forest: 0.6,  islands: 0.25 },
  meadows:      { seaLevel: 0.18, mountains: 0.1,  roughness: 0.25, moisture: 0.2,   temperature: 0.68, latitude: 0,   rivers: 4, riverWidth: 2.2, lakes: 0.45, forest: 0.4,  islands: 0 },
  oasis:        { seaLevel: 0.15, mountains: 0.25, roughness: 0.3,  moisture: -0.28, temperature: 0.92, latitude: 0,   rivers: 0, riverWidth: 1,   lakes: 0.35, forest: 0.06, islands: 0 },
  rivers:       { seaLevel: 0.2,  mountains: 0.3,  roughness: 0.4,  moisture: 0.15,  temperature: 0.64, latitude: 0,   rivers: 6, riverWidth: 2.5, lakes: 0.3,  forest: 0.55, islands: 0 },
  continental:  { seaLevel: 0.28, mountains: 0.5,  roughness: 0.55, moisture: -0.02, temperature: 0.7,  latitude: 0.3, rivers: 3, riverWidth: 1.8, lakes: 0.3,  forest: 0.5,  islands: 0.15 },
};

const idx = (x: number, y: number, w: number) => y * w + x;

/* ===== Height ===== */

function buildHeight(s: TerrainSettings, seed: number, cols: number, rows: number): Float32Array {
  const elevation = new Float32Array(cols * rows);
  const scale = lerp(0.06, 0.018, s.roughness);
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  const maxR = Math.max(cx, cy);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const [wx, wy] = warp(x * scale, y * scale, seed, 1.15, 0.55);
      let e = fbm(wx, wy, seed, { octaves: 7, gain: 0.5 });
      const cont = fbm(x * scale * 0.35, y * scale * 0.35, seed + 4211, { octaves: 3 });
      e = e * 0.5 + cont * 0.5;

      // mountain belts
      const belt = fbm(x * scale * 0.42 + 31.7, y * scale * 0.42 - 12.4, seed + 8821, { octaves: 3 });
      const mask = smoothRange(0.62 - s.mountains * 0.38, 0.9 - s.mountains * 0.3, belt);
      if (mask > 0.001) {
        const r = ridged(wx * 1.35, wy * 1.35, seed + 3301, { octaves: 5 });
        e += mask * r * (0.35 + s.mountains * 0.65);
        const r2 = ridgedMulti(wx * 2.5, wy * 2.5, seed + 6601, 3, 0.4);
        const ridgeDetail = Math.max(0, (e - s.seaLevel) * 2);
        e += r2 * 0.05 * s.mountains * Math.min(1, ridgeDetail);
      }

      // second belt — perpendicular orientation so ranges connect into chains
      const belt2 = fbm(x * scale * 0.42 - 12.4, y * scale * 0.42 + 31.7, seed + 9923, { octaves: 3 });
      const mask2 = smoothRange(0.68 - s.mountains * 0.42, 0.94 - s.mountains * 0.3, belt2);
      if (mask2 > 0.001) {
        const r2b = ridged(wx * 1.5, wy * 1.5, seed + 4451, { octaves: 5 });
        e += mask2 * r2b * (0.25 + s.mountains * 0.5);
      }

      // island falloff: 0=continental, 1=island
      if (s.islands > 0.01) {
        const dx = (x - cx) / maxR, dy = (y - cy) / maxR;
        const d = Math.sqrt(dx * dx + dy * dy);
        const falloff = smoothRange(1.22, 0.55, d);
        e = lerp(e, e * falloff, s.islands);
        const edgeFalloff = smoothRange(1.1, 0.5, d); e *= (1 - s.islands * 0.3 * edgeFalloff);
      }

      // lakes
      if (s.lakes > 0) {
        const lk = fbm(x * scale * 1.6 - 55.2, y * scale * 1.6 + 18.6, seed + 6199, { octaves: 4 });
        e -= smoothRange(0.74, 0.94, lk) * s.lakes * 0.28;
      }
      elevation[idx(x, y, cols)] = e;
    }
  }

  // normalise 0-1
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < elevation.length; i++) {
    if (elevation[i] < mn) mn = elevation[i];
    if (elevation[i] > mx) mx = elevation[i];
  }
  const inv = 1 / Math.max(1e-6, mx - mn);
  for (let i = 0; i < elevation.length; i++) elevation[i] = (elevation[i] - mn) * inv;

  // If lakes are low, lift the floor so no terrain falls below sea level.
  if (s.lakes < 0.15) {
    const floor = s.seaLevel * (1 - s.lakes / 0.15);
    for (let i = 0; i < elevation.length; i++) {
      if (elevation[i] < floor) elevation[i] = floor + (elevation[i] / Math.max(floor, 0.01)) * 0.02;
    }
  }

  // smooth
  const sm = Float32Array.from(elevation);
  for (let y = 1; y < rows - 1; y++)
    for (let x = 1; x < cols - 1; x++) {
      let sum = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += elevation[idx(x + i, y + j, cols)];
      sm[idx(x, y, cols)] = elevation[idx(x, y, cols)] * 0.4 + (sum / 9) * 0.6;
    }
  return sm;
}

/* ===== Rivers ===== */

interface RiverPoint { x: number; y: number; w: number; }
interface Waterfall { x: number; y: number; w: number; drop: number; }

/**
 * Channel geometry. The width law itself lives in `hydrology.riverWidthAt` (the paper's `A → φ → w`
 * chain); these are the depth and bank profile constants the carve adds on top of it.
 */
/** Channel depth as a fraction of its width, and the floor/ceiling on the incision in elevation units. */
const CHANNEL_DEPTH_OF_WIDTH = 0.09;
const CHANNEL_DEPTH_MIN = 0.012;
const CHANNEL_DEPTH_MAX = 0.09;
/** How far the banks run out from the channel edge, in channel half-widths. */
const BANK_RUN_OF_WIDTH = 3.2;
/**
 * How much of the channel's depth the bank is allowed to take, at the channel edge, before the profile
 * fades to nothing at {@link BANK_RUN_OF_WIDTH}.
 *
 * **The paper's crest term is not used here, deliberately.** Its `q_z = max(a_z, b_z, c_z) + λ·d` (§5.1)
 * *generates* ground that rises away from a river at a slope λ. Applied as an upper bound on ground that
 * already exists, the same formula cuts a bench into any hillside the river crosses: at λ = 0.22 a cell
 * two cells from the channel is forced down to bed + 0.44, and the cut widens with distance. Measured, it
 * smeared a wide flat valley across every ridge a river touched. The channel is carved to a depth that
 * scales with the river's own width, and the bank takes a decreasing share of that depth instead — so the
 * incision is bounded by the channel, and the hill's own relief survives.
 */
const BANK_INCISION_OF_DEPTH = 0.55;
function carveRivers(
  s: TerrainSettings, seed: number, cols: number, rows: number,
  elevation: Float32Array, seaLevel: number,
): { paths: RiverPoint[][]; waterfalls: Waterfall[] } {
  const paths: RiverPoint[][] = [];
  const waterfalls: Waterfall[] = [];

  if (s.rivers <= 0) return { paths, waterfalls };

  // Route the water first, then walk the network: two rivers meet where their catchments meet instead
  // of crossing each other, because the route is the drainage field and not a gradient guess.
  const filled = fillDepressions(elevation, cols, rows);
  const { downstream, accumulation } = computeFlow(filled, cols, rows);
  let maxAccumulation = 1;
  for (let i = 0; i < accumulation.length; i++) if (accumulation[i] > maxAccumulation) maxAccumulation = accumulation[i];

  // **Which cells a river follows is decided by drainage, not by scattering springs.** The network
  // still comes from `computeFlow` — that part was always hydrological — but the *selection* was the
  // bug: N springs were picked for being far apart and each was walked downhill, so a map grew N short
  // disconnected squiggles that never joined and often never reached the sea.
  //
  // Three things have to be right together, and getting any one wrong is why this is not a one-liner:
  // a candidate must be a genuine **headwater** (rank by drainage area alone picks the map's *outlet*,
  // whose walk is one cell long), the walk must then run **downhill** from it to the sea, and the cells
  // it claims must stop later candidates from redrawing the same channel — which is what makes the
  // result one trunk with tributaries.
  const upstreamOf = new Int32Array(cols * rows).fill(-1);
  for (let i = 0; i < downstream.length; i++) {
    const d = downstream[i]!;
    if (d < 0) continue;
    const best = upstreamOf[d]!;
    if (best < 0 || accumulation[i]! > accumulation[best]!) upstreamOf[d] = i;
  }

  /** Follow the chain up until no cell drains in above — the top of the strand this cell sits on. */
  const headwaterOf = (from: number): number => {
    let cell = from;
    for (let step = 0; step < cols * rows; step++) {
      const up = upstreamOf[cell]!;
      if (up < 0) break;
      cell = up;
    }
    return cell;
  };

  /** Length of the downhill chain from `from` to the sea, in cells — the river a headwater would make. */
  const chainLength = (from: number): number => {
    let cell = from, steps = 0;
    for (; steps < cols * rows; steps++) {
      const next = downstream[cell]!;
      if (next < 0) break;
      if (Math.max(elevation[cell]!, seaLevel) <= seaLevel + 0.003) break;
      cell = next;
    }
    return steps;
  };

  /**
   * Whether the chain from `from` actually **reaches water**.
   *
   * This is the check whose absence drew rivers that stop dead on dry land: the drainage network
   * terminates at the map border, and the border is not automatically coast — a chain that walks off
   * the edge onto elevated ground has not reached the sea, and painting it as a river is what left the
   * channel ending in a field. So a candidate only counts when its chain ends in water: below sea
   * level, or on the border with the water level that lets it leave the map.
   */
  const reachesSea = (from: number): boolean => {
    let cell = from;
    for (let step = 0; step < cols * rows; step++) {
      const next = downstream[cell]!;
      if (next < 0) {
        const x = cell % cols, y = (cell / cols) | 0;
        const border = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
        return border && elevation[cell]! <= seaLevel + 0.02;
      }
      if (Math.max(elevation[cell]!, seaLevel) <= seaLevel + 0.003) return true;
      cell = next;
    }
    return false;
  };

  // Rank the **headwaters**, not every land cell, by the length of the river each one feeds — and
  // only those whose river reaches water.
  const sources: { head: number; length: number }[] = [];
  for (let i = 0; i < upstreamOf.length; i++) {
    if (upstreamOf[i]! >= 0) continue;              // not a headwater
    if (filled[i]! <= seaLevel + 0.02) continue;    // under the surface: nothing to drain
    const head = headwaterOf(i);
    if (sources.length > 0 && sources[sources.length - 1]!.head === head) continue;
    if (!reachesSea(head)) continue;
    sources.push({ head, length: chainLength(head) });
  }
  sources.sort((a, b) => (b.length - a.length) || (a.head - b.head));

  const claimed = new Uint8Array(cols * rows);
  for (let r = 0; r < sources.length && paths.length < s.rivers; r++) {
    if (claimed[sources[r]!.head]) continue;
    const meanderSeed = seed + r * 977;
    const path: RiverPoint[] = [];
    let cell = sources[r]!.head;

    // Follow the drainage network. Every step moves to a strictly lower cell, so the walk cannot loop
    // and does not need the old stagnation bail-out; it ends at the sea, at an outlet, or at a pit the
    // flood could not resolve.
    for (let step = 0; step < cols * rows; step++) {
      const x = cell % cols;
      const y = (cell / cols) | 0;
      const surface = Math.max(elevation[cell], seaLevel);
      // Meander: the network gives the route, the noise gives the windings inside it.
      const m = fbm(x * 0.14, y * 0.14, meanderSeed, { octaves: 3 }) - 0.5;
      const m2 = fbm(x * 0.05 + 20, y * 0.05 - 9, meanderSeed + 51, { octaves: 2 }) - 0.5;
      const meander = (m * 1.8 + m2 * 1.2) * 0.45;
      // Width from the land that drains through this point, not from how far along the path it is.
      const catchment = Math.min(1, accumulation[cell] / maxAccumulation);
      const width = riverWidthAt(s.riverWidth, catchment) * (0.9 + fbm(x * 0.1, y * 0.1, meanderSeed + 7) * 0.2);
      path.push({
        x: x + 0.5 + Math.cos(meander * Math.PI) * 0.35,
        y: y + 0.5 + Math.sin(meander * Math.PI) * 0.35,
        w: width,
      });
      claimed[cell] = 1;

      const next = downstream[cell];
      if (next < 0) break;
      if (surface <= seaLevel + 0.003) break;
      // Reached an already-carved channel: this branch joins the trunk here.
      if (claimed[next]) break;
      cell = next;
    }

    if (path.length < 10) continue;
    paths.push(path);

    // Detect waterfalls — steep drops between consecutive path points
    for (let pi = 1; pi < path.length; pi++) {
      const prev = path[pi - 1], cur = path[pi];
      const ePrev = sampleElev(elevation, cols, rows, prev.x, prev.y);
      const eCur = sampleElev(elevation, cols, rows, cur.x, cur.y);
      const drop = ePrev - eCur;
      if (drop > 0.04) {
        waterfalls.push({ x: cur.x * TERRAIN_CELL, y: cur.y * TERRAIN_CELL, w: cur.w * TERRAIN_CELL * 0.5, drop });
      }
    }

    // Cut the channel into the height field only. The *water mask* is built separately at a
    // finer resolution (see `buildWaterField`), so that a river edge is not quantised to this
    // coarse biome lattice.
    //
    // The cross-section is the paper's river primitive: `h(p) = u_z(p) + δ(d(p))`, the *projection's*
    // own elevation plus a profile across the channel, placed onto the terrain with the replace operator
    // (`h = (1 - w_B)·h_A + w_B·h_B`, §7) whose weight has compact support. Two things follow that the
    // old carve got wrong. The bed sits below **this river's** surface, not below sea level — a mountain
    // stream used to be cut to sea level, a canyon through a hillside — and the banks run out to the
    // terrain instead of stopping at a ring, because the weight reaches zero smoothly. That ring and
    // that flat plate are what made every river edge a terrace on the coarse lattice.
    for (const p of path) {
      const bedSurface = sampleElev(elevation, cols, rows, p.x, p.y);
      const halfWidth = p.w;
      if (halfWidth <= 0) continue;
      const depth = clamp(halfWidth * CHANNEL_DEPTH_OF_WIDTH * TERRAIN_CELL, CHANNEL_DEPTH_MIN, CHANNEL_DEPTH_MAX);
      const bed = Math.max(seaLevel - 0.01, bedSurface - depth);
      const run = halfWidth * BANK_RUN_OF_WIDTH;
      const x0 = Math.max(0, Math.floor(p.x - run - 1));
      const x1 = Math.min(cols - 1, Math.ceil(p.x + run + 1));
      const y0 = Math.max(0, Math.floor(p.y - run - 1));
      const y1 = Math.min(rows - 1, Math.ceil(p.y + run + 1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
          if (d > run) continue;
          const i = idx(x, y, cols);
          if (d <= halfWidth) {
            // Channel: blend toward the bed with the paper's compact-support weight, so the bed is flat
            // at the centre and meets the banks with no step.
            const t = 1 - (d * d) / (halfWidth * halfWidth);
            const weight = t * t;
            elevation[i] = Math.min(elevation[i], elevation[i] * (1 - weight) + bed * weight);
          } else {
            // Banks: the channel profile fades out over the run, and the bank gives up a **bounded** share
            // of the channel's depth — never more. Blending toward the bed instead pulls a bank cell all
            // the way down to a bed that sits far below an uphill bank, which cuts a bench as wide as the
            // run into every slope a river crosses; measured, that swallowed ridgelines and even starved
            // the tiles a farm fixture relies on. A bounded subtraction leaves the hill's own relief as the
            // valley wall.
            const t = 1 - (d - halfWidth) / (run - halfWidth);
            const weight = t * t;
            const carved = elevation[i] - depth * BANK_INCISION_OF_DEPTH * weight;
            elevation[i] = Math.max(bed, Math.min(elevation[i], carved));
          }
        }
      }
    }
  }
  return { paths, waterfalls };
}

/**
 * Rasterise the water layer at {@link WATER_CELL}, onto its own lattice.
 *
 * `rivers` carry widths in 64 px biome-cell units, so they are converted to world pixels here
 * and the falloff is computed in world space. The result is a **coverage** value per fine cell — the
 * field the tile projection, the biome pass and the per-pixel bake all read, so the waterline is
 * smooth at 16 px while the climate below it stays at 64 px. It is not a distance: 1 is the centre of
 * a channel and 0 is dry, which is why nothing here takes a square root of it.
 */
function buildWaterField(
  rivers: RiverPoint[][], cols: number, rows: number,
): { coverage: Float32Array; wCols: number; wRows: number } {
  const cell = WATER_CELL;
  const wCols = Math.ceil((cols * TERRAIN_CELL) / cell);
  const wRows = Math.ceil((rows * TERRAIN_CELL) / cell);
  const coverage = new Float32Array(wCols * wRows);

  for (const path of rivers) {
    for (const p of path) {
      const cx = p.x * TERRAIN_CELL;
      const cy = p.y * TERRAIN_CELL;
      const rad = (p.w + 0.5) * TERRAIN_CELL;
      const x0 = Math.max(0, Math.floor((cx - rad) / cell));
      const x1 = Math.min(wCols - 1, Math.ceil((cx + rad) / cell));
      const y0 = Math.max(0, Math.floor((cy - rad) / cell));
      const y1 = Math.min(wRows - 1, Math.ceil((cy + rad) / cell));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const wx = x * cell + cell / 2;
          const wy = y * cell + cell / 2;
          const d = Math.hypot(wx - cx, wy - cy);
          const strength = clamp(1 - d / (rad + cell), 0, 1);
          const i = y * wCols + x;
          if (strength > coverage[i]) coverage[i] = strength;
        }
      }
    }
  }
  return { coverage, wCols, wRows };
}

/** Flag the coarse biome cells a river crosses, by sampling the fine water coverage field. */
function flagRiverCells(
  wCoverage: Float32Array, wCols: number, wRows: number, cols: number, rows: number,
): Uint8Array {
  const flag = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wx = (x + 0.5) * TERRAIN_CELL;
      const wy = (y + 0.5) * TERRAIN_CELL;
      const cx = clamp(Math.floor(wx / WATER_CELL), 0, wCols - 1);
      const cy = clamp(Math.floor(wy / WATER_CELL), 0, wRows - 1);
      const v = wCoverage[cy * wCols + cx];
      if (v > 0.55) flag[y * cols + x] = 1;
      else if (v > 0.12) flag[y * cols + x] = 2;
    }
  }
  return flag;
}

/* ===== Biomes (64px cells, 15 Teraforge biomes) ===== */

function assignBiomes(
  s: TerrainSettings, cols: number, rows: number,
  elevation: Float32Array, moisture: Float32Array,
  temperature: Float32Array, riverFlag: Uint8Array, seaLevel: number,
): Uint8Array {
  const terrain = new Uint8Array(cols * rows);
  const landRange = 1 - seaLevel;
  const beachTop = seaLevel + 0.04 * landRange;
  const lowTop = seaLevel + 0.25 * landRange;
  const midTop = seaLevel + lerp(0.55, 0.75, 1 - s.mountains * 0.35) * landRange;
  const highTop = seaLevel + lerp(0.72, 0.88, 1 - s.mountains * 0.3) * landRange;
  const forestT = lerp(0.68, 0.35, s.forest);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = idx(x, y, cols);
      const e = elevation[i];
      const mo = clamp(moisture[i] + s.moisture, 0, 1);
      const te = clamp(temperature[i], 0, 1);

      // The *shallow-water* arm reads the fine water field, not the coarse flag, so a river's
      // surface is the same smooth curve here as it is in the renderer.
      if (e < seaLevel - 0.09) { terrain[i] = B.deep_water; continue; }
      if (e < seaLevel) { terrain[i] = B.water; continue; }
      if (e < beachTop) { terrain[i] = (riverFlag[i] === 2 && mo > 0.6) ? B.swamp : B.sand; continue; }

      if (e < lowTop) {
        if (riverFlag[i] === 2) { terrain[i] = mo > 0.5 ? B.swamp : B.meadow; continue; }
        if (te > 0.6 && mo < 0.35) { terrain[i] = B.desert; continue; }
        if (mo < 0.25) { terrain[i] = B.dirt; continue; }
        terrain[i] = mo > forestT ? B.meadow : B.grass;
        continue;
      }

      if (e < midTop) {
        if (te < 0.25) { terrain[i] = B.taiga; continue; }
        if (te > 0.65 && mo < 0.28) { terrain[i] = B.desert; continue; }
        if (mo > forestT + 0.12) terrain[i] = B.dense_forest;
        else if (mo > forestT - 0.1) terrain[i] = B.forest;
        else if (mo > 0.2) terrain[i] = B.grass;
        else terrain[i] = B.dirt;
        continue;
      }

      if (e < highTop) { terrain[i] = te < 0.3 ? B.tundra : B.rock; continue; }
      if (e < highTop + 0.12) { terrain[i] = B.rock; continue; }
      terrain[i] = B.snow;
    }
  }

  // De-speckle (2 passes)
  const out = Uint8Array.from(terrain);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? terrain : Uint8Array.from(out);
    for (let y = 1; y < rows - 1; y++)
      for (let x = 1; x < cols - 1; x++) {
        const i = idx(x, y, cols);
        const self = src[i];
        // No river guard here: `B.river` is never assigned by this function — water is `deep_water`
        // and `water`, and a river is the `riverDist` field, not a biome label — so the guard this
        // loop used to carry could not fire.
        const counts = new Map<number, number>();
        for (let j = -1; j <= 1; j++)
          for (let k = -1; k <= 1; k++) {
            if (!j && !k) continue;
            counts.set(src[idx(x + k, y + j, cols)], (counts.get(src[idx(x + k, y + j, cols)]) ?? 0) + 1);
          }
        const same = counts.get(self) ?? 0;
        if (same <= 1) {
          let best = self, bestN = 0;
          counts.forEach((n, v) => { if (n > bestN) { bestN = n; best = v; } });
          if (bestN >= 4) out[i] = best;
        }
      }
  }
  return out;
}

/* ===== L3 decorations ===== */

function pickDecor(table: [SpriteType, number][], r: number): SpriteType {
  let total = 0;
  for (const [, w] of table) total += w;
  let v = r * total;
  for (const [t, w] of table) { v -= w; if (v <= 0) return t; }
  return table[table.length - 1][0];
}

/** Biome-density + clump-noise decor placement (Teraforge), trees excluded. */
function placeDecorations(
  seed: number, cols: number, rows: number,
  terrain: Uint8Array, pathGrid: Uint8Array, pCols: number, pRows: number,
): TerrainDecoration[] {
  const rand = mulberry32(seed ^ 0x2b7c19);
  const decorations: TerrainDecoration[] = [];

  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const def = BIOME_BY_IDX[terrain[idx(x, y, cols)]];
      if (!def.decor.length) continue;
      const clumpNoise = fbm(x * 0.17, y * 0.17, seed + 1777, { octaves: 3 });
      const count = def.density * DECOR_DENSITY * (0.35 + clumpNoise * 1.5);
      let n = Math.floor(count);
      if (rand() < count - n) n++;

      for (let k = 0; k < n; k++) {
        const px = (x + 0.1 + rand() * 0.8) * TERRAIN_CELL;
        const py = (y + 0.1 + rand() * 0.8) * TERRAIN_CELL;
        const gx = Math.min(pCols - 1, Math.floor(px / PATH_CELL));
        const gy = Math.min(pRows - 1, Math.floor(py / PATH_CELL));
        const pi = gy * pCols + gx;
        if (pathGrid[pi] !== 0) continue;

        const type = pickDecor(def.decor, rand());
        if (TREE_SPRITE_TYPES.has(type)) continue; // trees are Wilderfolk entities

        decorations.push({
          x: px, y: py, type,
          scale: 0.55 + rand() * 0.5 + (type === 'rock_big' ? 0.25 : 0),
          variant: Math.floor(rand() * 1000),
          flipX: rand() > 0.5,
          tint: (hash2(gx, gy, seed) - 0.5) * 2,
        });
        if (type === 'rock_big') pathGrid[pi] = 2;
      }
    }
  return decorations;
}

/* ===== Public API ===== */

export function generateRawTerrain(
  width: number,
  height: number,
  seed: number,
  size: WorldMap['size'],
  preset: WorldMap['preset'],
): WorldMap {
  const s = PRESET_SETTINGS[preset];
  const tseed = hashString(String(seed));

  const tileW = Math.ceil(width / 10);
  const tileH = Math.ceil(height / 10);
  const cols = Math.ceil(width / TERRAIN_CELL);
  const rows = Math.ceil(height / TERRAIN_CELL);

  const rawElevation = buildHeight(s, tseed, cols, rows);

  // Minimum sea level when lakes are requested but sea level is ~0.
  const configuredSeaLevel = (s.lakes > 0.05 && s.seaLevel < 0.08)
    ? Math.max(s.seaLevel, 0.05 + s.lakes * 0.1)
    : s.seaLevel;

  // Spread the height field before anything reads it, so the biome bands, the river
  // gradient walk and the rendered hillshade all see the same relief.
  const { heights: elevation, seaLevel } = spreadHeights(rawElevation, configuredSeaLevel);

  const moisture = new Float32Array(cols * rows);
  const temperature = new Float32Array(cols * rows);
  const mScale = lerp(0.05, 0.02, s.roughness);
  // Terrain-derived dryness: ground downwind of high ground is shaded from the rain. Computed from the
  // finished height field, once, and read by the moisture pass below.
  const rainShadow = rainShadowField(elevation, cols, rows);

  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = idx(x, y, cols);
      const [wx, wy] = warp(x * mScale, y * mScale, tseed + 991, 0.9, 0.5);
      // `s.moisture` is the preset's climate bias — the desert presets are dry and the forest
      // presets wet. It was carried on the map as `moistureBias` for the renderer but never
      // reached this field, so every preset generated the same damp climate and the arid
      // presets could not produce desert at all (`te > 0.6 && mo < 0.35` was unreachable).
      //
      // `MOISTURE_SPREAD` widens the fBm mean (which clusters near 0.5) into real wet and dry
      // regions, and `MOISTURE_ALTITUDE_PENALTY` keeps high ground drier than the valleys
      // below it — together they are what give one map a gradient instead of a single climate.
      //
      // `rainShadow` is the *directional* half of that: the altitude penalty dries both flanks of a
      // range equally, so a range had no wet side; the shadow dries the leeward flank only, which is
      // where a range's dry interior comes from (`terrain/rainShadow.ts`).
      let mo = fbm(wx, wy, tseed + 2503, { octaves: 4 });
      mo = clamp(
        MOISTURE_BASE + (mo - 0.5) * MOISTURE_SPREAD + s.moisture
          - Math.max(0, elevation[i] - seaLevel) * MOISTURE_ALTITUDE_PENALTY
          - rainShadow[i] * RAIN_SHADOW_MOISTURE_STRENGTH,
        0,
        1,
      );
      moisture[i] = mo;
      // `s.temperature` keeps its long-standing `× 1.1` amplifier, and latitude is removed
      // *before* it so the equator row is exactly the temperature this preset had before the
      // parameterization existed. Applying the anchor after the amplifier instead would push
      // every warm preset past the `clamp` and leave the hot half of the map a flat 1.0.
      const t = (s.temperature - latitudeCooling(x, y, rows, tseed, s.latitude)) * 1.1
        - Math.max(0, elevation[i] - seaLevel) * 0.7
        + (fbm(x * mScale * 0.7, y * mScale * 0.7, tseed + 7331, { octaves: 3 }) - 0.5) * 0.3;
      temperature[i] = clamp(t, 0, 1);
    }

  const { paths: rivers, waterfalls } = carveRivers(s, tseed, cols, rows, elevation, seaLevel);

  // The water layer lives on its own, finer lattice. Everything downstream that cares about
  // *where the water is* reads this field; the coarse `riverFlag` below only decides which
  // biome cells the river turns to swamp and meadow.
  const { coverage: riverDist, wCols, wRows } = buildWaterField(rivers, cols, rows);
  const riverFlag = flagRiverCells(riverDist, wCols, wRows, cols, rows);

  for (let i = 0; i < riverFlag.length; i++)
    if (riverFlag[i]) moisture[i] = clamp(moisture[i] + 0.2, 0, 1);

  const terrain = assignBiomes(s, cols, rows, elevation, moisture, temperature, riverFlag, seaLevel);

  // L0 path grid (10px) — derived from the tile classification, so a tile can never be
  // `River` for the renderer and walkable for the pathfinder. The grid covers exactly the
  // same tile rectangle `terrainGrid.tileAt` projects (`ceil(width / PATH_CELL)`), which is
  // also the rectangle the L3 decor pass reserves cells in.
  const pCols = tileW;
  const pRows = tileH;
  const pathGrid = new Uint8Array(pCols * pRows);

  // The biome cuts come from this map's own finished moisture distribution — see
  // `MOISTURE_FOREST_QUANTILE`. Computed after the river moisture boost, because that is the
  // field every tile projection reads.
  const cuts = moistureCuts(moisture, s.forest);

  /** The centre of L0 cell `cell`, in the generator field cells — the 10 px grid over the 16 px one. */
  const cellCentreInFieldCells = (cell: number): number =>
    (cell * PATH_CELL + PATH_CELL / 2) / TERRAIN_CELL;

  /** The projected tile type holding L0 cell (x, y). One shared projection for both grids, so
   *  L0 walkability and L1 buildability can never disagree about the same ground. */
  const pathTileType = (x: number, y: number): TerrainType => {
    const cx = cellCentreInFieldCells(x);
    const cy = cellCentreInFieldCells(y);
    return classifyTile(
      sampleElev(elevation, cols, rows, cx, cy),
      sampleElev(moisture, cols, rows, cx, cy),
      sampleElev(temperature, cols, rows, cx, cy),
      sampleElev(riverDist, cols, rows, cx, cy),
      seaLevel,
      cuts.forest,
      cuts.darkForest,
    );
  };
  for (let y = 0; y < pRows; y++)
    for (let x = 0; x < pCols; x++) {
      pathGrid[y * pCols + x] = PATH_WATER.has(pathTileType(x, y)) ? Walkability.Water : Walkability.Open;
    }

  // L3 decorations (biome-density-driven; trees excluded)
  const decorations = placeDecorations(tseed, cols, rows, terrain, pathGrid, pCols, pRows);

  // L1 build grid (20px) — 0=buildable, 1=water, 2=hard, 3=mixed. The hard-ground test reads
  // the same projection `terrainGrid.isTileBuildable` uses, so the L1 grid and
  // `placementUtils` cannot disagree about what blocks a footprint.
  const bCols = Math.ceil(width / BUILD_CELL);
  const bRows = Math.ceil(height / BUILD_CELL);
  const buildGrid = new Uint8Array(bCols * bRows);
  const per = BUILD_CELL / PATH_CELL; // 2
  for (let y = 0; y < bRows; y++)
    for (let x = 0; x < bCols; x++) {
      let water = 0, reserved = 0;
      for (let j = 0; j < per; j++)
        for (let i = 0; i < per; i++) {
          // `pCols`/`pRows` are the ceiling tile counts and `bCols * per >= pCols` by the
          // same ceiling, so these clamps only trim the final partial cell.
          const v = pathGrid[Math.min(pRows - 1, y * per + j) * pCols + Math.min(pCols - 1, x * per + i)];
          if (v === Walkability.Water) water++;
          else if (v === Walkability.Reserved) reserved++;
        }
      const tx = Math.min(tileW - 1, x * per);
      const ty = Math.min(tileH - 1, y * per);
      const type = pathTileType(tx, ty);
      const hard = isUnbuildableTerrainType(type);
      buildGrid[y * bCols + x] = water
        ? Buildability.Water
        : hard
          ? Buildability.Hard
          : reserved
            ? Buildability.Mixed
            : Buildability.Open;
    }

  // World-pixel river polylines (Wilderfolk `rivers` contract).
  const worldRivers = rivers.map(path => path.map(p => ({ x: p.x * TERRAIN_CELL, y: p.y * TERRAIN_CELL })));

  // Biome coverage + buildable ratio (Teraforge `stats`).
  const counts: Record<string, number> = {};
  for (let i = 0; i < terrain.length; i++) {
    const id = BIOME_BY_IDX[terrain[i]].id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  const total = terrain.length;
  const stats: Record<string, number> = {};
  for (const k of Object.keys(counts)) stats[k] = counts[k] / total;
  stats.__buildable = buildGrid.reduce((a, v) => a + (v === Buildability.Open ? 1 : 0), 0) / buildGrid.length;

  return {
    width: tileW,
    height: tileH,
    seed,
    rivers: worldRivers,
    preset,
    size,
    cols,
    rows,
    elevation,
    moisture,
    temperature,
    terrain,
    riverDist,
    waterCols: wCols,
    waterRows: wRows,
    pathGrid,
    pCols,
    pRows,
    buildGrid,
    bCols,
    bRows,
    seaLevel,
    moistureBias: s.moisture,
    moistureForestThreshold: cuts.forest,
    moistureDarkForestThreshold: cuts.darkForest,
    waterfalls,
    stats,
    decorations,
  };
}
