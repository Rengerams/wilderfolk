/**
 * The map's y axis is latitude: air is warmest along the middle row and cools toward both edges,
 * symmetric about the middle and varying with the seed.
 */
import { describe, expect, it } from 'vitest';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { rainShadowField } from '../src/game/terrain/rainShadow';
import { MapPreset, MapSize, type WorldMap } from '../src/game/gameTypes';

const WORLD_W = 1280;
const WORLD_H = 960;

/** Mean temperature of one cell row. */
function rowMean(map: WorldMap, y: number): number {
  const cols = map.cols!;
  const temp = map.temperature!;
  let sum = 0;
  for (let x = 0; x < cols; x++) sum += temp[y * cols + x];
  return sum / cols;
}

function generate(preset: MapPreset, seed: number): WorldMap {
  return generateRawTerrain(WORLD_W, WORLD_H, seed, MapSize.Medium, preset);
}

describe('latitude parameterization', () => {
  it('cools the air from the equator toward both poles', () => {
    const map = generate(MapPreset.Continental, 12345);
    const rows = map.rows!;
    const equator = rowMean(map, Math.floor(rows / 2));
    const poleTop = rowMean(map, 0);
    const poleBottom = rowMean(map, rows - 1);

    // The middle row is the warm one, and both edges are colder than it. A monotone gradient is
    // what makes the biome zones read as latitude rather than as noise.
    expect(equator, 'equator row against the top edge').toBeGreaterThan(poleTop);
    expect(equator, 'equator row against the bottom edge').toBeGreaterThan(poleBottom);

    // Sampled quarter-rows: the cooling has to be progressive, not a single step at the edge.
    const quarter = rowMean(map, Math.floor(rows / 4));
    const threeQuarter = rowMean(map, Math.floor((3 * rows) / 4));
    expect(quarter, 'quarter-row against the equator').toBeLessThan(equator);
    expect(quarter, 'quarter-row against the top edge').toBeGreaterThan(poleTop);
    expect(threeQuarter, 'three-quarter-row against the equator').toBeLessThan(equator);
    expect(threeQuarter, 'three-quarter-row against the bottom edge').toBeGreaterThan(poleBottom);
  });

  it('is symmetric about the middle, and stays a gradient instead of clamping flat', () => {
    const map = generate(MapPreset.Islands, 2024);
    const rows = map.rows!;
    const mid = (rows - 1) / 2;

    // Row `mid - k` and row `mid + k` see the same latitude term, so their means may differ only by
    // elevation and weather noise; a one-edge-to-other gradient fails this.
    for (const k of [3, 8, 14]) {
      const north = rowMean(map, Math.floor(mid - k));
      const south = rowMean(map, Math.ceil(mid + k));
      expect(Math.abs(north - south), `rows ±${k} disagree about the latitude`).toBeLessThan(0.12);
    }

    // The equatorial row must not be pinned to the clamp: a saturated 1.0 means the parameter
    // has nothing left to say and the hot half of the map reads as one flat climate.
    expect(rowMean(map, Math.floor(rows / 2)), 'equatorial row is not saturated').toBeLessThan(0.99);
  });

  it('makes the climate a function of the seed, not a fixed band', () => {
    // The seed lives in the per-cell offset, not the row means, so two seeds differ across most of the grid.
    const a = generate(MapPreset.Continental, 12345);
    const b = generate(MapPreset.Continental, 4242);
    const ta = a.temperature!;
    const tb = b.temperature!;
    let differing = 0;
    for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) differing++;
    expect(differing, 'cells whose temperature is seed-independent').toBeGreaterThan(ta.length * 0.8);

    // And the same seed reproduces the same climate.
    const again = generate(MapPreset.Continental, 12345);
    expect(Array.from(again.temperature!)).toEqual(Array.from(ta));
  });

  it('is deterministic for one seed', () => {
    const a = generate(MapPreset.Highland, 99);
    const b = generate(MapPreset.Highland, 99);
    expect(Array.from(a.temperature!)).toEqual(Array.from(b.temperature!));
  });
});

/**
 * The orographic rain shadow is the directional half of the moisture field: it gives a range a wet
 * and a dry side instead of the altitude penalty's even drying.
 */
describe('orographic rain shadow', () => {
  /** A wall on column 4 with low ground either side: the windward side has clear sky, the lee does not. */
  const cols = 12;
  const rows = 5;
  const wall = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) wall[y * cols + x] = x === 4 ? 0.8 : 0.2;
  }
  const shadow = rainShadowField(wall, cols, rows);
  const at = (x: number, y = 2) => shadow[y * cols + x];

  it('shades the lee of a ridge and leaves the windward side clear', () => {
    // Wind runs west to east, so the march is upwind (-x): west of the wall nothing blocks the rain…
    expect(at(3), 'windward cell beside the wall').toBe(0);
    expect(at(0), 'far windward cell').toBe(0);
    // …and east of it the ground stands behind the barrier.
    expect(at(5), 'first lee cell').toBeGreaterThan(0.5);
    expect(at(6), 'second lee cell').toBeGreaterThan(0.5);
    // The shadow eases with distance rather than stopping at an edge, so a plain recovers as it runs on.
    expect(at(5), 'lee cell beside the ridge against one further out').toBeGreaterThan(at(8));
    // Ground level with the ridge top is not shaded at all, however far upwind it looks.
    const flat = new Float32Array(cols * rows).fill(0.5);
    expect(Array.from(rainShadowField(flat, cols, rows)).every((v) => v === 0)).toBe(true);
  });

  it('dries the leeward flank of a generated range without flattening the climate', () => {
    // `Continental` here leaves both a shaded and a clear mid-altitude population to compare;
    // `Coastal` is four-fifths water with its land in one narrow band.
    const map = generate(MapPreset.Continental, 12345);
    const colsInMap = map.cols!;
    const rowsInMap = map.rows!;
    const elevation = map.elevation!;
    const moisture = map.moisture!;
    const sea = map.seaLevel ?? 0.24;
    const field = rainShadowField(elevation, colsInMap, rowsInMap);

    // Matched mid-altitude land, split only by how shaded it is — so elevation cannot explain the gap.
    let shaded = 0;
    let shadedN = 0;
    let clear = 0;
    let clearN = 0;
    for (let i = 0; i < elevation.length; i++) {
      const band = (elevation[i] - sea) / (1 - sea);
      if (elevation[i] <= sea || band < 0.1 || band > 0.45) continue;
      if (field[i] > 0.25) {
        shaded += moisture[i];
        shadedN++;
      } else if (field[i] < 0.05) {
        clear += moisture[i];
        clearN++;
      }
    }
    expect(shadedN, 'shaded mid-altitude cells').toBeGreaterThan(100);
    expect(clearN, 'unshaded mid-altitude cells').toBeGreaterThan(100);
    const shadedMean = shaded / shadedN;
    const clearMean = clear / clearN;
    // At matched altitude, the shaded band must carry a lower mean moisture than the clear band.
    expect(shadedMean, `shaded ${shadedMean.toFixed(3)} against clear ${clearMean.toFixed(3)}`).toBeLessThan(clearMean);
    expect(clearMean - shadedMean, 'the gap a rain shadow exists to make').toBeGreaterThan(0.08);

    // And it is a function of the terrain alone: same map, same field.
    expect(Array.from(rainShadowField(elevation, colsInMap, rowsInMap))).toEqual(Array.from(field));
  });
});
