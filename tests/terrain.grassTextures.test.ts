import { describe, expect, it } from 'vitest';
import { MapPreset } from '../src/game/gameTypes';
import {
  GRASS_TEXTURE_PATHS,
  grassDetailAt,
  type GroundGrassTexture,
  type GroundGrassTextures,
} from '../src/game/renderer/grassTextures';

function texture(r: number, g: number, b: number): GroundGrassTexture {
  // A fixed 2×2 tile with asymmetric detail and an authored mean. Deliberately
  // much smaller than the shipping 512px PNGs to exercise UV wrapping.
  return {
    width: 2, height: 2,
    pixels: new Uint8ClampedArray([
      r, g, b, 255, r + 12, g + 12, b + 12, 255,
      r + 8, g + 8, b + 8, 255, r + 20, g + 20, b + 20, 255,
    ]),
    mean: [r + 10, g + 10, b + 10],
  };
}

const textures: GroundGrassTextures = [
  texture(70, 100, 70),
  texture(110, 100, 50),
  texture(55, 70, 52),
  texture(35, 65, 28),
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

  it('makes flower-rich grass a meadow choice, not a default for dark forest', () => {
    const meadow = sample(0, 0, 0.15, MapPreset.Meadows);
    const openForest = sample(0, 0, 0.15, MapPreset.BlackForest);
    expect(meadow).not.toEqual(openForest);
    const denseMeadow = sample(0, 0, 0.99, MapPreset.Meadows);
    const denseForest = sample(0, 0, 0.99, MapPreset.BlackForest);
    expect(denseMeadow).toEqual(denseForest);
  });
});
