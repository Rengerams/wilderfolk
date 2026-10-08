/**
 * Map-variety guards, with the measured tables as their evidence.
 *
 * The owner's ruling: one seed at Medium, Large and Huge must be three different countries, the ten
 * presets must each read as the biome they name, and two seeds must differ. `generateRawTerrain` is
 * measured directly, so the camp/forest clearing `generateWorldMap` applies never enters these numbers.
 */
import { describe, expect, it } from 'vitest';
import {
  MapPreset,
  MapSize,
  MAP_SIZE_DIMENSIONS,
  TerrainType,
  type WorldMap,
} from '../src/game/gameTypes';
import { TERRAIN_CELL, tileTypeAt } from '../src/game/terrain/terrainGrid';
import { generateRawTerrain } from '../src/game/terrain/terragen';

const TERRAIN_TYPES = Object.values(TerrainType);
const PRESETS = Object.values(MapPreset);
/** Long enough for the Huge maps; these are 40k–280k tile projections each. */
const HEAVY = 240_000;

type Counts = Record<string, number>;

function tileCounts(map: WorldMap): Counts {
  const counts: Counts = {};
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const type = tileTypeAt(map, tx, ty) ?? 'null';
      counts[type] = (counts[type] ?? 0) + 1;
    }
  }
  return counts;
}

function shares(counts: Counts): Counts {
  let total = 0;
  for (const k of Object.keys(counts)) total += counts[k]!;
  const out: Counts = {};
  for (const k of Object.keys(counts)) out[k] = counts[k]! / total;
  return out;
}

function share(map: WorldMap, ...types: TerrainType[]): number {
  const hist = shares(tileCounts(map));
  let sum = 0;
  for (const t of types) sum += hist[t] ?? 0;
  return sum;
}

/** Total-variation distance between two share vectors: 0 identical, 1 disjoint. */
function tvd(a: Counts, b: Counts): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const k of keys) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return sum / 2;
}

interface ElevStats {
  min: number;
  max: number;
  mean: number;
  sd: number;
  /** Share of L2 cells at or below the sea level the map ships. */
  water: number;
  /** Mean height of the land cells above sea level, in 0–1 field units. */
  landMean: number;
}

function elevStats(map: WorldMap): ElevStats {
  const el = map.elevation!;
  const sea = map.seaLevel!;
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0, water = 0, landSum = 0, landN = 0;
  for (let i = 0; i < el.length; i++) {
    const v = el[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
    if (v <= sea) water++;
    else { landSum += v; landN++; }
  }
  const mean = sum / el.length;
  return {
    min, max, mean,
    sd: Math.sqrt(Math.max(0, sumSq / el.length - mean * mean)),
    water: water / el.length,
    landMean: landN ? landSum / landN : 0,
  };
}

/** Share of the shared L2 rectangle whose biome index is identical between two maps. */
function biomeAgreement(a: WorldMap, b: WorldMap): number {
  const cols = Math.min(a.cols!, b.cols!);
  const rows = Math.min(a.rows!, b.rows!);
  let same = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (a.terrain![y * a.cols! + x] === b.terrain![y * b.cols! + x]) same++;
    }
  }
  return same / (cols * rows);
}

/**
 * Relief-order agreement: share of sampled neighbour cells ordered the same way by height in both maps.
 * The global height spread is one monotone affine map, so ~1 means one identical raw field (a crop).
 */
function reliefOrderAgreement(a: WorldMap, b: WorldMap): number {
  const cols = Math.min(a.cols!, b.cols!);
  const rows = Math.min(a.rows!, b.rows!);
  const ea = a.elevation!, eb = b.elevation!;
  const ca = a.cols!, cb = b.cols!;
  let same = 0, n = 0;
  for (let y = 0; y + 1 < rows; y++) {
    for (let x = 0; x + 1 < cols; x++) {
      const ia = y * ca + x, ib = y * cb + x;
      const da = Math.sign(ea[ia + 1]! - ea[ia]!) + Math.sign(ea[ia + ca]! - ea[ia]!);
      const db = Math.sign(eb[ib + 1]! - eb[ib]!) + Math.sign(eb[ib + cb]! - eb[ib]!);
      if (da === db) same++;
      n++;
    }
  }
  return same / n;
}

/** L2 cell index holding each drawn river's last point — where the channel let out. */
function outlets(map: WorldMap): number[] {
  const cols = map.cols!;
  return map.rivers.map((river) => {
    const last = river[river.length - 1]!;
    const x = Math.min(cols - 1, Math.max(0, Math.floor(last.x / TERRAIN_CELL)));
    const y = Math.min(map.rows! - 1, Math.max(0, Math.floor(last.y / TERRAIN_CELL)));
    return y * cols + x;
  });
}

function make(size: MapSize, preset: MapPreset, seed: number): WorldMap {
  const dims = MAP_SIZE_DIMENSIONS[size];
  return generateRawTerrain(dims.width, dims.height, seed, size, preset);
}

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

