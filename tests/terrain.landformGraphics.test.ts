import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { bakeWhittakerGround, buildWhittakerFields } from '../src/game/renderer/whittakerTerrain';

interface CapturedImage { data: Uint8ClampedArray; width: number; height: number }
const existingDocument = (globalThis as { document?: unknown }).document;
const capture: { image: CapturedImage | null } = { image: null };

beforeAll(() => {
  const context = {
    createImageData: (width: number, height: number): CapturedImage => ({
      width, height, data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (image: CapturedImage) => { capture.image = image; },
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ getContext: () => context, width: 0, height: 0 }),
  };
});
afterAll(() => {
  (globalThis as { document?: unknown }).document = existingDocument;
});

function lastPixels(): Uint8ClampedArray {
  const image = capture.image;
  if (!image) throw new Error('no ground pixels');
  return Uint8ClampedArray.from(image.data);
}

describe('landform graphic uplift', () => {
  it('shows exposed rock on steep upland while keeping the underlying terrain immutable', () => {
    const map = testWorldMap({ tilesX: 24, tilesY: 24 });
    map.seaLevel = 0.24;
    map.elevation!.fill(0.59);
    const original = Float32Array.from(map.elevation!);
    const fields = buildWhittakerFields(map)!;
    const bake = () => {
      bakeWhittakerGround(map, 240, 240, map.seaLevel!, 0,
        { x: 48, y: 48, width: 64, height: 64 }, fields);
      return lastPixels();
    };

    // Keep exactly the same terrain, lighting inputs except its visible grade.
    fields.slopeX.fill(0);
    fields.slopeY.fill(0);
    fields.relief.fill(0);
    const flat = bake();
    fields.slopeX.fill(0.18);
    const steep = bake();

    const chroma = (data: Uint8ClampedArray) => {
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] - data[i + 1];
      return sum / (data.length / 4);
    };
    expect(chroma(steep) - chroma(flat)).toBeGreaterThan(6);
    expect(map.elevation).toEqual(original);
  });

  it('keeps the same view pixels across adjacent terrain chunks', () => {
    const map = testWorldMap({ tilesX: 32, tilesY: 32 });
    map.seaLevel = 0.24;
    for (let y = 0; y < map.rows!; y++) {
      for (let x = 0; x < map.cols!; x++) {
        map.elevation![y * map.cols! + x] = 0.43 + x * 0.02;
      }
    }
    const fields = buildWhittakerFields(map)!;
    const bake = (x: number, width: number) => {
      bakeWhittakerGround(map, 320, 320, map.seaLevel!, 0,
        { x, y: 64, width, height: 48 }, fields);
      return lastPixels();
    };
    const full = bake(64, 128);
    const first = bake(64, 64);
    const second = bake(128, 64);
    for (let row = 0; row < 48; row++) {
      expect(first.subarray(row * 64 * 4, (row + 1) * 64 * 4))
        .toEqual(full.subarray(row * 128 * 4, (row * 128 + 64) * 4));
      expect(second.subarray(row * 64 * 4, (row + 1) * 64 * 4))
        .toEqual(full.subarray((row * 128 + 64) * 4, (row + 1) * 128 * 4));
    }
  });
});
