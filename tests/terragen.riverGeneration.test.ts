/**
 * Teraforge river generation — rivers carve real `River` tiles, follow a real drainage network, and are
 * deterministic per seed. Replaces the deleted old-engine river test.
 *
 * The hydrology cases below were added with the SIGGRAPH 2013 carve: they pin the two invariants that
 * change broke while it was being written (a flow network with dead ends, and a cycle that made every
 * river walk the full grid), so neither can come back silently.
 */
import { describe, expect, it } from 'vitest';
import { generateWorldMap } from '../src/game/terrainGen';
import { MapPreset, MapSize, TerrainType, type WorldMap } from '../src/game/gameTypes';
import { TERRAIN_CELL, tileTypeAt } from '../src/game/terrain/terrainGrid';
import { computeFlow, fillDepressions, riverWidthAt } from '../src/game/terrain/hydrology';
import { generateRawTerrain } from '../src/game/terrain/terragen';

function countType(map: WorldMap, type: TerrainType): number {
  let n = 0;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (tileTypeAt(map, tx, ty) === type) n++;
    }
  }
  return n;
}

/** The drainage network of a finished map, recomputed from the carved height field the map ships. */
interface Drainage {
  cols: number;
  rows: number;
  elevation: Float32Array;
  seaLevel: number;
  downstream: Int32Array;
}

function networkOf(map: WorldMap): Drainage {
  const cols = map.cols!;
  const rows = map.rows!;
  const elevation = map.elevation!;
  const { downstream } = computeFlow(fillDepressions(elevation, cols, rows), cols, rows);
  return { cols, rows, elevation, seaLevel: map.seaLevel!, downstream };
}

/** Whether the chain draining from `from` ends on the sea: a below-sea border cell. */
function drainsToSea(net: Drainage, from: number): boolean {
  let cell = from;
  for (let step = 0; step < net.cols * net.rows; step++) {
    const next = net.downstream[cell]!;
    if (next < 0) {
      const x = cell % net.cols;
      const y = (cell / net.cols) | 0;
      const border = x === 0 || y === 0 || x === net.cols - 1 || y === net.rows - 1;
      return border && net.elevation[cell]! <= net.seaLevel + 0.02;
    }
    cell = next;
  }
  return false;
}

/** The drainage-network cell a polyline's last point sits in — where the channel let out. */
function outletCell(river: { x: number; y: number }[], cols: number, rows: number): number {
  const last = river[river.length - 1]!;
  const x = Math.min(cols - 1, Math.max(0, Math.floor(last.x / TERRAIN_CELL)));
  const y = Math.min(rows - 1, Math.max(0, Math.floor(last.y / TERRAIN_CELL)));
  return y * cols + x;
}