function line(hist: Counts): string {
  return TERRAIN_TYPES
    .filter((t) => (hist[t] ?? 0) > 0.001)
    .map((t) => `${t} ${pct(hist[t]!)}`)
    .join(' ');
}

function elevLine(e: ElevStats): string {
  return `elev min ${e.min.toFixed(3)} max ${e.max.toFixed(3)} mean ${e.mean.toFixed(3)} `
    + `sd ${e.sd.toFixed(3)} water ${pct(e.water)} landMean ${e.landMean.toFixed(3)}`;
}

const SIZES: MapSize[] = [MapSize.Medium, MapSize.Large, MapSize.Huge];
const PRESET_SEED = 1234;
const OTHER_SEED = 98765;

describe('map variety: the three shipped sizes', () => {
  it('generates three different countries, not one landscape re-cropped', () => {
    const preset = MapPreset.Continental;
    const maps = new Map<MapSize, WorldMap>();
    const hists = new Map<MapSize, Counts>();
    const outs = new Map<MapSize, number[]>();

    console.log('\n=== sizes, continental, seed 1234 (L0 tiles) ===');
    for (const size of SIZES) {
      const map = make(size, preset, PRESET_SEED);
      const dims = MAP_SIZE_DIMENSIONS[size];
      maps.set(size, map);
      hists.set(size, shares(tileCounts(map)));
      outs.set(size, outlets(map));
      console.log(`${size.padEnd(7)} ${dims.width}x${dims.height} ${line(hists.get(size)!)}`);
      console.log(`        ${elevLine(elevStats(map))} rivers ${map.rivers.length}`);
    }

    console.log('--- size pairs (before the per-size seed key the same key shared one noise field)');
    for (let i = 0; i < SIZES.length; i++) {
      for (let j = i + 1; j < SIZES.length; j++) {
        const a = SIZES[i]!, b = SIZES[j]!;
        const ma = maps.get(a)!, mb = maps.get(b)!;
        const shared = outs.get(a)!.filter((o) => outs.get(b)!.includes(o)).length;
        console.log(
          `${a} vs ${b}: TVD ${tvd(hists.get(a)!, hists.get(b)!).toFixed(3)} `
          + `biomeAgree ${pct(biomeAgreement(ma, mb))} reliefOrder ${pct(reliefOrderAgreement(ma, mb))} `
          + `sharedOutletCells ${shared}`,
        );
        expect(tvd(hists.get(a)!, hists.get(b)!), `${a}/${b} histogram distance`).toBeGreaterThan(0.08);
        expect(biomeAgreement(ma, mb), `${a}/${b} shared-rect biome agreement`).toBeLessThan(0.3);
        // The pre-offset field shared ~96 % of its relief order; unrelated fields sit near chance.
        expect(reliefOrderAgreement(ma, mb), `${a}/${b} relief-order agreement`).toBeLessThan(0.55);
        expect(shared, `${a}/${b} identical river outlets`)
          .toBeLessThan(Math.max(1, Math.min(outs.get(a)!.length, outs.get(b)!.length)));
      }
    }

    // Positive control for the relief-order metric: one fixed size key makes every map size a window
    // into one identical field, which is the pre-offset configuration this ruling removed.
    const keys: [number, number, MapSize][] = [
      [2560, 1920, MapSize.Large], [4096, 3072, MapSize.Large],
      [2560, 1920, MapSize.Huge], [6144, 4608, MapSize.Huge],
    ];
    for (let k = 0; k < keys.length; k += 2) {
      const [w1, h1, key] = keys[k]!;
      const [w2, h2] = keys[k + 1]!;
      const crop = generateRawTerrain(w1, h1, PRESET_SEED, key, preset);
      const full = generateRawTerrain(w2, h2, PRESET_SEED, key, preset);
      const shared = outlets(crop).filter((o) => outlets(full).includes(o)).length;
      console.log(
        `${key}-key ${w1}x${h1} vs ${w2}x${h2}: TVD ${tvd(shares(tileCounts(crop)), shares(tileCounts(full))).toFixed(3)} `
        + `biomeAgree ${pct(biomeAgreement(crop, full))} reliefOrder ${pct(reliefOrderAgreement(crop, full))} `
        + `sharedOutletCells ${shared}/${outlets(crop).length}`,
      );
      expect(reliefOrderAgreement(crop, full), `${key}-key crop relief order`).toBeGreaterThan(0.85);
    }
  }, HEAVY);

  it('keeps a workable land mass at every size and seed', () => {
    console.log('\n=== water share / land mean by size across seeds (continental) ===');
    const bySize = new Map<MapSize, number[]>();
    for (const size of SIZES) {
      const water: number[] = [];
      const cells: string[] = [];
      for (const seed of [11, 202, 3033, 40404, 555555, 6060606]) {
        const e = elevStats(make(size, MapPreset.Continental, seed));
        water.push(e.water);
        cells.push(`${seed}:${pct(e.water)}/${e.landMean.toFixed(2)}`);
        expect(e.water, `${size} seed ${seed} is all ocean`).toBeLessThan(0.8);
        expect(e.water, `${size} seed ${seed} is all land`).toBeGreaterThan(0.02);
      }
      bySize.set(size, water);
      const mean = water.reduce((a, b) => a + b, 0) / water.length;
      const sd = Math.sqrt(water.reduce((a, b) => a + (b - mean) ** 2, 0) / water.length);
      console.log(`${size.padEnd(7)} ${cells.join('  ')}  mean ${pct(mean)} sd ${pct(sd)}`);
    }
    const meanOf = (size: MapSize): number => {
      const v = bySize.get(size)!;
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    console.log(
      `means: medium ${pct(meanOf(MapSize.Medium))} large ${pct(meanOf(MapSize.Large))} huge ${pct(meanOf(MapSize.Huge))}`
      + ' — the spread seed to seed is wider than the spread between sizes at six seeds.',
    );
  }, HEAVY);
});

describe('map variety: the ten presets', () => {
  it('makes each preset read as the biome it names, and none of them the same map', () => {
    console.log('\n=== presets, medium, seed 1234 (L0 tiles) ===');
    const hists = new Map<string, Counts>();
    const maps = new Map<string, WorldMap>();
    for (const preset of PRESETS) {
      const map = make(MapSize.Medium, preset, PRESET_SEED);
      maps.set(preset, map);
      hists.set(preset, shares(tileCounts(map)));
      console.log(`${preset.padEnd(13)} rivers ${String(map.rivers.length).padStart(2)} ${line(hists.get(preset)!)}`);
      console.log(`              ${elevLine(elevStats(map))}`);
    }

    const closest = { pair: '', d: 1 };
    for (let i = 0; i < PRESETS.length; i++) {
      for (let j = i + 1; j < PRESETS.length; j++) {
        const d = tvd(hists.get(PRESETS[i]!)!, hists.get(PRESETS[j]!)!);
        if (d < closest.d) { closest.d = d; closest.pair = `${PRESETS[i]} / ${PRESETS[j]}`; }
      }
    }
    console.log(`closest preset pair: ${closest.pair} TVD ${closest.d.toFixed(3)}`);
    // A pair that ever measures below this is reported with its numbers, never tuned noisier; the
    // closest pair today is scandinavia / continental, and none falls under the floor.
    expect(closest.d, `closest preset pair ${closest.pair}`).toBeGreaterThan(0.08);

    const named: [string, number, TerrainType[]][] = [
      ['oasis', 0.40, [TerrainType.Desert]],
      ['arabia', 0.30, [TerrainType.Desert]],
      ['black_forest', 0.45, [TerrainType.Forest, TerrainType.DarkForest]],
      ['islands', 0.45, [TerrainType.DeepWater, TerrainType.ShallowWater]],
      ['coastal', 0.30, [TerrainType.DeepWater, TerrainType.ShallowWater]],
      ['meadows', 0.15, [TerrainType.Grassland]],
      ['highland', 0.15, [TerrainType.Hills, TerrainType.Mountains, TerrainType.Rocky]],
      ['scandinavia', 0.10, [TerrainType.DarkForest]],
      ['continental', 0.15, [TerrainType.Forest, TerrainType.DarkForest]],
    ];
    for (const [preset, floor, types] of named) {
      const map = maps.get(preset);
      if (!map) continue;
      const measured = share(map, ...types);
      expect(measured, `${preset} reads as its name (measured ${pct(measured)})`).toBeGreaterThan(floor);
    }
    // A preset painted into one flat type is not a landscape.
    for (const preset of PRESETS) {
      const top = Math.max(...Object.values(hists.get(preset)!));
      expect(top, `${preset} is one flat type`).toBeLessThan(0.85);
    }
  }, HEAVY);
});

describe('map variety: different seeds', () => {
  it('makes two seeds two different maps of the same preset and size', () => {
    console.log('\n=== seeds, medium continental ===');
    const a = make(MapSize.Medium, MapPreset.Continental, PRESET_SEED);
    const b = make(MapSize.Medium, MapPreset.Continental, OTHER_SEED);
    console.log(`seed ${PRESET_SEED} ${line(shares(tileCounts(a)))}`);
    console.log(`             ${elevLine(elevStats(a))}`);
    console.log(`seed ${OTHER_SEED} ${line(shares(tileCounts(b)))}`);
    console.log(`             ${elevLine(elevStats(b))}`);
    const d = tvd(shares(tileCounts(a)), shares(tileCounts(b)));
    console.log(`TVD ${d.toFixed(3)} biomeAgree ${pct(biomeAgreement(a, b))} reliefOrder ${pct(reliefOrderAgreement(a, b))}`);
    expect(d, 'seeds 1234 and 98765 histogram distance').toBeGreaterThan(0.05);
    expect(biomeAgreement(a, b), 'seeds 1234 and 98765 biome agreement').toBeLessThan(0.3);
    expect(reliefOrderAgreement(a, b), 'seeds 1234 and 98765 relief-order agreement').toBeLessThan(0.55);
  }, HEAVY);
});
