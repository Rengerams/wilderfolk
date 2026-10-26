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
    expect(save.worldMap?._generationVersion).toBe(2);
    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const restored = loadGameFromParsed(parsed.parsed)?.world.worldMap;
    expect(restored?.generationVersion).toBe(2);
    expect(restored?.elevation).toEqual(world.worldMap!.elevation);
  }, 240_000);

  it('treats an existing unversioned compact save as the unchanged legacy generator', () => {
    const world = initGame({ seed: 54321, size: MapSize.Medium, preset: MapPreset.BlackForest });
    world.worldMap = generateWorldMap(
      world.width, world.height, world.worldMap!.seed, MapSize.Medium,
      MapPreset.BlackForest, undefined, 1,
    );
    const original = world.worldMap;
    const save = buildSaveData(world, createInitialView(world.width, world.height));
    delete save.worldMap?._generationVersion;
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