describe('Teraforge river generation', () => {
  it('carves rivers on river-bearing presets', () => {
    for (const preset of [MapPreset.Rivers, MapPreset.Highland, MapPreset.Continental, MapPreset.Meadows]) {
      const map = generateWorldMap(MapSize.Medium, preset, 1234);
      expect(map.rivers.length, `${preset}: ≥1 river polyline`).toBeGreaterThan(0);
      expect(countType(map, TerrainType.River), `${preset}: carved River tiles`).toBeGreaterThan(0);
    }
  });

  it('is deterministic per seed', () => {
    const a = generateWorldMap(MapSize.Medium, MapPreset.Rivers, 42);
    const b = generateWorldMap(MapSize.Medium, MapPreset.Rivers, 42);
    expect(a.rivers).toEqual(b.rivers);
    // The old grid was `a.tiles`. Teraforge keeps no per-tile grid, so the determinism claim is
    // made on the generated layers the tile projection is derived from.
    expect(Array.from(a.pathGrid!)).toEqual(Array.from(b.pathGrid!));
    expect(Array.from(a.terrain!)).toEqual(Array.from(b.terrain!));
    expect(Array.from(a.elevation!)).toEqual(Array.from(b.elevation!));
    expect(Array.from(a.moisture!)).toEqual(Array.from(b.moisture!));
    expect(Array.from(a.temperature!)).toEqual(Array.from(b.temperature!));
    expect(Array.from(a.riverDist!)).toEqual(Array.from(b.riverDist!));
  });

  it('produces valid river polylines in world pixels', () => {
    const map = generateWorldMap(MapSize.Medium, MapPreset.Highland, 1234);
    expect(map.rivers.length).toBeGreaterThan(0);
    for (const river of map.rivers) {
      expect(river.length, 'river has ≥2 points').toBeGreaterThanOrEqual(2);
      for (const p of river) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('draws connected rivers that reach the sea, not streams that stop inland', () => {
    // Ranked by the river a headwater feeds and filtered to chains that let out on the sea, the map grows
    // one trunk with tributaries instead of squiggles that stop in a field. All three shipped sizes.
    for (const size of [MapSize.Medium, MapSize.Large, MapSize.Huge]) {
      const map = generateWorldMap(size, MapPreset.Meadows, 1234);
      const net = networkOf(map);

      // A river that flows into a lake reaches the sea only if that lake drains there, so the drawn
      // polyline is traced through the drainage network, not measured against the border. No length
      // or count floor here: a river is not a requirement, and a short or absent one is acceptable.
      for (const river of map.rivers) {
        const outlet = river[river.length - 1]!;
        expect(
          drainsToSea(net, outletCell(river, net.cols, net.rows)),
          `${size}: river letting out at ${outlet.x},${outlet.y} does not drain to the sea`,
        ).toBe(true);
      }
    }
  });

  it('lets every drawn river out into water that carries on to the sea, on every shipped preset', () => {
    // The drainage property holds on all ten, measured. The floor is only that the check is not
    // vacuous: a river is not a requirement, so a preset may legitimately draw a short one or none.
    let presetsWithRivers = 0;
    for (const preset of Object.values(MapPreset)) {
      const map = generateWorldMap(MapSize.Medium, preset, 1234);
      if (map.rivers.length > 0) presetsWithRivers++;
      const net = networkOf(map);
      for (const river of map.rivers) {
        const outlet = river[river.length - 1]!;
        expect(
          drainsToSea(net, outletCell(river, net.cols, net.rows)),
          `${preset}: river letting out at ${outlet.x},${outlet.y} does not drain to the sea`,
        ).toBe(true);
      }
    }
    expect(presetsWithRivers, 'presets that drew a river at all (oasis requests none)').toBeGreaterThan(0);
  });
});

describe('drainage network (SIGGRAPH 2013 hydrology carve)', () => {
  const map = generateRawTerrain(2560, 1920, 12345, MapSize.Medium, MapPreset.Highland);
  const cols = map.cols!;
  const rows = map.rows!;
  const filled = fillDepressions(map.elevation!, cols, rows);
  const { downstream, accumulation } = computeFlow(filled, cols, rows);

  it('routes every interior cell to an outlet, with no cycles', () => {
    // A cell that cannot drain is a stub river; a cycle is a river that never reaches the sea. Both were
    // real while this pass was being written: the fill alone left 14–27 % of cells with no lower
    // neighbour (longest path ~30 cells), and an inverted uphill guard closed a loop that made every walk
    // traverse the whole grid.
    const n = cols * rows;
    let interiorDeadEnds = 0;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (downstream[y * cols + x] < 0) interiorDeadEnds++;
      }
    }
    expect(interiorDeadEnds, 'interior cells with nowhere to drain').toBe(0);

    // Following the network from any cell must terminate inside the grid, never loop.
    let longest = 0;
    for (let i = 0; i < n; i++) {
      let cell = i;
      let steps = 0;
      while (cell >= 0 && steps <= n) {
        cell = downstream[cell];
        steps++;
      }
      if (steps > longest) longest = steps;
    }
    expect(longest, 'longest downstream walk in cells').toBeLessThanOrEqual(n);
    expect(longest, 'a real drainage path, not a stub').toBeGreaterThan(50);
  });

  it('accumulates water downstream: a trunk cell drains more land than its headwaters', () => {
    let max = 0;
    let sum = 0;
    for (let i = 0; i < accumulation.length; i++) {
      if (accumulation[i] > max) max = accumulation[i];
      sum += accumulation[i];
    }
    const mean = sum / accumulation.length;
    // The paper reads a watercourse's flow from its watershed area, so the distribution has to have a
    // tail: measured, the trunk reaches 6 000–12 000 cells against a mean of ~4.
    expect(max, 'largest catchment in cells').toBeGreaterThan(1000);
    expect(max, 'trunk against mean catchment').toBeGreaterThan(mean * 100);
    // Water only ever moves to a cell at least as much downhill: accumulation never decreases along it.
    for (let i = 0; i < accumulation.length; i += 97) {
      const next = downstream[i];
      if (next < 0) continue;
      expect(accumulation[next], `cell ${i} drains into a cell with less water`).toBeGreaterThanOrEqual(accumulation[i]);
    }
  });

  it('widens a channel with its catchment, between the headwater and trunk bounds', () => {
    // The paper's `A → φ → w` chain, as a pure law: monotone, bounded, and continuous at both ends.
    const presetWidth = 1.5;
    expect(riverWidthAt(presetWidth, 0)).toBeLessThan(riverWidthAt(presetWidth, 0.5));
    expect(riverWidthAt(presetWidth, 0.5)).toBeLessThan(riverWidthAt(presetWidth, 1));
    let previous = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const w = riverWidthAt(presetWidth, t);
      expect(w).toBeGreaterThanOrEqual(previous);
      previous = w;
    }
    // A fraction outside 0–1 is clamped rather than extrapolated into a negative or runaway channel.
    expect(riverWidthAt(presetWidth, -2)).toBe(riverWidthAt(presetWidth, 0));
    expect(riverWidthAt(presetWidth, 3)).toBe(riverWidthAt(presetWidth, 1));
    expect(riverWidthAt(presetWidth, 1) / riverWidthAt(presetWidth, 0)).toBeCloseTo(8, 1);
  });
});
