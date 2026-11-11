/**
 * COV-I-04: ground height is a lattice interpolation, so movers and bakes reuse the sampled vertices
 * instead of re-reading the elevation field for every draw.
 */
import { describe, expect, it } from 'vitest';
import { MapPreset, MapSize, type WorldMap } from '../src/game/gameTypes';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { DEFAULT_SEA_LEVEL, TERRAIN_CELL, sampleElev } from '../src/game/terrain/terrainGrid';
import {
  TERRAIN_HEIGHT_MESH_MAX_RISE,
  TERRAIN_HEIGHT_MESH_STEP,
  resetTerrainRiseCache,
  supportsTerrainHeightMesh,
  terrainRiseAt,
} from '../src/game/terrainAtlas';

const SEED = 20_261_107;

function countingMap(): { map: WorldMap; counter: { reads: number } } {
  const map = generateRawTerrain(1200, 900, SEED, MapSize.Medium, MapPreset.Continental);
  map.decorations = [];
  const counter = { reads: 0 };
  const elevation = map.elevation!;
  map.elevation = new Proxy(elevation, {
    get(target, prop) {
      if (typeof prop === 'string' && /^\d+$/.test(prop)) counter.reads++;
      return Reflect.get(target, prop);
    },
  }) as Float32Array;
  return { map, counter };
}

/** The direct mesh formula, kept here as the reference the cached lattice must reproduce. */
function referenceRise(map: WorldMap, x: number, y: number): number {
  const s = TERRAIN_HEIGHT_MESH_STEP;
  const x0 = Math.floor(x / s) * s;
  const y0 = Math.floor(y / s) * s;
  const fx = (x - x0) / s;
  const fy = (y - y0) / s;
  const vertex = (vx: number, vy: number): number => {
    const e = sampleElev(map.elevation!, map.cols!, map.rows!, vx / TERRAIN_CELL, vy / TERRAIN_CELL);
    const sea = map.seaLevel ?? DEFAULT_SEA_LEVEL;
    const hn = Math.max(0, (e - sea) / Math.max(0.01, 1 - sea));
    const uplift = Math.max(0, Math.min(1, (hn - 0.12) / 0.74));
    return uplift * TERRAIN_HEIGHT_MESH_MAX_RISE;
  };
  const z00 = vertex(x0, y0);
  const z10 = vertex(x0 + s, y0);
  const z01 = vertex(x0, y0 + s);
  if (fx + fy <= 1) return z00 * (1 - fx - fy) + z10 * fx + z01 * fy;
  const z11 = vertex(x0 + s, y0 + s);
  return z11 * (fx + fy - 1) + z10 * (1 - fy) + z01 * (1 - fx);
}

/** First sampled position whose ground clears the coastal flat, so the case is not a zero rise. */
function firstRaisedPoint(map: WorldMap): { x: number; y: number } {
  for (let x = 20; x < 1100; x += 37) {
    for (let y = 20; y < 800; y += 41) {
      if (referenceRise(map, x, y) > 1) return { x, y };
    }
  }
  throw new Error('generated map has no raised ground');
}

describe('terrain rise lattice cache', () => {
  it('matches the direct mesh formula at sampled points', () => {
    const map = generateRawTerrain(1200, 900, SEED, MapSize.Medium, MapPreset.Continental);
    map.decorations = [];
    expect(supportsTerrainHeightMesh(map)).toBe(true);
    resetTerrainRiseCache();

    for (const [x, y] of [[12.5, 40.25], [321.75, 210.5], [700.1, 640.9], [1000.5, 900.5]]) {
      expect(terrainRiseAt(map, x, y)).toBeCloseTo(referenceRise(map, x, y), 10);
    }
  });

  it('reads the elevation field once for a repeated position', () => {
    const { map, counter } = countingMap();
    resetTerrainRiseCache();

    const first = terrainRiseAt(map, 321.5, 210.25);
    expect(counter.reads).toBeGreaterThan(0);
    counter.reads = 0;

    expect(terrainRiseAt(map, 321.5, 210.25)).toBe(first);
    expect(counter.reads).toBe(0);
  });

  it('keeps per-mover cost flat while movers share one lattice cell', () => {
    const { map, counter } = countingMap();
    resetTerrainRiseCache();
    const originX = 10 * TERRAIN_HEIGHT_MESH_STEP;
    const originY = 8 * TERRAIN_HEIGHT_MESH_STEP;
    // Warm both triangles of the cell so the four corner samples are already owned.
    terrainRiseAt(map, originX + 1, originY + 1);
    terrainRiseAt(map, originX + TERRAIN_HEIGHT_MESH_STEP - 1, originY + TERRAIN_HEIGHT_MESH_STEP - 1);
    counter.reads = 0;

    for (let i = 0; i < 200; i++) {
      terrainRiseAt(map, originX + 1 + (i % 20) * 0.5, originY + 1 + Math.floor(i / 20) * 0.5);
    }
    expect(counter.reads).toBe(0);
  });

  it('recomputes the same height after a cache reset', () => {
    const { map } = countingMap();
    resetTerrainRiseCache();
    const point = firstRaisedPoint(map);
    const first = terrainRiseAt(map, point.x, point.y);
    expect(first).toBeGreaterThan(1);
    resetTerrainRiseCache();
    expect(terrainRiseAt(map, point.x, point.y)).toBe(first);
  });
});
