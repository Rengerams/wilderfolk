import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testWorldMap } from '../src/test/worldMapFixtures';
import {
  TERRAIN_HEIGHT_MESH_MAX_RISE,
  TERRAIN_HEIGHT_MESH_STEP,
  supportsTerrainHeightMesh,
  terrainRiseAt,
} from '../src/game/terrainAtlas';
import { bakeHeightMeshSurface, HEIGHT_MESH_TOP_PAD, unprojectTerrainY } from '../src/game/renderer/heightMesh';
import type { CanvasSurface } from '../src/game/canvasLayer';

const oldOffscreen = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
let triangleDraws = 0;

class FakeCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return {
      imageSmoothingEnabled: false,
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
      closePath() {}, clip() {}, transform() {},
      drawImage() { triangleDraws++; },
    };
  }
}

beforeAll(() => {
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeCanvas;
});
afterAll(() => {
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = oldOffscreen;
});

function gradedMap() {
  const map = testWorldMap({ tilesX: 64, tilesY: 64 });
  map.generationVersion = 3;
  map.seaLevel = 0.24;
  for (let y = 0; y < map.rows!; y++) {
    for (let x = 0; x < map.cols!; x++) {
      map.elevation![y * map.cols! + x] = Math.min(0.97, 0.38 + 0.035 * y + 0.019 * x);
    }
  }
  return map;
}

describe('triangulated 2.5D ground', () => {
  it('projects mountain ground visibly while keeping water at level zero', () => {
    const map = gradedMap();
    expect(supportsTerrainHeightMesh(map)).toBe(true);
    expect(terrainRiseAt(map, 256, 256)).toBeGreaterThan(12);
    expect(terrainRiseAt(map, 256, 256)).toBeLessThanOrEqual(TERRAIN_HEIGHT_MESH_MAX_RISE);
    map.elevation!.fill(0.20);
    expect(terrainRiseAt(map, 256, 256)).toBe(0);
    map.generationVersion = 2;
    expect(supportsTerrainHeightMesh(map)).toBe(false);
  });

  it('inverts the screen projection at steep slopes, chunk edges and both triangle faces', () => {
    const map = gradedMap();
    for (const x of [0, 15, 32, 121, 255, 256, 257, 319, 512]) {
      for (const y of [0, 17, 48, 159, 255, 256, 290, 515]) {
        const projectedY = y - terrainRiseAt(map, x, y);
        expect(unprojectTerrainY(map, x, projectedY)).toBeCloseTo(y, 1);
      }
    }
    expect(TERRAIN_HEIGHT_MESH_STEP).toBeGreaterThan(TERRAIN_HEIGHT_MESH_MAX_RISE);
  });

  it('is continuous at terrain chunk boundaries in both axes', () => {
    const map = gradedMap();
    for (let y = 16; y < 512; y += 13) {
      expect(Math.abs(terrainRiseAt(map, 256 - 1e-4, y)
        - terrainRiseAt(map, 256 + 1e-4, y))).toBeLessThan(0.002);
    }
    for (let x = 16; x < 512; x += 13) {
      expect(Math.abs(terrainRiseAt(map, x, 256 - 1e-4)
        - terrainRiseAt(map, x, 256 + 1e-4))).toBeLessThan(0.002);
    }
  });

  it('projects a ground chunk once as a bounded grid of affine source triangles', () => {
    const map = gradedMap();
    const source = new FakeCanvas(128, 128) as unknown as CanvasSurface;
    triangleDraws = 0;
    const surface = bakeHeightMeshSurface(source, map, {
      x: 256, y: 256, width: 256, height: 256,
    });
    expect(surface.width).toBe(256);
    expect(surface.height).toBe(256 + HEIGHT_MESH_TOP_PAD);
    expect(triangleDraws).toBe(2 * (256 / TERRAIN_HEIGHT_MESH_STEP) ** 2);
  });
});
