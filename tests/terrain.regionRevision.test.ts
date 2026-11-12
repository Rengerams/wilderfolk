/**
 * GFX-11: a terrain mutation must dirty only the render cells its footprint covers, so a
 * forest-clearing road never disposes every other baked ground chunk.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bumpTerrainRevision,
  getTerrainRevision,
  terrainRegionRevision,
} from '../src/game/terrain/terrainGrid';
import { terrainChunkCacheKeyFor } from '../src/game/terrainLayer';
import { SAND_WATER_OVERLAY_PATH, TERRAIN_ATLAS_PATH } from '../src/game/terrainAtlas';
import { MapPreset, Season } from '../src/game/gameTypes';
import type { WorldMap } from '../src/game/gameTypes';

/** Sprite readiness the bake key must observe; the real loader has no test hook. */
const sprites = vi.hoisted(() => ({ ready: new Set<string>() }));

vi.mock('../src/game/spriteLoader', () => ({
  getSprite: (src: string) => (sprites.ready.has(src) ? ({} as HTMLImageElement) : null),
}));

const CHUNK_A = { left: 0, top: 0, right: 256, bottom: 256 };
const CHUNK_B = { left: 256, top: 0, right: 512, bottom: 256 };

describe('terrain render invalidation', () => {
  beforeEach(() => {
    sprites.ready.clear();
  });

  it('dirties only the cells a local footprint covers', () => {
    const beforeA = terrainRegionRevision(CHUNK_A);
    const beforeB = terrainRegionRevision(CHUNK_B);
    const beforeGlobal = getTerrainRevision();

    bumpTerrainRevision({ left: 40, top: 40, right: 90, bottom: 90 });

    expect(terrainRegionRevision(CHUNK_A)).not.toBe(beforeA);
    expect(terrainRegionRevision(CHUNK_B)).toBe(beforeB);
    expect(getTerrainRevision()).toBe(beforeGlobal + 1);
  });

  it('keeps a footprint touching a chunk edge in its own chunk', () => {
    const beforeB = terrainRegionRevision(CHUNK_B);

    bumpTerrainRevision({ left: 246, top: 10, right: 256, bottom: 40 });

    expect(terrainRegionRevision(CHUNK_B)).toBe(beforeB);
  });

  it('keys the legacy chunk bake on the world identity and its own region', () => {
    const map = {
      seed: 3,
      terrainSeed: 11,
      generationVersion: 4,
      preset: MapPreset.Continental,
      width: 400,
      height: 400,
    } as unknown as WorldMap;
    const key = () => terrainChunkCacheKeyFor(map, Season.Spring, 1, CHUNK_A);

    const first = key();
    expect(terrainChunkCacheKeyFor({ ...map, terrainSeed: 12 }, Season.Spring, 1, CHUNK_A))
      .not.toBe(first);
    expect(terrainChunkCacheKeyFor({ ...map, generationVersion: 3 }, Season.Spring, 1, CHUNK_A))
      .not.toBe(first);

    bumpTerrainRevision({ left: 300, top: 300, right: 320, bottom: 320 });
    expect(key()).toBe(first);
    bumpTerrainRevision({ left: 10, top: 10, right: 20, bottom: 20 });
    expect(key()).not.toBe(first);
  });

  it('changes the global revision for a whole-map mutation without dirtying any chunk', () => {
    const beforeA = terrainRegionRevision(CHUNK_A);
    const beforeGlobal = getTerrainRevision();

    bumpTerrainRevision();

    expect(terrainRegionRevision(CHUNK_A)).toBe(beforeA);
    expect(getTerrainRevision()).toBe(beforeGlobal + 1);
  });

  it('re-bakes a chunk when a lazily loaded material becomes ready', () => {
    const map = {
      seed: 3,
      terrainSeed: 11,
      generationVersion: 4,
      preset: MapPreset.Continental,
      width: 400,
      height: 400,
    } as unknown as WorldMap;

    const procedural = terrainChunkCacheKeyFor(map, Season.Spring, 1, CHUNK_A);
    sprites.ready.add(TERRAIN_ATLAS_PATH);
    const painted = terrainChunkCacheKeyFor(map, Season.Spring, 1, CHUNK_A);
    expect(painted).not.toBe(procedural);

    sprites.ready.add(SAND_WATER_OVERLAY_PATH);
    expect(terrainChunkCacheKeyFor(map, Season.Spring, 1, CHUNK_A)).not.toBe(painted);
  });
});
