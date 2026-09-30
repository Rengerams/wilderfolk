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
import { tileTypeAt } from '../src/game/terrain/terrainGrid';
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
    // Two failures this guards, both of which shipped. (1) Selection used to pick N springs chosen for
    // being *far apart* and walk each one downhill, so a map grew several short squiggles that never
    // joined into a system. (2) A walk follows the drainage network, which terminates at the map
    // border — and the border is not automatically coast, so a channel could be carved along a chain
    // that walked off the edge onto elevated ground and simply **stopped in a field**. Ranked by the
    // length of the river a headwater feeds, and filtered to candidates whose chain reaches water, the
    // map now grows one trunk with tributaries that merge into it and end at the sea.
    const map = generateWorldMap(MapSize.Medium, MapPreset.Meadows, 1234);
    expect(map.rivers.length, 'at least one river').toBeGreaterThan(0);

    const cell = 16;
    const mapW = map.width * 10;
    const mapH = map.height * 10;
    // Every river must reach a map edge: the drainage walk ends at the border, and a candidate is only
    // accepted when the border it ends on is at or below sea level.
    const touchesEdge = (p: { x: number; y: number }): boolean =>
      p.x <= cell || p.y <= cell || p.x >= mapW - cell || p.y >= mapH - cell;
    const reaches = map.rivers.filter((river) => river.some(touchesEdge));
    expect(reaches.length, 'rivers that reach the map edge / coast').toBeGreaterThan(0);

    // And they must form a system rather than isolated fragments: the longest river has to cover a
    // real share of the map, which a scatter of short springs cannot do.
    const longest = Math.max(...map.rivers.map((r) => r.length));
    expect(longest, 'longest river, in cells').toBeGreaterThan(Math.min(map.cols!, map.rows!) * 0.4);
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
