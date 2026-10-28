import { describe, expect, it } from 'vitest';
import { MapPreset, MapSize } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { generateWorldMap } from '../src/game/terrainGen';
import { tileTypeAt } from '../src/game/terrain/terrainGrid';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

describe('compact map generation revision', () => {
  it('preserves the new landscape after saving and loading', () => {
    const world = initGame({ seed: 34567, size: MapSize.Medium, preset: MapPreset.Oasis });
    const save = buildSaveData(world, createInitialView(world.width, world.height));
    const compact = save.worldMap as { _generationVersion?: number };
    expect(compact._generationVersion).toBe(4);
    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const restored = loadGameFromParsed(parsed.parsed)?.world.worldMap;
    expect(restored?.generationVersion).toBe(4);
    expect(restored?.elevation).toEqual(world.worldMap!.elevation);
  }, 240_000);

  it('preserves revision-three saved rivers and forests rather than replaying v4', () => {
    const world = initGame({ seed: 54321, size: MapSize.Medium, preset: MapPreset.Highland });
    world.worldMap = generateWorldMap(
      world.width, world.height, world.worldMap!.seed, MapSize.Medium,
      MapPreset.Highland, undefined, 3,
    );
    const oldMap = world.worldMap;
    const save = buildSaveData(world, createInitialView(world.width, world.height));
    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const loaded = loadGameFromParsed(parsed.parsed)?.world.worldMap;
    expect(loaded?.generationVersion).toBe(3);
    expect(loaded?.elevation).toEqual(oldMap.elevation);
    expect(loaded?.decorations).toEqual(oldMap.decorations);
  }, 240_000);

  it('regenerates a revision-two compact save using its original recipe', () => {
    const world = initGame({ seed: 1234, size: MapSize.Medium, preset: MapPreset.Rivers });
    world.worldMap = generateWorldMap(
      world.width, world.height, world.worldMap!.seed, MapSize.Medium,
      MapPreset.Rivers, undefined, 2,
    );
    const save = buildSaveData(world, createInitialView(world.width, world.height));
    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const restored = loadGameFromParsed(parsed.parsed)?.world.worldMap;
    expect(restored?.generationVersion).toBe(2);
    expect(restored?.elevation).toEqual(world.worldMap.elevation);
    expect(restored?.riverDist).toEqual(world.worldMap.riverDist);
  }, 240_000);

  it('treats an existing unversioned compact save as the unchanged legacy generator', () => {
    const world = initGame({ seed: 54321, size: MapSize.Medium, preset: MapPreset.BlackForest });
    world.worldMap = generateWorldMap(
      world.width, world.height, world.worldMap!.seed, MapSize.Medium,
      MapPreset.BlackForest, undefined, 1,
    );
    const original = world.worldMap;
    const save = buildSaveData(world, createInitialView(world.width, world.height));
    const compact = save.worldMap as { _generationVersion?: number };
    delete compact._generationVersion;
    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const restored = loadGameFromParsed(parsed.parsed)?.world.worldMap;
    expect(restored?.generationVersion).toBe(1);
    expect(restored?.elevation).toEqual(original!.elevation);
    for (let ty = 0; ty < original!.height; ty += 10) {
      for (let tx = 0; tx < original!.width; tx += 10) {
        expect(tileTypeAt(restored!, tx, ty)).toBe(tileTypeAt(original!, tx, ty));
      }
    }
  }, 240_000);
});
