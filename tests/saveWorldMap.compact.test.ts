/**
 * Compact save world maps (2026-09-16) — the "savegame failed loading" report.
 *
 * A save stores the valley compactly: `seed`, `preset`, `size` and the map's dimensions,
 * and the terrain is regenerated on load (deterministic from seed + size + preset). The
 * stored dimensions are **tiles** (`WorldMap.width/height` are the tile grid, see
 * `terrainGen`'s return), while `generateWorldMap(width, height, …)` takes **pixels**.
 * The tile counts were passed straight through, so a 1600x1200 px colony reloaded as a
 * 160x120 px valley — 1% of the area, with 1197 of 1202 entities outside the map. It
 * looked like a failed load; it was a silent hundred-fold shrink.
 *
 * These cases pin the dimensions, the regenerated terrain grid, the regenerated terrain,
 * and the symptom that mattered: every entity inside the map.
 */
import { describe, it, expect } from 'vitest';
import { MapSize, TERRAIN_TILE_SIZE } from '../src/game/gameTypes';
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

  // The tile grid is the size the world implies — this is the assertion the bug broke
  // (it came back as ceil(160/10) x ceil(120/10) = 16x12 instead of 160x120).
  expect(restored.width).toBe(Math.ceil(world.width / TERRAIN_TILE_SIZE));
  expect(restored.height).toBe(Math.ceil(world.height / TERRAIN_TILE_SIZE));
  // The old assertion was `restored.tiles.length` / `[0].length`, which was exactly this
  // rectangle. Teraforge keeps no per-tile grid, so the row/column shape it claimed is pinned
  // on the regenerated tile dimensions plus the L0 path grid and L2 continuous-field arrays.
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
    (entity) => entity.x > restored.width * TERRAIN_TILE_SIZE || entity.y > restored.height * TERRAIN_TILE_SIZE,
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
