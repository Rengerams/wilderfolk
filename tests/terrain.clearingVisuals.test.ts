import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MapPreset, MapSize, TerrainType, type WorldMap } from '../src/game/gameTypes';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { setTileOverride } from '../src/game/terrain/terrainGrid';

interface CapturedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const captured: { image: CapturedImage | null } = { image: null };
const originalDocument = (globalThis as { document?: unknown }).document;

beforeAll(() => {
  const ctx = {
    createImageData: (width: number, height: number): CapturedImage => ({
      data: new Uint8ClampedArray(width * height * 4), width, height,
    }),
    putImageData: (image: CapturedImage) => { captured.image = image; },
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

async function bake(map: WorldMap, x: number, y: number, width: number, height: number): Promise<CapturedImage> {
  const { bakeWhittakerGround } = await import('../src/game/renderer/whittakerTerrain');
  captured.image = null;
  const surface = bakeWhittakerGround(map, 1280, 960, map.seaLevel ?? 0.24,
    map.moistureBias ?? 0, { x, y, width, height }, undefined, 1);
  expect(surface).not.toBeNull();
  if (!captured.image) throw new Error('ground bake wrote no pixels');
  return captured.image;
}

function pixel(img: CapturedImage, x: number, y: number): number[] {
  const at = (y * img.width + x) * 4;
  return Array.from(img.data.slice(at, at + 3));
}

describe('camp clearing ground presentation', () => {
  it('paints a grassland override as land, not the unchanged snowy mountain field', async () => {
    const map = generateRawTerrain(1280, 960, 731, MapSize.Medium, MapPreset.BlackForest, undefined, 4);
    map.elevation!.fill(0.95);
    map.temperature!.fill(0.1);
    map.moisture!.fill(0.8);
    map.riverDist!.fill(0);

    const before = await bake(map, 608, 448, 64, 64);
    for (let ty = 46; ty <= 50; ty++) {
      for (let tx = 62; tx <= 66; tx++) {
        setTileOverride(map, tx, ty, {
          type: TerrainType.Grassland, elevation: 48, moisture: 45, variation: 0.5,
        });
      }
    }
    const after = await bake(map, 608, 448, 64, 64);
    const [oldRed, oldGreen] = pixel(before, 32, 32);
    const [newRed, newGreen] = pixel(after, 32, 32);
    expect(newGreen - newRed).toBeGreaterThan(oldGreen - oldRed + 10);
    expect(pixel(after, 0, 0)).toEqual(pixel(before, 0, 0));

    const neighbouringChunk = await bake(map, 640, 448, 32, 64);
    expect(pixel(neighbouringChunk, 0, 32)).toEqual(pixel(after, 32, 32));
  }, 30_000);
});
