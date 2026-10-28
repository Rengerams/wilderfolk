import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MapPreset, MapSize } from '../src/game/gameTypes';
import { generateRawTerrain } from '../src/game/terrain/terragen';
import { WATER_CELL } from '../src/game/terrain/terrainGrid';
import { bakeWhittakerGround, buildWhittakerFields } from '../src/game/renderer/whittakerTerrain';

type Image = { data: Uint8ClampedArray; width: number; height: number };
let captured: Image | null = null;
const oldDocument = (globalThis as { document?: unknown }).document;

beforeAll(() => {
  const ctx = {
    createImageData: (width: number, height: number): Image => ({
      width, height, data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (image: Image) => { captured = image; },
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = oldDocument;
});

describe('revision-three river surface details', () => {
  it('derives deterministic flow from existing river paths without editing gameplay water', () => {
    const map = generateRawTerrain(1280, 960, 1234, MapSize.Medium, MapPreset.Rivers);
    const originalWater = Float32Array.from(map.riverDist!);
    const a = buildWhittakerFields(map)!;
    const b = buildWhittakerFields(map)!;
    expect(a.riverPhase).toEqual(b.riverPhase);
    expect(a.riverFlowMask).toEqual(b.riverFlowMask);
    expect(a.riverRapids).toEqual(b.riverRapids);
    expect(map.riverDist).toEqual(originalWater);

    let directedWaterCells = 0;
    for (let i = 0; i < originalWater.length; i++) {
      const assigned = a.riverFlowMask[i];
      if (assigned === 0) continue;
      expect(originalWater[i]).toBeGreaterThan(0.32);
      expect(assigned).toBe(1);
      expect(a.riverPhase[i]).toBeGreaterThanOrEqual(0);
      if (originalWater[i] > 0.55) directedWaterCells++;
    }
    expect(directedWaterCells).toBeGreaterThan(20);

    // The render-only effects do not alter the appearance path of compact v1/v2 saves.
    const old = buildWhittakerFields({ ...map, generationVersion: 2 })!;
    expect(old.riverFlowMask.every((v) => v === 0)).toBe(true);
    expect(old.riverRapids.every((v) => v === 0)).toBe(true);
  }, 120_000);

  it('localizes waterfall riffles and bakes identically across adjoining chunks', () => {
    const map = generateRawTerrain(1280, 960, 1234, MapSize.Medium, MapPreset.Rivers);
    map.waterfalls = [];
    const plain = buildWhittakerFields(map)!;
    const waterCols = map.waterCols!;
    const waterRows = map.waterRows!;
    let candidate = -1;
    for (let y = 6; y < waterRows - 6 && candidate === -1; y++) {
      for (let x = 6; x < waterCols - 6; x++) {
        const i = y * waterCols + x;
        if (map.riverDist![i] > 0.75 && plain.riverFlowMask[i] === 1) {
          candidate = i;
          break;
        }
      }
    }
    expect(candidate).toBeGreaterThanOrEqual(0);
    if (candidate < 0) return;
    const cx = ((candidate % waterCols) + 0.5) * WATER_CELL;
    const cy = (Math.floor(candidate / waterCols) + 0.5) * WATER_CELL;
    map.waterfalls = [{ x: cx, y: cy, w: 12, drop: 0.2 }];
    const rapid = buildWhittakerFields(map)!;
    expect(plain.riverRapids[candidate]).toBe(0);
    expect(rapid.riverRapids[candidate]).toBeGreaterThan(0.5);
    expect(rapid.riverRapids[0]).toBe(0);

    const bake = (fields: typeof rapid, x: number, y: number, width: number, height: number): Image => {
      captured = null;
      bakeWhittakerGround(map, 1280, 960, map.seaLevel!, map.moistureBias ?? 0,
        { x, y, width, height }, fields);
      if (!captured) throw new Error('missing ground pixels');
      return captured;
    };
    // Two adjacent 48px chunks must be byte-identical to the corresponding full-width crop.
    const x = Math.floor(cx - 48);
    const y = Math.floor(cy - 24);
    const whole = bake(rapid, x, y, 96, 48);
    let paintedDifference = 0;
    const noRapids = bake(plain, x, y, 96, 48);
    for (let i = 0; i < whole.data.length; i++) {
      if (whole.data[i] !== noRapids.data[i]) paintedDifference++;
    }
    expect(paintedDifference).toBeGreaterThan(0);
    for (let half = 0; half < 2; half++) {
      const chunk = bake(rapid, x + 48 * half, y, 48, 48);
      for (let row = 0; row < 48; row++) {
        const actual = chunk.data.subarray(row * 48 * 4, (row + 1) * 48 * 4);
        const expected = whole.data.subarray((row * 96 + half * 48) * 4, (row * 96 + half * 48 + 48) * 4);
        expect(actual).toEqual(expected);
      }
    }
  }, 120_000);
});
