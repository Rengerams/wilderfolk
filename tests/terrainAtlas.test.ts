/**
 * Painted terrain atlas (2.5D Painted Relief) — corner-autotile picker +
 * elevation relief curve. Pins the Tiled corner encoding derived from
 * TilesetGrass/grass_biome.tsx (corners TL,TR,BL,BR; grass=0, water=1) and the
 * hill/peak extrusion curve used by the terrain bake and the renderer.
 */
import { describe, it, expect } from 'vitest';
import { TerrainType, TERRAIN_TILE_SIZE, type WorldMap } from '../src/game/gameTypes';
import {
  atlasFamily,
  elevationAt,
  pickAtlasTile,
  reliefY,
  terrainRiseAt,
} from '../src/game/terrainAtlas';

/** Tiny map builder — chars: G=grass, F=forest, W=water, H=hills, M=mountain. */
function makeMap(rows: string[], seed = 7): WorldMap {
  const tile = (c: string): { type: TerrainType; elevation: number } => {
    switch (c) {
      case 'W': return { type: TerrainType.ShallowWater, elevation: 10 };
      case 'F': return { type: TerrainType.Forest, elevation: 45 };
      case 'H': return { type: TerrainType.Hills, elevation: 65 };
      case 'M': return { type: TerrainType.Mountains, elevation: 92 };
      default: return { type: TerrainType.Grassland, elevation: 40 };
    }
  };
  const tiles = rows.map((row) =>
    [...row].map((c) => ({ ...tile(c), moisture: 50, variation: 0.5 })),
  );
  return {
    tiles,
    width: rows[0].length,
    height: rows.length,
    seed,
    rivers: [],
    preset: 'verdant',
    size: 'small',
  } as WorldMap;
}

const GRASS_BASE = new Set([0, 1, 2, 3, 4, 13, 14, 25, 26, 37, 38]);

describe('atlasFamily', () => {
  it('maps grassland and forest to grass, water types to water', () => {
    expect(atlasFamily(TerrainType.Grassland)).toBe(0);
    expect(atlasFamily(TerrainType.Forest)).toBe(0);
    expect(atlasFamily(TerrainType.DarkForest)).toBe(0);
    expect(atlasFamily(TerrainType.ShallowWater)).toBe(1);
    expect(atlasFamily(TerrainType.River)).toBe(1);
    expect(atlasFamily(TerrainType.DeepWater)).toBe(1);
  });

  it('returns null for families the atlas has no art for', () => {
    expect(atlasFamily(TerrainType.Hills)).toBeNull();
    expect(atlasFamily(TerrainType.Mountains)).toBeNull();
    expect(atlasFamily(TerrainType.Beach)).toBeNull();
    expect(atlasFamily(TerrainType.Snow)).toBeNull();
  });
});

describe('pickAtlasTile', () => {
  it('picks a grass base variant on open grassland', () => {
    const map = makeMap(['GGG', 'GGG', 'GGG']);
    const pick = pickAtlasTile(map, 1, 1);
    expect(pick).not.toBeNull();
    expect(GRASS_BASE.has(pick!.id)).toBe(true);
    expect(pick!.flipH).toBe(false);
    expect(pick!.flipV).toBe(false);
  });

  it('picks the all-water tile in open water', () => {
    const map = makeMap(['WWW', 'WWW', 'WWW']);
    const pick = pickAtlasTile(map, 1, 1);
    expect(pick).toEqual({ id: 61, flipH: false, flipV: false });
  });

  it('picks the grass-above-water edge when water is to the south', () => {
    const map = makeMap(['GGG', 'GGG', 'WWW']);
    // Tile (1,1) is grass with water below → corners TL,TR grass, BL,BR water
    const pick = pickAtlasTile(map, 1, 1);
    expect(pick).toEqual({ id: 73, flipH: false, flipV: true }); // 0011 (bottom water)
  });

  it('picks a single-water-corner tile for a diagonal lake corner', () => {
    const map = makeMap(['GGW', 'GGG', 'GGG']);
    // Tile (1,1) is grass with water to the NE at (2,0) — that water cell
    // touches only tile (1,1)'s TR corner point (20,10).
    const pick = pickAtlasTile(map, 1, 1);
    expect(pick).toEqual({ id: 72, flipH: false, flipV: false }); // 0100
  });

  it('falls back to null next to a hill (no painted edge to match)', () => {
    const map = makeMap(['GGG', 'GGG', 'GGH']);
    expect(pickAtlasTile(map, 1, 1)).toBeNull();
  });

  it('falls back to null on a mountain tile', () => {
    const map = makeMap(['MMM', 'MGM', 'MMM']);
    expect(pickAtlasTile(map, 1, 1)).toBeNull();
  });
});

describe('reliefY — elevation extrusion curve', () => {
  it('keeps water and lowland flat', () => {
    expect(reliefY(TerrainType.ShallowWater, 30)).toBe(0);
    expect(reliefY(TerrainType.River, 20)).toBe(0);
    expect(reliefY(TerrainType.DeepWater, 40)).toBe(0);
    expect(reliefY(TerrainType.Grassland, 40)).toBe(0);
  });

  it('rises gently on hills (~0.15 at elevation 60)', () => {
    expect(reliefY(TerrainType.Hills, 60)).toBeCloseTo(0.15, 5);
  });

  it('caps at ~0.35 on peaks', () => {
    expect(reliefY(TerrainType.Mountains, 92)).toBe(0.35); // 0.374 → capped
    expect(reliefY(TerrainType.Snow, 100)).toBe(0.35);
  });
});

describe('terrainRiseAt / elevationAt (world-space helpers)', () => {
  it('returns the world-unit rise at a position', () => {
    const map = makeMap(['GGG', 'GHG', 'GGG']);
    const rise = terrainRiseAt(map, 15, 15); // tile (1,1) hills
    expect(rise).toBeCloseTo(reliefY(TerrainType.Hills, 65) * TERRAIN_TILE_SIZE, 5);
    expect(rise).toBeGreaterThan(0);
    // Open grass stays flat
    expect(terrainRiseAt(map, 5, 5)).toBe(0);
  });

  it('samples the right tile from world coords', () => {
    const map = makeMap(['GM', 'WW']);
    expect(elevationAt(map, 25, 5)).toBe(0); // tile (2,0) out of map → 0
    expect(elevationAt(map, 5, 5)).toBe(40); // (0,0) grass
    expect(elevationAt(map, 15, 5)).toBe(92); // (1,0) mountain
  });
});
