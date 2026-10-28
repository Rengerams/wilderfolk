import { describe, expect, it } from 'vitest';
import { MapPreset } from '../src/game/gameTypes';
import {
  DIRT_TEXTURE_PATHS,
  GRASS_TEXTURE_PATHS,
  TERRAIN_MATERIAL_PATHS,
  grassDetailAt,
  sampleTerrainMaterial,
  type GroundGrassTexture,
  type GroundGrassTextures,
} from '../src/game/renderer/grassTextures';

function texture(r: number, g: number, b: number, contrast: number): GroundGrassTexture {
  // A fixed 2×2 tile with *distinct* contrast in each material: colour
  // differences alone cancel when the renderer preserves palette means.
  return {
    width: 2, height: 2,
    pixels: new Uint8ClampedArray([
      r, g, b, 255,
      r + 12 * contrast, g + 12 * contrast, b + 12 * contrast, 255,
      r + 8 * contrast, g + 8 * contrast, b + 8 * contrast, 255,
      r + 20 * contrast, g + 20 * contrast, b + 20 * contrast, 255,
    ]),
    mean: [r + 10 * contrast, g + 10 * contrast, b + 10 * contrast],
  };
}

const textures: GroundGrassTextures = [
  texture(70, 100, 70, 1),
  texture(110, 100, 50, 1.8),
  texture(55, 70, 52, 1.4),
  texture(35, 65, 28, 2),
];

const sample = (x: number, y: number, moisture: number, preset = MapPreset.Meadows) => {
  const out: [number, number, number] = [0, 0, 0];
  grassDetailAt(textures, x, y, moisture, 0.56, 0.78, preset, out);
  return out;
};

describe('authored grass albedo in v4 biome blending', () => {
  it('keeps four explicit licensed albedo paths rather than procedural sprite substitutes', () => {
    expect(GRASS_TEXTURE_PATHS).toEqual([
      '/sprites/terrain/cethiel/Grass_03.png',
      '/sprites/terrain/cethiel/Grass_04.png',
      '/sprites/terrain/cethiel/Grass_02.png',
      '/sprites/terrain/cethiel/Grass_01.png',
    ]);
  });

  it('samples the same absolute-world texture across independently baked chunks', () => {
    for (const x of [0, 1, 128, 255, 256, 257, 511, 512, 513]) {
      const first = sample(x, 257, 0.65);
      const second = sample(x, 257, 0.65);
      expect(first).toEqual(second);
      // Both source tiles repeat in world space, not relative to their chunk.
      expect(first).toEqual(sample(x + 2, 257, 0.65));
      expect(first).toEqual(sample(x, 259, 0.65));
    }
  });

  it('fades between open meadow, woodland and dense leaves without abrupt material jumps', () => {
    let previous = sample(72, 101, 0.25);
    for (let m = 0.26; m < 1; m += 0.01) {
      const current = sample(72, 101, m);
      for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(current[channel] - previous[channel])).toBeLessThan(3);
      }
      previous = current;
    }
  });

  it('registers all four original dirt images but excludes directional tracks from biome detail', () => {
    expect(DIRT_TEXTURE_PATHS).toEqual({
      loam: '/sprites/terrain/cethiel/Dirt_01.png',
      coarseSoil: '/sprites/terrain/cethiel/Dirt_02.png',
      rutted: '/sprites/terrain/cethiel/Dirt_03.png',
      leafLitter: '/sprites/terrain/cethiel/Dirt_04.png',
    });
    expect(Object.keys(DIRT_TEXTURE_PATHS)).toHaveLength(4);
    expect(DIRT_TEXTURE_PATHS.rutted).not.toBe(DIRT_TEXTURE_PATHS.loam);
  });

  it('registers only the curated seven nature albedos for the ground shader', () => {
    expect(TERRAIN_MATERIAL_PATHS).toEqual({
      sand: '/sprites/terrain/rubberduck/246.jpg',
      soil: '/sprites/terrain/rubberduck/206.jpg',
      drySoil: '/sprites/terrain/rubberduck/217.jpg',
      gravel: '/sprites/terrain/rubberduck/232.jpg',
      rock: '/sprites/terrain/rubberduck/235.jpg',
      straw: '/sprites/terrain/rubberduck/210.jpg',
      pebbles: '/sprites/terrain/rubberduck/215.jpg',
    });
    expect(new Set(Object.values(TERRAIN_MATERIAL_PATHS)).size).toBe(7);
  });

  it('samples actual earth/rock albedo detail with absolute-world wrapping', () => {
    const material = texture(52, 65, 54, 1.7);
    const delta: [number, number, number] = [0, 0, 0];
    sampleTerrainMaterial(material, 255, 256, delta);
    const sample = [...delta];
    sampleTerrainMaterial(material, 257, 258, delta);
    expect(delta).toEqual(sample);
    sampleTerrainMaterial(material, 0, 0, delta);
    expect(delta).not.toEqual(sample);
    // A soil surface remains a *detail*, rather than painting over the
    // Whittaker biome's temperature/moisture colour.
    expect(delta.every((v) => Math.abs(v) < 60)).toBe(true);
  });

  it('makes flower-rich grass a meadow choice, not a default for dark forest', () => {
    const meadow = sample(0, 0, 0.15, MapPreset.Meadows);
    const openForest = sample(0, 0, 0.15, MapPreset.BlackForest);
    expect(meadow).not.toEqual(openForest);
    const denseMeadow = sample(0, 0, 0.99, MapPreset.Meadows);
    const denseForest = sample(0, 0, 0.99, MapPreset.BlackForest);
    expect(denseMeadow).toEqual(denseForest);
  });
});
