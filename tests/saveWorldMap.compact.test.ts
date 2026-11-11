/**
 * A save stores the valley compactly and regenerates the terrain from `seed`/`preset`/`size`: the
 * stored dimensions are tiles, while `generateWorldMap` takes pixels.
 */
import { describe, it, expect } from 'vitest';
import { MapSize, PATH_CELL } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { tileTypeAt } from '../src/game/terrain/terrainGrid';

/** Save → wire → parse → load, exactly as the player's "Save to file" / "Load from file" do. */
function roundTrip(world: ReturnType<typeof initGame>): NonNullable<ReturnType<typeof loadGameFromParsed>> {
  const save = buildSaveData(world, createInitialView(world.width, world.height));
  const parsed = parseSaveJson(JSON.stringify(save));
  expect(parsed.valid).toBe(true);
  if (!parsed.valid) throw new Error('save refused');
  const loaded = loadGameFromParsed(parsed.parsed);
  expect(loaded).not.toBeNull();
  if (!loaded) throw new Error('save did not load');
  return loaded;
}

function expectMapPreserved(world: ReturnType<typeof initGame>): void {
  const loaded = roundTrip(world);
  const original = world.worldMap!;
  const restored = loaded.world.worldMap!;

  // World size in pixels stays what it was.
  expect(loaded.world.width).toBe(world.width);
  expect(loaded.world.height).toBe(world.height);

  // The tile grid sizes from the world's pixels / PATH_CELL, not a coarse ceil over a tile count.
  expect(restored.width).toBe(Math.ceil(world.width / PATH_CELL));
  expect(restored.height).toBe(Math.ceil(world.height / PATH_CELL));
  // The save pins the regenerated tile dimensions plus the L0 path grid and L2 continuous-field arrays.
  expect(restored.width).toBe(original.width);
  expect(restored.height).toBe(original.height);
  expect(restored.pCols).toBe(original.pCols);
  expect(restored.pRows).toBe(original.pRows);
  expect(restored.pathGrid).toHaveLength(original.pathGrid!.length);
  expect(restored.cols).toBe(original.cols);
  expect(restored.rows).toBe(original.rows);
  expect(restored.seed).toBe(original.seed);
  expect(restored.size).toBe(original.size);
  expect(restored.preset).toBe(original.preset);

  // The terrain itself is regenerated deterministically, tile for tile.
  let mismatchedTiles = 0;
  for (let ty = 0; ty < original.height; ty++) {
    for (let tx = 0; tx < original.width; tx++) {
      if (tileTypeAt(original, tx, ty) !== tileTypeAt(restored, tx, ty)) mismatchedTiles++;
    }
  }
  expect(mismatchedTiles).toBe(0);

  // The symptom the player saw: almost everything stood outside the map.
  const outside = loaded.world.entities.filter(
    (entity) => entity.x > restored.width * PATH_CELL || entity.y > restored.height * PATH_CELL,
  );
  expect(outside.map((entity) => entity.id)).toEqual([]);
}

describe('compact saves restore the valley at the right scale', () => {
  it('keeps a preset map (large) at its full size', () => {
    expectMapPreserved(initGame({ seed: 407992, size: MapSize.Large }));
  });

  it('keeps the default map (medium) at its full size', () => {
    expectMapPreserved(initGame({ seed: 12345 }));
  });

  it('keeps a custom-sized map at its full size', () => {
    expectMapPreserved(initGame({ seed: 777, width: 640, height: 480 }));
  });
});
